import { z } from "zod";

/*
 * Rule helpers for a form's Zod schema, in the server's words: each message is the one in
 * ContributorValidationMessages.properties, so a field reads the same whether the browser or the
 * server caught the mistake. Messages never name the field; they sit under its label.
 *
 * Each helper is a small builder: its state (`required`, a limit, a format) is rebuilt into a fresh
 * Zod schema at every step, and that schema, the object the helper returns, is the one registered
 * in `fieldRules`.
 */

// Zod otherwise probes `eval` to speed up object parsing, which a Content-Security-Policy without
// `unsafe-eval` records as a violation on every page. Listed in package.json's "sideEffects".
z.config({ jitless: true });

const NOT_BLANK = "Must not be blank";
const NOT_EMPTY = "Must not be empty";
const NOT_EXPECTED_FORMAT = "Is not in the expected format";
const NOT_EMAIL = "Must be a valid email address";
const NOT_WEB_ADDRESS = "Must be a valid web address";
const NOT_WHOLE = "Must be a whole number";
const NOT_IN_FUTURE = "Must not be in the future";

/** What a field's schema says about the field, for the field to show (an asterisk, a `maxLength`). */
export interface FieldRule {
  /** The field must be filled in (the schema has no `.optional()`). */
  required: boolean;
  /** The longest text the field takes (`.max(n)`). */
  maxLength?: number;
}

/** The rule of every schema the helpers here build, looked up by the schema in an object's `shape`. */
export const fieldRules: z.core.$ZodRegistry<FieldRule> = z.registry<FieldRule>();

/** A schema built here, with roux's methods in place of Zod's of the same name. */
type Rule<Out, In, Methods> = Omit<z.ZodType<Out, In>, keyof Methods> & Methods;

/** Adds a rule's methods to the schema it built (a fresh one at every step), and registers it. */
function rule<S extends z.ZodType, Methods extends object>(schema: S, meta: FieldRule, methods: Methods): S & Methods {
  const registered: z.ZodType = schema;
  fieldRules.add(registered, meta);
  return Object.assign(schema, methods);
}

/** Its output's `""` as `null`: an optional field the user left empty. */
function emptyAsNull<S extends z.ZodType<string, string>>(schema: S) {
  return schema.transform((value) => (value === "" ? null : value));
}

// --- text -----------------------------------------------------------------------------------------

/** A check on trimmed, non-empty text: the format of an email address, a web address, ... */
interface TextFormat {
  test: (value: string) => boolean;
  message: string;
}

interface TextState {
  required: boolean;
  max?: number;
  format?: TextFormat;
}

/** Trimmed text: `text()`, `email()`, `url()`, `phone()`. Its output is `string`, or `string | null` once optional. */
export type TextRule<Out extends string | null = string> = Rule<
  Out,
  string,
  {
    /** At most `n` characters once trimmed: `Must be between 0 and {n} characters`. */
    max(n: number): TextRule<Out>;
    /** May be left blank, which gives `null`. */
    optional(): TextRule<string | null>;
  }
>;

/** The checks on trimmed text that `state` asks for. */
function textSchema(state: TextState): z.ZodString {
  let schema = z.string().trim();
  if (state.required) {
    // `abort`: a blank value reports only that it is blank; the schema's own refinements (a match,
    // a minimum length) do not run on it.
    schema = schema.min(1, { error: NOT_BLANK, abort: true });
  }
  if (state.max !== undefined) {
    schema = schema.max(state.max, { error: `Must be between 0 and ${state.max} characters` });
  }
  const { format } = state;
  if (format !== undefined) {
    // A blank value passes the format: it reports only that it is blank, not that it is malformed.
    schema = schema.refine((value) => value === "" || format.test(value), { error: format.message });
  }
  return schema;
}

function textMeta(state: TextState): FieldRule {
  return { required: state.required, ...(state.max === undefined ? {} : { maxLength: state.max }) };
}

function requiredText(state: Omit<TextState, "required">): TextRule<string> {
  const required = { ...state, required: true };
  return rule(textSchema(required), textMeta(required), {
    max: (n: number) => requiredText({ ...state, max: n }),
    optional: () => optionalText(state),
  });
}

function optionalText(state: Omit<TextState, "required">): TextRule<string | null> {
  const optional = { ...state, required: false };
  return rule(emptyAsNull(textSchema(optional)), textMeta(optional), {
    max: (n: number) => optionalText({ ...state, max: n }),
    optional: () => optionalText(state),
  });
}

/** Required text, trimmed: `Must not be blank`. */
export function text(): TextRule {
  return requiredText({});
}

/** Required email address, trimmed: `Must be a valid email address`. */
export function email(): TextRule {
  return requiredText({ format: { test: (value) => z.regexes.email.test(value), message: NOT_EMAIL } });
}

const webAddress = z.httpUrl();

/** Required web address (http or https), trimmed: `Must be a valid web address`. */
export function url(): TextRule {
  return requiredText({
    format: { test: (value) => webAddress.safeParse(value).success, message: NOT_WEB_ADDRESS },
  });
}

const PHONE_CHARACTERS = /^[\d\s+\-().]+$/;
const PHONE_MIN_DIGITS = 7;

