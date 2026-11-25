import { z } from "zod";
import { isValid, parseISO } from "date-fns";
import { parseIsoDate, parseIsoTime } from "../dates/dates";
import { currencySymbol, organizationCurrency, type Money } from "../money/money";
import { today } from "../organization/organization";

/*
 * Rule helpers for a form's Zod schema, in the server's words: each message is the one in
 * contracts/messages.json (the Go problem package's), so a field reads the same whether the browser or the
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
const NOT_AN_AMOUNT = "Must be an amount";
const NOT_NEGATIVE = "Must not be negative";
const NOT_POSITIVE = "Must be more than 0";

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

/**
 * What a phone number looks like: digits, spaces and `+ - ( ) .`, at least 7 digits.
 * `contracts/phone.json` holds the rule, for a server check to match.
 */
export const PHONE_PATTERN = String.raw`^(?=(?:\D*\d){7})[\d +\-().]+$`;
const PHONE = new RegExp(PHONE_PATTERN);

/** Required phone number: digits, spaces and `+ - ( ) .`, at least 7 digits: `Is not in the expected format`. */
export function phone(): TextRule {
  return requiredText({ format: { test: (value) => PHONE.test(value), message: NOT_EXPECTED_FORMAT } });
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
     * Not after the organization's today (`today()`, the server's): `Must not be in the future`, in
     * the server's words (`problem.MustNotBeInFuture`).
     */
    notInFuture(): DateRule<Out>;
    /** May be left empty, which gives `null`. */
    optional(): DateRule<string | null>;
  }
>;

