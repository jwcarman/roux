import { evaluate, useSelector, type FormOptions, type StandardSchemaV1 } from "@tanstack/react-form";
import { useMutation, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { z } from "zod";
import { ApiError } from "../api/client";
import { assertRefreshesHonoured, refusalToast } from "../api/serverAction";
import { notify } from "../feedback/notify";
import { placeServerErrors, useAppForm } from "./form";

/** A form's schema: a Zod object (possibly refined) from the form's values to the request it sends. */
type FormSchema = z.ZodType<Record<string, unknown>, Record<string, unknown>>;

/** What `useSchemaForm` needs: the schema, where the form starts, and the mutation that saves it. */
export interface SchemaFormOptions<S extends FormSchema, TData> {
  /** Validates on blur and on submit (form-level, so a `.refine()` lands on its path) and parses what is sent. */
  schema: S;
  /** The values the form starts with (and `restart` goes back to): the record being edited, or a create's blanks. */
  defaultValues: z.input<S>;
  /**
   * Saves the schema's parsed output. A save is sent with the mutation given when its draft started
   * (the latest render's while the form is untouched), so at the `version` the draft was made from.
   */
  mutation: UseMutationOptions<TData, Error, z.output<S>>;
  /** Runs once the save succeeds (after the mutation's `meta.refreshes` have refetched), with the server's answer. */
  onSuccess?: (data: TData, values: z.output<S>) => void | Promise<void>;
  /** The toast title when the save is refused. Defaults to `Could not save`. */
  failure?: string;
}

/** The schema `S` as TanStack Form's form-level validator of the form's values. */
type SchemaValidator<S extends FormSchema> = StandardSchemaV1<z.input<S>, z.output<S>>;

/** The `useAppForm` form `useSchemaForm` builds, validated by the schema `S`. */
type SchemaAppForm<S extends FormSchema> = ReturnType<typeof useSchemaAppForm<S>>;

/** `useAppForm` for a form validated on blur and on submit by the schema `S`, with no submit meta. */
function useSchemaAppForm<S extends FormSchema>(
  options: FormOptions<
    z.input<S>,
    undefined,
    undefined,
    undefined,
    SchemaValidator<S>,
    undefined,
    SchemaValidator<S>,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >,
) {
  return useAppForm(options);
}

/** A `useAppForm` form that saves through a mutation, as `useSchemaForm` returns it. */
export type SchemaForm<S extends FormSchema> = SchemaAppForm<S> & {
  /** Resets to the latest `defaultValues` passed to the hook (a dialog's fresh start). */
  restart: () => void;
  /** Calls `listener` after each successful save (after `onSuccess`); returns the unsubscribe. */
  onSaved: (listener: () => void) => () => void;
};

/** Where a draft started: the caller's defaults and mutation at the time, which its save is sent with. */
interface Start<S extends FormSchema, TData> {
  defaults: z.input<S>;
  mutation: UseMutationOptions<TData, Error, z.output<S>>;
}

/**
 * A create or edit form from a Zod schema and the mutation that saves it:
 *
 *   const form = useSchemaForm({
 *     schema: customerRequestSchema,
 *     defaultValues: customer
 *       ? { name: customer.name, email: customer.email, company: inputOf(customer.company) }
 *       : { name: "", email: "", company: "" },
 *     mutation: customer ? updateCustomer(customer.id, customer.version) : createCustomer,
 *     onSuccess: (saved) => notify.success(`${saved.name} was saved`),
 *   });
 *
 * The schema validates on blur and on submit; a submit sends the schema's parsed output (trimmed,
 * `""` as `null`). A 400's field errors go under their fields, and any it cannot place, like every
 * other refusal, are toasted under `failure`; a lost session (401) shows nothing. After a save the
 * saved values become the form's defaults: it is clean, and Reset goes back to them. The form stays
 * submitting until the mutation's `meta.refreshes` have refetched, and a submit while one is out
 * sends nothing.
 *
 * A save is sent with the mutation the draft started from (so at the version the record was read
 * at), even when a refetch has brought a newer record while it was being edited: the server then
 * answers 409 rather than the draft quietly undoing whoever saved first. A 409 starts the form over
 * from the caller's record when it differs from the one the draft started from (the refreshes, or
 * that earlier refetch, brought theirs); a 409 that changes nothing (a create refused as a
 * duplicate) keeps what was typed.
 */
export function useSchemaForm<S extends FormSchema, TData>(options: SchemaFormOptions<S, TData>): SchemaForm<S> {
  const { schema, defaultValues, mutation, onSuccess, failure = "Could not save" } = options;
  const queryClient = useQueryClient();
  const listeners = useRef(new Set<() => void>());
  const pending = useRef<Promise<void> | undefined>(undefined);

  // The caller's latest defaults and mutation, for `restart` and the end of a save, which outlive
  // the render that made them.
  const given: Start<S, TData> = { defaults: defaultValues, mutation };
  const latest = useRef(given);
  useLayoutEffect(() => {
    latest.current = given;
  });

  // The form's own defaults: the saved values after a save, until the caller's change (a refetched
  // record). TanStack Form puts an untouched form back to the defaults it is given whenever they
  // change, so it must be given the form's own, or a save would snap back to a create's blanks.
  const formDefaults = useRef(defaultValues);
  if (!evaluate(latest.current.defaults, defaultValues)) {
    formDefaults.current = defaultValues;
  }

  const validator: SchemaValidator<S> = schema;
  const form = useSchemaAppForm<S>({
    defaultValues: formDefaults.current,
    validators: { onBlur: validator, onSubmit: validator },
    // A second submit while one is out (Enter pressed twice) waits for the first instead of sending.
    onSubmit: ({ value }) => (pending.current ??= save(value).finally(() => (pending.current = undefined))),
  });

  // Where the draft started, which its save is sent with. An untouched form shows the caller's
  // defaults (TanStack Form follows them), so its draft starts afresh at each render; once touched,
  // the draft keeps its start until a save or `restart` puts the form back to untouched, which
  // renders this hook again (it watches `isTouched`) and so starts the next draft.
  const started = useRef(given);
  if (!useSelector(form.store, (state) => state.isTouched)) {
    started.current = given;
  }
  const { mutateAsync } = useMutation(started.current.mutation);

  /** Back to the caller's latest defaults: a dialog's fresh start, or the record a conflict refreshed. */
  function restart(): void {
    formDefaults.current = latest.current.defaults;
    form.reset(latest.current.defaults);
  }

  // After a conflict (409), the draft the refused save sent. When the caller's record differs from
  // the one the draft started from (now, or once the refreshes render it, which can be a little
  // after the refusal), the form starts over from it. The note is spent by an edit (a new values
  // object, never the refused one again) or by the next submit, so a record that changes later (a
  // refetch on focus) never wipes work done since the refusal.
  const refused = useRef<unknown>(undefined);
  // Checked after every render: the mutation's move to `error` renders this hook once the conflict
  // is noted, whether the refreshed record rendered before or arrives later.
  useEffect(() => {
    if (form.state.values === refused.current && !evaluate(defaultValues, started.current.defaults)) {
      restart();
    }
  });

  async function save(value: z.input<S>): Promise<void> {
    assertRefreshesHonoured(queryClient, started.current.mutation);
    const parsed = schema.parse(value);
    refused.current = undefined;
    let data: TData;
    try {
      data = await mutateAsync(parsed);
    } catch (error) {
      // Before the toast: showing it can render this hook at once, and that render must see the conflict.
      if (error instanceof ApiError && error.status === 409) {
        // TanStack Form submits the form's own values object: an edit since would replace it.
        refused.current = value;
      }
      showRefusal(error);
      return;
    }
    await onSuccess?.(data, parsed);
    formDefaults.current = value;
    form.reset(value);
    listeners.current.forEach((listener) => listener());
  }

  function showRefusal(error: unknown): void {
    if (error instanceof ApiError && error.status === 400 && error.problem.errors !== undefined) {
      const unplaced = placeServerErrors(form, error.problem);
      if (unplaced.length > 0) {
        notify.error(failure, unplaced.join(" "));
      }
      return;
    }
    refusalToast(error, failure);
  }

  // Made once: TanStack Form's form keeps its identity from render to render, and so does this.
  const [schemaForm] = useState(() =>
    Object.assign(form, {
      restart,
      onSaved: (listener: () => void) => {
        listeners.current.add(listener);
        return () => {
          listeners.current.delete(listener);
        };
      },
    }),
  );
  return schemaForm;
}
