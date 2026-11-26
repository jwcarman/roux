// Binds a surface (its A2UI JSON) to the app's typed queries and commands. The surface's generated types say what each
// top-level path holds and what each event carries; the app's contract says what each query answers and each command
// takes. The compiler checks one against the other: every path is bound, a query's answer has every field the surface
// shows, every event is bound or left for later with none(), a command's input is built from what its event carries.
import type { Pagination } from "./values";

/** The runtime half of the app's generated contract (`contract` in contract.gen.ts): what to refetch after a command. */
export type ContractEvents = {
  queries: Record<string, { kind: "query" | "lookup"; dependsOn: readonly string[] }>;
  commands: Record<string, { emits: readonly string[] }>;
};

type QueryContract = { kind: "query" | "lookup"; args: object; row: unknown };
type CommandContract = { input: unknown };
type InputOf<C, N extends keyof C> = C[N] extends { input: infer I } ? I : never;

// ---- Typed paths into the surface's data ----

const PATH = Symbol("path");
declare const VALUE: unique symbol;

type Fields<V> =
  NonNullable<V> extends readonly unknown[]
    ? object
    : NonNullable<V> extends object
      ? { readonly [K in keyof NonNullable<V> & string]-?: Ref<NonNullable<V>[K]> }
      : object;

/** A path into the surface's data holding a `V`: `d.itemsArgs.pageIndex` is `/itemsArgs/pageIndex`. */
export type Ref<V> = { readonly [PATH]: string; readonly [VALUE]?: V } & Fields<V>;

const refs = new WeakSet<object>();
function ref<V>(path: string): Ref<V> {
  const made = new Proxy({} as Ref<V>, {
    get: (_target, key) => (key === PATH ? path : ref(`${path}/${String(key)}`)),
  });
  refs.add(made);
  return made;
}
const isRef = (value: unknown): value is Ref<unknown> => refs.has(value as object);
const pathOf = (r: Ref<unknown>): string => r[PATH];

// ---- Sources: a query, or a value the surface keeps itself ----

declare const ANSWER: unique symbol;

type Answer<Q, N extends keyof Q> = Q[N] extends { kind: "query"; row: infer R }
  ? { data: R[]; pagination: Pagination }
  : Q[N] extends { row: infer R }
    ? R
    : never;

/** An arg's value: written, or read from a path. A word from a set (a string union) may be read from any text path. */
// never (an arg of NoArgs, Record<string, never>) takes nothing: without the first guard it would take a text path.
type ArgValue<V> = [V] extends [never] ? never : V | Ref<V> | ([NonNullable<V>] extends [string] ? Ref<string> : never);
type PageArgs = {
  pageIndex?: ArgValue<number>;
  pageSize?: ArgValue<number>;
  sortBy?: ArgValue<string>;
  sortDirection?: ArgValue<"ASC" | "DESC">;
  search?: ArgValue<string>;
};
type ArgsOf<Q, N extends keyof Q> = Q[N] extends { kind: infer K; args: infer A }
  ? { [K in keyof A]?: ArgValue<A[K]> } & (K extends "query" ? PageArgs : object)
  : never;

/** A path filled from a query; `R` is what the query answers, so it must have what the surface shows. */
export type QuerySource<R> = { query: string; args: Record<string, unknown>; readonly [ANSWER]?: R };
/** A path the surface keeps itself, starting at `value`. */
export type LocalSource<V> = { value: V };

// ---- Events: a command, or nothing yet ----

/** What follows a command's success, in order: a path back to its first value, a path set, a success toast. */
export type Step =
  | { reset: Ref<unknown> }
  | { set: Ref<number>; value: number }
  | { set: Ref<string>; value: string }
  | { set: Ref<boolean>; value: boolean }
  | { toast: string };

/** An event bound to a command; `X` is what the event carries, which the command's input is built from. */
export type CommandBinding<X> = {
  command: string;
  build: (context: X) => unknown;
  errors?: Ref<unknown>;
  onSuccess?: Step[];
};
/** An event left for later: running it says it is not bound yet. */
export type Unbound = Record<string, never>;

