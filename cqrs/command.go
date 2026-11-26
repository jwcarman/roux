package cqrs

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/problem"
)

// Input is a command's input as it arrives: Validate answers the clean input, or
// problem.Validation with each violation's Field the input's JSON member it is about.
type Input[I any] interface {
	Validate() (I, error)
}

// Command is a typed change. Run gets a transaction the command log shares, so an
// Idempotency-Key is recorded only when the change commits.
type Command[I Input[I], O any] struct {
	Name       string
	Permission string
	// Emits names the events a success means; screens refetch the queries that depend on them.
	Emits []string
	Run   func(ctx context.Context, tx pgx.Tx, caller *authn.Principal, in I) (O, error)
}

// Answer is what a command answers.
type Answer[O any] struct {
	Result O        `json:"result"`
	Events []string `json:"events"`
}

func (c Command[I, O]) Describe() Description {
	return Description{Kind: KindCommand, Name: c.Name, Permission: c.Permission, Events: c.Emits,
		In: reflect.TypeFor[I](), Out: reflect.TypeFor[O]()}
}

// IdempotencyKey is the header a client sends to make a command safe to repeat: a UUID per attempt.
const IdempotencyKey = "Idempotency-Key"

func (c Command[I, O]) register(k *app.Kit) {
	k.Handle("POST /api/commands/"+c.Name, c.Permission, func(w http.ResponseWriter, r *http.Request) error {
		var raw I
		if err := api.Decode(r, &raw); err != nil {
			return err
		}
		in, err := raw.Validate()
		if err != nil {
			return err
		}
		var key *uuid.UUID
		if h := r.Header.Get(IdempotencyKey); h != "" {
			parsed, err := uuid.Parse(h)
			if err != nil {
				return problem.BadRequest("The Idempotency-Key header must be a UUID")
			}
			key = &parsed
		}
		caller := authn.PrincipalFrom(r.Context())
		var answer Answer[O]
		replayed := false
		err = pgx.BeginFunc(r.Context(), k.Pool, func(tx pgx.Tx) error {
			if key != nil {
				// A second request with the key waits here until the first commits or rolls back.
				tag, err := tx.Exec(r.Context(), `insert into command_log (key, name, caller) values ($1, $2, $3) on conflict do nothing`,
					*key, c.Name, caller.IdentityID)
				if err != nil {
					return err
				}
				if tag.RowsAffected() == 0 {
					replayed = true
					var stored []byte
					var name string
					var owner uuid.UUID
					if err := tx.QueryRow(r.Context(), `select name, caller, result from command_log where key = $1`, *key).Scan(&name, &owner, &stored); err != nil {
						return err
					}
					if owner != caller.IdentityID {
						return problem.Conflict("This Idempotency-Key was used by someone else; send a new one (a fresh UUID per attempt)")
					}
					if name != c.Name {
						return problem.Conflict("This Idempotency-Key was used for another command")
					}
					return json.Unmarshal(stored, &answer)
				}
			}
			out, err := c.Run(r.Context(), tx, caller, in)
			if err != nil {
				return err
			}
			answer = Answer[O]{Result: out, Events: c.Emits}
			if key != nil {
				stored, err := json.Marshal(answer)
				if err != nil {
					return err
				}
				_, err = tx.Exec(r.Context(), `update command_log set result = $2 where key = $1`, *key, stored)
				return err
			}
			return nil
		})
		var p *problem.Problem
		if errors.As(err, &p) {
			return p
		}
		if err != nil {
			return err
		}
		if replayed {
			w.Header().Set("Idempotent-Replayed", "true")
		}
		return api.JSON(w, http.StatusOK, answer)
	})
}