/** The checks on a date input's value that `state` asks for; `""` passes unless `required`. */
function dateSchema(state: DateState): z.ZodString {
  let schema = state.required ? z.string().min(1, { error: NOT_EMPTY, abort: true }) : z.string();
  // `abort`: a value that is not a date reports only that, not also that it is in the future.
  schema = schema.refine((value) => value === "" || parseIsoDate(value) !== undefined, {
    error: NOT_EXPECTED_FORMAT,
    abort: true,
  });
  if (state.notInFuture) {
    schema = schema.refine((value) => value <= today(), { error: NOT_IN_FUTURE });
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

// --- time -----------------------------------------------------------------------------------------

/** A time input's value (`HH:mm`, or the server's `HH:mm:ss`): `string`, or `string | null` once optional. */
export type TimeRule<Out extends string | null = string> = Rule<
  Out,
  string,
  {
    /** May be left empty, which gives `null`. */
    optional(): TimeRule<string | null>;
  }
>;

/** The checks on a time input's value that `required` asks for; `""` passes unless `required`. */
function timeSchema(required: boolean): z.ZodString {
  const schema = required ? z.string().min(1, { error: NOT_EMPTY }) : z.string();
  return schema.refine((value) => value === "" || parseIsoTime(value) !== undefined, { error: NOT_EXPECTED_FORMAT });
}

function requiredTime(): TimeRule<string> {
  return rule(timeSchema(true), { required: true }, { optional: optionalTime });
}

function optionalTime(): TimeRule<string | null> {
  return rule(emptyAsNull(timeSchema(false)), { required: false }, { optional: optionalTime });
}

/**
 * A required time of day, from `<input type="time">`: `Must not be empty`, `Is not in the expected
 * format`. The wire format is `HH:mm` (a server may write `HH:mm:ss`, which the form reads too).
 */
export function time(): TimeRule {
  return requiredTime();
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
 * A select's value: one of `V` (an enum's values, or ids), `""` for its placeholder. Its output is
 * `V`, or `V | null` once optional.
 */
export type ChoiceRule<V extends string, Out extends string | null = V> = Rule<
  Out,
  V | "",
  {
    /** May be left at the placeholder, which gives `null`. */
    optional(): ChoiceRule<V, V | null>;
  }
>;

/**
 * One of `values` (an enum), required: `Must not be empty`. Its input also takes `""`, a select's
 * placeholder, so the form's default value type-checks. `.optional()` lets the placeholder stand:
 * `""` in the form, `null` once parsed.
 */
export function oneOf<const V extends readonly [string, ...string[]]>(values: V): ChoiceRule<V[number]> {
  const choice = z.enum(values, { error: NOT_EMPTY });
  const unset = z.union([z.literal(""), choice], { error: NOT_EMPTY });
  return rule(unset.pipe(choice), { required: true }, { optional: () => optionalChoice(unset) });
}

function optionalChoice<V extends string>(unset: z.ZodType<V | "", V | "">): ChoiceRule<V, V | null> {
  return rule(
    unset.transform((value): V | null => (value === "" ? null : value)),
    { required: false },
    { optional: () => optionalChoice(unset) },
  );
}

// --- id -------------------------------------------------------------------------------------------

/**
 * A required choice among ids known only at run time (a select of ranks fetched from the server),
 * `""` for the select's placeholder: `Must not be empty`. `.optional()` lets the placeholder
 * stand: `""` in the form, `null` once parsed.
 */
export function id(): ChoiceRule<string> {
  return rule(z.string({ error: NOT_EMPTY }).min(1), { required: true }, { optional: optionalId });
}

function optionalId(): ChoiceRule<string, string | null> {
  return rule(emptyAsNull(z.string()), { required: false }, { optional: optionalId });
}

// --- across fields ----------------------------------------------------------------------------------

/** A field's value as something comparable: a number, a time (`09:00`), a date or a date-time; `undefined` for anything else (empty, `null`). */
function orderOf(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const parsed = parseIsoTime(value) ?? parseISO(value);
  return isValid(parsed) ? parsed.getTime() : undefined;
}

/** What the other field is called in the message: its name as words (`startsAt` is `starts at`). */
function wordsOf(name: string): string {
  return name.replace(/(?<=[a-z0-9])(?=[A-Z])/g, " ").toLowerCase();
}

/** Which two fields of a form {@link after} compares. */
export interface AfterRule<Shape> {
  /** The later field: the message is shown under it. */
  field: Extract<keyof Shape, string>;
  /** The earlier field. */
  other: Extract<keyof Shape, string>;
  /** What the earlier field is called in the message, such as `the start time`; its name as words by default. A server check gives the same. */
  otherLabel?: string;
}

/**
 * `field` must be after `other`: `Must be after {other}`, shown under `field`, in the words
 * `contracts/after.json` holds for a server check. Works for times, dates, date-times and numbers;
 * equal is not after. A field that is empty or not yet valid is left to its own rule. Call it last
 * (it returns Zod's own schema): `after(z.object({ startsAt: time(), endsAt: time() }), { field: "endsAt", other: "startsAt" })`.
 */
export function after<S extends z.ZodObject>(schema: S, rule: AfterRule<z.output<S>>): S {
  const label = rule.otherLabel ?? wordsOf(rule.other);
  return schema.refine(
    (value) => {
      const later = orderOf((value as Record<string, unknown>)[rule.field]);
      const earlier = orderOf((value as Record<string, unknown>)[rule.other]);
      return later === undefined || earlier === undefined || later > earlier;
    },
    { path: [rule.field], error: `Must be after ${label}` },
  );
}

// --- money ----------------------------------------------------------------------------------------

/** A MoneyField's value (the typed text): `Money`, or `Money | null` once optional. */
export type MoneyRule<Out extends Money | null = Money> = Rule<
  Out,
  string,
  {
    /** More than zero: `Must be more than 0` (the server's `@PositiveMoney`). */
    positive(): MoneyRule<Out>;
    /** May be left empty, which gives `null`. */
    optional(): MoneyRule<Money | null>;
  }
>;

interface MoneyState {
  required: boolean;
  positive: boolean;
}

/** Too many digits after the point for the currency. */
function tooManyDecimals(fractionDigits: number): string {
  if (fractionDigits === 0) {
    return "Must be a whole amount";
  }
  return `Must have at most ${fractionDigits} decimal place${fractionDigits === 1 ? "" : "s"}`;
}

/**
 * Typed text as minor units, or the message for why it is not an amount. A leading currency symbol
 * and thousands commas are allowed; arithmetic is on the digits as text, never on a float.
 */
function readAmount(text: string, currency: string, fractionDigits: number): number | string {
  let rest = text.trim();
  const symbol = currencySymbol(currency);
  if (rest.startsWith(symbol)) {
    rest = rest.slice(symbol.length).trim();
  }
  const negative = rest.startsWith("-");
  const digits = (negative ? rest.slice(1) : rest).replaceAll(",", "");
  if (!/^\d*(?:\.\d*)?$/.test(digits) || !/\d/.test(digits)) {
    return NOT_AN_AMOUNT;
  }
  if (negative) {
    return NOT_NEGATIVE;
  }
  const point = digits.indexOf(".");
  const whole = point < 0 ? digits : digits.slice(0, point);
  const fraction = point < 0 ? "" : digits.slice(point + 1);
  if (fraction.length > fractionDigits) {
    return tooManyDecimals(fractionDigits);
  }
  // Leading zeros are harmless: Number("0050") is 50.
  const minorUnits = Number(whole + fraction.padEnd(fractionDigits, "0"));
  return Number.isSafeInteger(minorUnits) ? minorUnits : NOT_AN_AMOUNT;
}

function moneyRule(state: MoneyState): MoneyRule<Money | null> {
  const schema = z.string().transform((value, ctx): Money | null => {
    if (value.trim() === "") {
      if (state.required) {
        ctx.addIssue({ code: "custom", message: NOT_EMPTY });
        return z.NEVER;
      }
      return null;
    }
    // Read when it parses, not when the rule is built: a schema made at module load is fine.
    const { currency, fractionDigits } = organizationCurrency();
    const amount = readAmount(value, currency, fractionDigits);
    if (typeof amount === "string") {
      ctx.addIssue({ code: "custom", message: amount });
      return z.NEVER;
    }
    if (state.positive && amount === 0) {
      ctx.addIssue({ code: "custom", message: NOT_POSITIVE });
      return z.NEVER;
    }
    return { minorUnits: amount, currency };
  });
  return rule(
    schema,
    { required: state.required },
    {
      positive: () => moneyRule({ ...state, positive: true }),
      optional: () => moneyRule({ ...state, required: false }),
    },
  );
}

/**
 * A required amount in the organization's currency (read from its context when it parses): `Must not be
 * empty`, `Must be an amount`, `Must not be negative`, `Must have at most 2 decimal places`. Its
 * output is `Money`; pair it with `f.MoneyField` and the server's `@InCurrency`.
 */
export function money(): MoneyRule {
  return moneyRule({ required: true, positive: false }) as unknown as MoneyRule;
}