/** What a binding is written with: `d` (the surface's data as typed paths), `query`, `local`, `command` and `none`. */
export type Tools<D, Q, C> = {
  /** The surface's data, as typed paths. */
  d: Ref<D>;
  /** Fills a path from the query `name`; an arg read from a path refetches when that path changes. */
  query: <N extends keyof Q & string>(name: N, args?: ArgsOf<Q, N>) => QuerySource<Answer<Q, N>>;
  /** A path the surface keeps itself, starting at `initial`. */
  local: <V>(initial: V) => LocalSource<V>;
  /**
   * Runs the command `name` with the input `build` makes from what the event carries. Field problems are written
   * under `errors` (`<errors>/<field>`); `onSuccess` runs after the queries the command affects are refetched.
   */
  command: <N extends keyof C & string, X>(
    name: N,
    build: (context: X) => InputOf<C, N>,
    then?: { errors?: Ref<unknown>; onSuccess?: Step[] },
  ) => CommandBinding<X>;
  /** Leaves an event for later. */
  none: () => Unbound;
};

/** A surface's binding: a source for every top-level path of `D`, a command or none() for every event of `E`. */
export type BindingSpec<D, E> = {
  data: { [K in keyof D]-?: QuerySource<D[K]> | LocalSource<D[K]> };
  events: { [K in keyof E]-?: CommandBinding<E[K]> | Unbound };
};

// ---- What the runtime interprets ----

declare const BINDING: unique symbol;
/** A surface bound to the app's queries and commands, for `<Surface>`; made by `bind`. */
export type Binding = { readonly [BINDING]: true };

/** An arg read from a path, or written. */
export type Arg = { path: string } | { value: unknown };
export type Port = { path: string; query: string; args: Record<string, Arg> };
export type Effect = { reset: string } | { set: string; value: unknown } | { toast: string };
export type EventWiring = {
  command: string;
  build: (context: Record<string, unknown>) => unknown;
  errors?: string;
  onSuccess: Effect[];
};
export type Wiring = {
  contract: ContractEvents;
  ports: Port[];
  initial: Record<string, unknown>;
  events: Record<string, EventWiring>;
};

export const wiringOf = (binding: Binding): Wiring => binding as unknown as Wiring;

function effectOf(step: Step): Effect {
  if ("reset" in step) return { reset: pathOf(step.reset) };
  if ("set" in step) return { set: pathOf(step.set), value: step.value };
  return step;
}

function bindWith<D, E, Q, C>(contract: ContractEvents, spec: (tools: Tools<D, Q, C>) => BindingSpec<D, E>): Binding {
  const tools: Tools<D, Q, C> = {
    d: ref<D>(""),
    query: (name, args) => ({ query: name, args: { ...args } }),
    local: (value) => ({ value }),
    command: (name, build, then) => ({ command: name, build, ...then }),
    none: () => ({}),
  };
  const { data, events } = spec(tools);
  const wiring: Wiring = { contract, ports: [], initial: {}, events: {} };
  for (const [name, source] of Object.entries<QuerySource<unknown> | LocalSource<unknown>>(data)) {
    if ("value" in source) {
      wiring.initial[name] = source.value;
    } else {
      const args = Object.entries(source.args).map(([arg, value]) => [
        arg,
        isRef(value) ? { path: pathOf(value) } : { value },
      ]);
      wiring.ports.push({
        path: `/${name}`,
        query: source.query,
        args: Object.fromEntries(args) as Record<string, Arg>,
      });
    }
  }
  for (const [name, binding] of Object.entries(
    events as Record<string, CommandBinding<Record<string, unknown>> | Unbound>,
  )) {
    if ("command" in binding) {
      wiring.events[name] = {
        command: binding.command,
        build: binding.build,
        errors: binding.errors && pathOf(binding.errors),
        onSuccess: (binding.onSuccess ?? []).map(effectOf),
      };
    }
  }
  return wiring as unknown as Binding;
}

/**
 * The binder for the app's surfaces: `const { bind } = surfaces<Queries, Commands>(contract)`, once, with the app's
 * generated contract. `bind<ItemsSurfaceData, ItemsSurfaceEvents>(({ d, query, local, command, none }) => ({ data,
 * events }))` binds one surface.
 */
export function surfaces<Q extends { [N in keyof Q]: QueryContract }, C extends { [N in keyof C]: CommandContract }>(
  contract: ContractEvents,
): { bind: <D, E>(spec: (tools: Tools<D, Q, C>) => BindingSpec<D, E>) => Binding } {
  return { bind: (spec) => bindWith(contract, spec) };
}
