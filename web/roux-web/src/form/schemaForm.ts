import { evaluate, type FormOptions, type StandardSchemaV1 } from "@tanstack/react-form";
import { useMutation, useQueryClient, type UseMutationOptions } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
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
  /** Saves the schema's parsed output; read afresh at every render, so a new `version` is the one sent. */
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

/**
 * A create or edit form from a Zod schema and the mutation that saves it:
 *
 *   const form = useSchemaForm({
 *     schema: customerRequestSchema,
 *     defaultValues: customer ?? { name: "", email: "", company: "" },
 *     mutation: customer ? updateCustomer(customer.id, customer.version) : createCustomer,
 *     onSuccess: (saved) => notify.success(`${saved.name} was saved`),
 *   });
 *
 * The schema validates on blur and on submit; a submit sends the schema's parsed output (trimmed,
 * `""` as `null`). A 400's field errors go under their fields, and any it cannot place, like every
 * other refusal, are toasted under `failure`; a lost session (401) shows nothing. After a save the
 * saved values become the form's defaults: it is clean, and Reset goes back to them. The form stays
 * submitting until the mutation's `meta.refreshes` have refetched, and a submit while one is out
 * sends nothing. A conflict (409) that the refreshes answer with a changed record starts the form
 * over from it: the draft is dropped, so the next save cannot quietly undo whoever saved first. A
 * 409 that changes nothing (a create refused as a duplicate) keeps what was typed.
 */
export function useSchemaForm<S extends FormSchema, TData>(options: SchemaFormOptions<S, TData>): SchemaForm<S> {
  const { schema, defaultValues, mutation, onSuccess, failure = "Could not save" } = options;
  const queryClient = useQueryClient();
  const { mutateAsync } = useMutation(mutation);
  const listeners = useRef(new Set<() => void>());
  const pending = useRef<Promise<void> | undefined>(undefined);

  // The caller's latest defaults (for `restart`), and the form's own: the saved values after a save,
  // until the caller's change (a refetched record). TanStack Form puts an untouched form back to the
  // defaults it is given whenever they change, so it must be given the form's own, or a save would
  // snap back to a create's blanks.
  const latestDefaults = useRef(defaultValues);
  const formDefaults = useRef(defaultValues);
  if (!evaluate(latestDefaults.current, defaultValues)) {
    formDefaults.current = defaultValues;
  }
  latestDefaults.current = defaultValues;

  /** Back to the caller's latest defaults: a dialog's fresh start, or the record a conflict refreshed. */
  function restart(): void {
    conflictFrom.current = undefined;
    formDefaults.current = latestDefaults.current;
    form.reset(latestDefaults.current);
  }

  // After a conflict (409), the defaults the refused save was made from and the draft it sent.
  // Someone else saved first; when the mutation's refreshes bring their record (new defaults, which
  // can render a little after the refusal), the form starts over from it, or the next save would
  // send this draft at the new version and undo their change. A 409 that brings no new record (a
  // create refused as a duplicate) keeps what was typed. The note is used up once the draft is
  // edited, or the form is submitted again, saved or restarted, so a record that changes later (a
  // refetch on focus) never wipes work done since the refusal.
  const conflictFrom = useRef<{ defaults: z.input<S>; draft: unknown } | undefined>(undefined);
  function restartIfRefreshed(): void {
    const conflict = conflictFrom.current;
    // An edited draft is a new object, never the refused one again: the note is spent.
    if (
      conflict !== undefined &&
      form.state.values === conflict.draft &&
      !evaluate(latestDefaults.current, conflict.defaults)
    ) {
      restart();
    }
  }
  // Checked after every render: the refusal's toast and the mutation's move to `error` render this
  // hook once the conflict is noted, whether the refreshed record rendered before or arrives later.
  useEffect(restartIfRefreshed);

  const validator: SchemaValidator<S> = schema;
  const form = useSchemaAppForm<S>({
    defaultValues: formDefaults.current,
    validators: { onBlur: validator, onSubmit: validator },
    // A second submit while one is out (Enter pressed twice) waits for the first instead of sending.
    onSubmit: ({ value }) => (pending.current ??= save(value).finally(() => (pending.current = undefined))),
  });

  async function save(value: z.input<S>): Promise<void> {
    assertRefreshesHonoured(queryClient, mutation);
    const parsed = schema.parse(value);
    const submittedFrom = latestDefaults.current;
    const draft = form.state.values;
    conflictFrom.current = undefined;
    let data: TData;
    try {
      data = await mutateAsync(parsed);
    } catch (error) {
      // Before the toast: showing it can render this hook at once, and that render must see the conflict.
      if (error instanceof ApiError && error.status === 409) {
        conflictFrom.current = { defaults: submittedFrom, draft };
      }
      showRefusal(error);
      return;
    }
    await onSuccess?.(data, parsed);
    conflictFrom.current = undefined;
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