/** Required phone number: digits, spaces and `+ - ( ) .`, at least 7 digits: `Is not in the expected format`. */
export function phone(): TextRule {
  return requiredText({
    format: {
      test: (value) => PHONE_CHARACTERS.test(value) && value.replace(/\D/g, "").length >= PHONE_MIN_DIGITS,
      message: NOT_EXPECTED_FORMAT,
    },
  });
}

// --- date -----------------------------------------------------------------------------------------

interface DateState {
  required: boolean;
  notInFuture: boolean;
}

/** A date input's value (`YYYY-MM-DD`): `string`, or `string | null` once optional. */
export type DateRule<Out extends string | null = string> = Rule<
  Out,
  string,
  {
    /**
     * Not after the browser's today: `Must not be in the future`. The server's `@NotInFuture`
     * allows one day more (a browser can be ahead of the server's zone), so a date this accepts is
     * never refused there.
     */
    notInFuture(): DateRule<Out>;
    /** May be left empty, which gives `null`. */
    optional(): DateRule<string | null>;
  }
>;

/** Today in the browser's time zone, as a date input writes it. */
function localToday(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** The checks on a date input's value that `state` asks for; `""` passes unless `required`. */
function dateSchema(state: DateState): z.ZodString {
  let schema = state.required ? z.string().min(1, { error: NOT_EMPTY, abort: true }) : z.string();
  // `abort`: a value that is not a date reports only that, not also that it is in the future.
  schema = schema.refine((value) => value === "" || z.regexes.date.test(value), {
    error: NOT_EXPECTED_FORMAT,
    abort: true,
  });
  if (state.notInFuture) {
    schema = schema.refine((value) => value <= localToday(), { error: NOT_IN_FUTURE });
  }
  return schema;
}

function requiredDate(notInFuture: boolean): DateRule<string> {
  return rule(
    dateSchema({ required: true, notInFuture }),
    { required: true },
    { notInFuture: () => requiredDate(true), optional: () => optionalDate(notInFuture) },
  );
}

function optionalDate(notInFuture: boolean): DateRule<string | null> {
  return rule(
    emptyAsNull(dateSchema({ required: false, notInFuture })),
    { required: false },
    { notInFuture: () => optionalDate(true), optional: () => optionalDate(notInFuture) },
  );
}

/** A required date, from `<input type="date">`: `Must not be empty`. */
export function date(): DateRule {
  return requiredDate(false);
}

// --- number ---------------------------------------------------------------------------------------

interface NumberState {
  integer?: boolean;
  min?: number;
  max?: number;
}

/** A NumberField's value (`number | undefined`): `number`, or `number | null` once optional. */
export type NumberRule<Out extends number | null = number> = Rule<
  Out,
  number | undefined,
  {
    /** At least `n`: `Must be at least {n}`. */
    min(n: number): NumberRule<Out>;
    /** At most `n`: `Must be at most {n}`. */
    max(n: number): NumberRule<Out>;
    /** May be left empty, which gives `null`. */
    optional(): NumberRule<number | null>;
  }
>;

/** The checks on a set number that `state` asks for. */
function numberSchema(state: NumberState): z.ZodNumber {
  let schema = z.number({ error: NOT_EMPTY });
  if (state.integer) {
    schema = schema.int({ error: NOT_WHOLE });
  }
  if (state.min !== undefined) {
    schema = schema.min(state.min, { error: `Must be at least ${state.min}` });
  }
  if (state.max !== undefined) {
    schema = schema.max(state.max, { error: `Must be at most ${state.max}` });
  }
  return schema;
}

// Unset passes the checks (`.optional()`), then the second stage refuses it or makes it null.

function requiredNumber(state: NumberState): NumberRule<number> {
  return rule(
    numberSchema(state)
      .optional()
      .pipe(z.number({ error: NOT_EMPTY })),
    { required: true },
    {
      min: (n: number) => requiredNumber({ ...state, min: n }),
      max: (n: number) => requiredNumber({ ...state, max: n }),
      optional: () => optionalNumber(state),
    },
  );
}

function optionalNumber(state: NumberState): NumberRule<number | null> {
  return rule(
    numberSchema(state)
      .optional()
      .transform((value) => value ?? null),
    { required: false },
    {
      min: (n: number) => optionalNumber({ ...state, min: n }),
      max: (n: number) => optionalNumber({ ...state, max: n }),
      optional: () => optionalNumber(state),
    },
  );
}

/** A required number: `Must not be empty`. */
export function number(): NumberRule {
  return requiredNumber({});
}

/** A required whole number: `Must not be empty`, `Must be a whole number`. */
export function integer(): NumberRule {
  return requiredNumber({ integer: true });
}

// --- oneOf ----------------------------------------------------------------------------------------

/**
 * One of `values` (an enum), required: `Must not be empty`. Its input also takes `""`, a select's
 * placeholder, so the form's default value type-checks.
 */
export function oneOf<const V extends readonly [string, ...string[]]>(values: V) {
  const choice = z.enum(values, { error: NOT_EMPTY });
  return z
    .union([z.literal(""), choice], { error: NOT_EMPTY })
    .pipe(choice)
    .register(fieldRules, { required: true });
}

// --- id -------------------------------------------------------------------------------------------

/**
 * A required choice among ids known only at run time (a select of ranks fetched from the server),
 * `""` for the select's placeholder: `Must not be empty`.
 */
export function id() {
  return z.string({ error: NOT_EMPTY }).min(1).register(fieldRules, { required: true });
}
