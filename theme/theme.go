// Package theme is the owner's look for the app: its name, palette, brand colour,
// corner shape and fonts, kept in one database row and served at /api/roux/theme.
// Whatever the owner has not chosen is the application's default, so the answer is
// always a whole theme. The page itself carries the saved theme too (see kit/spa),
// so the first paint already looks right.
//
//	GET /api/roux/theme   anyone, signed out too: the page needs it before sign-in
//	PUT /api/roux/theme   whoever holds theme.manage, from the version they read
package theme

import (
	"context"
	"embed"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/problem"
	"github.com/jwcarman/roux/spa"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the theme's schema. It runs after the roles, whose OWNER it grants
// ThemeManage.
var Migration = pgdb.Migration{Name: "roux-theme", FS: migrations, Dir: "migrations", After: []string{"roux-authz"}}

// Path is where the theme is served.
const Path = "/api/roux/theme"

// ThemeManage lets someone change the theme. The migration grants it to OWNER.
const ThemeManage = "theme.manage"

var rowID = uuid.UUID{15: 1} // 00000000-0000-0000-0000-000000000001

// Response is the theme as the API answers it: every part, the owner's or the
// application's default, and the version an edit must send back (0 until the owner
// first saves).
type Response struct {
	AppName     string `json:"appName"`
	Palette     string `json:"palette"`
	BrandColor  string `json:"brandColor"`
	Shape       string `json:"shape"`
	HeadingFont string `json:"headingFont"`
	BodyFont    string `json:"bodyFont"`
	Version     int64  `json:"version"`
}

// Request is the owner's new theme, edited from Version. Members are pointers so that
// one left out is told apart from one that is blank.
type Request struct {
	AppName     *string `json:"appName"`
	Palette     *string `json:"palette"`
	BrandColor  *string `json:"brandColor"`
	Shape       *string `json:"shape"`
	HeadingFont *string `json:"headingFont"`
	BodyFont    *string `json:"bodyFont"`
	Version     *int64  `json:"version"`
}

// Service reads and changes the theme.
type Service struct {
	Pool     *pgxpool.Pool
	Defaults spa.Theme // for every part the owner has not chosen
	Clock    func() time.Time
}

type row struct {
	version                                                int64
	appName, palette, brandColor, shape, headingFont, body *string
}

func or(chosen *string, fallback string) string {
	if chosen != nil {
		return *chosen
	}
	return fallback
}

func (s Service) response(r row) Response {
	return Response{
		AppName: or(r.appName, s.Defaults.AppName), Palette: or(r.palette, s.Defaults.Palette),
		BrandColor: or(r.brandColor, s.Defaults.BrandColor), Shape: or(r.shape, s.Defaults.Shape),
		HeadingFont: or(r.headingFont, s.Defaults.HeadingFont), BodyFont: or(r.body, s.Defaults.BodyFont),
		Version: r.version,
	}
}

// Current is the theme as it looks now, and the version an edit must be made from.
func (s Service) Current(ctx context.Context) (Response, error) {
	var r row
	err := s.Pool.QueryRow(ctx,
		`select version, app_name, palette, brand_color, shape, heading_font, body_font from roux_theme where id = $1`, rowID,
	).Scan(&r.version, &r.appName, &r.palette, &r.brandColor, &r.shape, &r.headingFont, &r.body)
	if errors.Is(err, pgx.ErrNoRows) {
		return Response{}, errors.New("theme: roux_theme has no row: the theme migration has not run")
	}
	if err != nil {
		return Response{}, err
	}
	return s.response(r), nil
}

// Shell is Current as the page carries it: for spa.Config.Theme.
func (s Service) Shell(ctx context.Context) (spa.Theme, error) {
	c, err := s.Current(ctx)
	if err != nil {
		return spa.Theme{}, err
	}
	return spa.Theme{AppName: c.AppName, Palette: c.Palette, BrandColor: c.BrandColor, Shape: c.Shape, HeadingFont: c.HeadingFont, BodyFont: c.BodyFont}, nil
}

// validate checks the request the way roux does and returns the theme it describes.
// Every member is required (a missing one is "Must not be empty", a missing or blank
// name "Must not be blank"); a member that was sent must also have a value the
// front end knows. The name is checked as sent, then stripped; the colour is
// lower-cased.
func validate(req Request) (spa.Theme, error) {
	var v []problem.Violation
	required := func(field string, p *string) string {
		if p == nil {
			v = append(v, problem.Violation{Field: field, Message: problem.MustNotBeEmpty})
			return ""
		}
		return *p
	}
	t := spa.Theme{
		AppName:     or(req.AppName, ""),
		Palette:     required("palette", req.Palette),
		BrandColor:  required("brandColor", req.BrandColor),
		Shape:       required("shape", req.Shape),
		HeadingFont: required("headingFont", req.HeadingFont),
		BodyFont:    required("bodyFont", req.BodyFont),
	}
	if req.Version == nil {
		v = append(v, problem.Violation{Field: "version", Message: problem.MustNotBeEmpty})
	}
	sent := map[string]bool{
		"appName": true, // a missing name is as blank as an empty one
		"palette": req.Palette != nil, "brandColor": req.BrandColor != nil, "shape": req.Shape != nil,
		"headingFont": req.HeadingFont != nil, "bodyFont": req.BodyFont != nil,
	}
	for _, bad := range t.Violations() {
		if sent[bad.Field] {
			v = append(v, bad)
		}
	}
	if len(v) > 0 {
		return spa.Theme{}, problem.Validation(v...)
	}
	t.AppName = strings.TrimSpace(t.AppName)
	t.BrandColor = strings.ToLower(t.BrandColor)
	return t, nil
}

// Update saves the owner's theme, if the request's version is still current.
func (s Service) Update(ctx context.Context, req Request, actor uuid.UUID) (Response, error) {
	t, err := validate(req)
	if err != nil {
		return Response{}, err
	}
	now := time.Now()
	if s.Clock != nil {
		now = s.Clock()
	}
	// One statement checks the version and bumps it, so two saves from the same
	// version cannot both win.
	tag, err := s.Pool.Exec(ctx, `
		update roux_theme
		   set app_name = $3, palette = $4, brand_color = $5, shape = $6, heading_font = $7, body_font = $8,
		       version = version + 1, modified_date = $9, modified_by = $10
		 where id = $1 and version = $2`,
		rowID, *req.Version, t.AppName, t.Palette, t.BrandColor, t.Shape, t.HeadingFont, t.BodyFont, now, actor.String())
	if err != nil {
		return Response{}, err
	}
	if tag.RowsAffected() == 0 {
		return Response{}, problem.StaleVersion()
	}
	return s.Current(ctx)
}

// Register serves the theme: GET for anyone, PUT for whoever holds theme.manage.
func Register(mux *api.Mux, host *authn.Host, svc Service) {
	mux.HandleRoux("GET "+Path, host.Open(func(w http.ResponseWriter, r *http.Request) error {
		c, err := svc.Current(r.Context())
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, c)
	}))
	mux.HandleRoux("PUT "+Path, host.Guard(ThemeManage, func(w http.ResponseWriter, r *http.Request) error {
		var req Request
		if err := api.DecodeLenient(r, &req); err != nil {
			return err
		}
		c, err := svc.Update(r.Context(), req, authn.PrincipalFrom(r.Context()).IdentityID)
		if err != nil {
			return err
		}
		return api.JSON(w, http.StatusOK, c)
	}))
}
