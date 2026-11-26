// Builds catalog definitions: one canonical, typed definition per component, from which the translator generates
// everything A2UI needs. A misuse (a duplicate name, a field of an undeclared type parameter) throws at definition
// time, naming the fix.
import type {
  BoundValue,
  ChecksValue,
  ChildrenValue,
  ChildValue,
  EventValue,
  Prop,
  PropShape,
  Scalar,
  Type,
  TypeShape,
  ValueOf,
} from "./types";

function scalar<V>(name: Scalar): Type<V> {
  return { kind: "scalar", scalar: name };
}

export const text: Type<string> = scalar("text");
export const email: Type<string> = scalar("email");
export const url: Type<string> = scalar("url");
export const phone: Type<string> = scalar("phone");
/** An ISO date, `yyyy-mm-dd`. */
export const date: Type<string> = scalar("date");
/** A time of day, `hh:mm`. */
export const time: Type<string> = scalar("time");
export const number: Type<number> = scalar("number");
export const integer: Type<number> = scalar("integer");
/** roux's money: `{minorUnits, currency}`. */
export const money: Type<{ minorUnits: number; currency: string }> = scalar("money");
export const id: Type<string> = scalar("id");
export const boolean: Type<boolean> = scalar("boolean");

/** One of a fixed set of words. */
export function oneOf<const V extends readonly [string, ...string[]]>(values: V): Type<V[number]> {
  return { kind: "oneOf", values };
}

type OptionalKeys<F> = { [K in keyof F]: F[K] extends { readonly kind: "optional" } ? K : never }[keyof F];
type RecordValue<F> = {
  [K in Exclude<keyof F, OptionalKeys<F>>]: ValueOf<F[K]>;
} & { [K in OptionalKeys<F>]?: ValueOf<F[K]> };
type Simplify<T> = { [K in keyof T]: T[K] } & {};

/** A record of named fields; `name` makes it one of the app's shared records (`Customer`). */
export function record<const F extends Record<string, Type>>(fields: F, name?: string): Type<Simplify<RecordValue<F>>> {
  return name === undefined ? { kind: "record", fields } : { kind: "record", fields, name };
}

/** A map from any word to a value of one type (a badge's tones). */
export function map<V>(of: Type<V>): Type<Record<string, V>> {
  return { kind: "map", of };
}

/** A page of records (`{data, pagination}`): every list the server sends is paged. */
export function list<V>(of: Type<V>): Type<{ data: V[]; pagination: unknown }> {
  return { kind: "list", of };
}

/** A small, capped set of choices for a drop-down: `{value, label}` each. */
export function options(of: Type): Type<{ value: string; label: string }[]> {
  return { kind: "options", of };
}

/** A literal array written in the component (columns, lines). */
export function array<V>(of: Type<V>): Type<V[]> {
  return { kind: "array", of };
}

/** A component's type parameter: `DataTable` shows records of any type `T`. */
export function param(name: string): Type & { readonly kind: "param"; readonly name: string } {
  return { kind: "param", name };
}

/** The name of a field of the records a type parameter stands for (a column's `field`). */
export function fieldOf(of: { readonly kind: "param"; readonly name: string }): Type<string> {
  return { kind: "fieldOf", param: of.name };
}

/** A value that may be bound to the data model (`{"@path": ...}`), or written literally. */
export function bindable<T extends Type>(type: T): Prop<BoundValue<T>, false> {
  return { kind: "bindable", type, optional: false };
}

/** A value written in the component itself; it cannot be bound. */
export function literal<T extends Type>(type: T): Prop<ValueOf<T>, false> {
  return { kind: "literal", type, optional: false };
}

/** An action: an event the app handles. */
export function event(): Prop<EventValue, false> {
  return { kind: "event", optional: false };
}

/** Children: a list of component ids, or a template repeated for each item of a list in the data model. */
export function children(): Prop<ChildrenValue, false> {
  return { kind: "children", optional: false };
}

/** One child component id. */
export function child(): Prop<ChildValue, false> {
  return { kind: "child", optional: false };
}

/** A field's checks (`required`, `email`, `regex`, `length`), each with the message to show. */
export function checks(): Prop<ChecksValue, true> {
  return { kind: "checks", optional: true };
}

/** Makes a prop optional, or a record field optional. */
export function optional<V>(prop: Prop<V>): Prop<V, true>;
export function optional<V>(type: Type<V>): Type<V> & { readonly kind: "optional" };
export function optional(item: Prop | Type): Prop | Type {
  return isProp(item) ? { ...item, optional: true } : { kind: "optional", of: item };
}

function isProp(item: Prop | Type): item is Prop {
  return "optional" in item;
}

declare const PROPS: unique symbol;
declare const CHILD_PROPS: unique symbol;

/** A component's definition: plain data, plus (types only) the props its renderer receives. */
export interface ComponentDef<N extends string = string, P = unknown, C = unknown> {
  readonly name: N;
  readonly description: string;
  readonly generics: readonly string[];
  readonly props: Readonly<Record<string, PropShape>>;
  /** Props this component's children may carry (`weight` inside a Row). */
  readonly childProps: Readonly<Record<string, PropShape>>;
  /** Rules spanning props, for the checker ("a column's format fits its field's type"). */
  readonly rules: readonly string[];
  readonly [PROPS]?: P;
  readonly [CHILD_PROPS]?: C;
}

/** The props a component's renderer receives (before bindings are resolved). */
export type PropsOf<D> = D extends ComponentDef<string, infer P, unknown> ? P : never;
/** The props a component lets its children carry. */
export type ChildPropsOf<D> = D extends ComponentDef<string, unknown, infer C> ? C : never;

type PropEntry<K extends string, P> =
  P extends Prop<infer V, true> ? { [key in K]?: V } : P extends Prop<infer V, false> ? { [key in K]: V } : never;

export class ComponentBuilder<N extends string, P, C> {
  readonly #name: N;
  #description: string | undefined;
  readonly #generics: string[] = [];
  readonly #props: Record<string, PropShape> = {};
  readonly #childProps: Record<string, PropShape> = {};
  readonly #rules: string[] = [];

  constructor(name: N) {
    this.#name = name;
  }

  /** Declares a type parameter, made with `param("T")`. */
  generic(type: { readonly kind: "param"; readonly name: string }): ComponentBuilder<N, P, C> {
    if (this.#generics.includes(type.name)) {
      throw new Error(`${this.#name} declares type parameter "${type.name}" twice; declare it once.`);
    }
    this.#generics.push(type.name);
    return this;
  }

  prop<const K extends string, V extends Prop>(name: K, prop: V): ComponentBuilder<N, P & PropEntry<K, V>, C> {
    this.#add(this.#props, "prop", name, prop);
    return this as unknown as ComponentBuilder<N, P & PropEntry<K, V>, C>;
  }

  /** A prop this component's children may carry; it means something only inside this component. */
  childProp<const K extends string, V extends Prop>(name: K, prop: V): ComponentBuilder<N, P, C & PropEntry<K, V>> {
    this.#add(this.#childProps, "child prop", name, prop);
    return this as unknown as ComponentBuilder<N, P, C & PropEntry<K, V>>;
  }

  rule(text: string): ComponentBuilder<N, P, C> {
    this.#rules.push(text);
    return this;
  }

  /** What the component is for: the drawing agent reads it. */
  describe(text: string): ComponentBuilder<N, P, C> {
    this.#description = text;
    return this;
  }

  build(): ComponentDef<N, Simplify<P>, Simplify<C>> {
    if (this.#description === undefined) {
      throw new Error(`${this.#name} has no description; add .describe("what it is for").`);
    }
    for (const prop of [...Object.values(this.#props), ...Object.values(this.#childProps)]) {
      if (prop.kind === "bindable" || prop.kind === "literal") this.#checkParams(prop.type);
    }
    return {
      name: this.#name,
      description: this.#description,
      generics: [...this.#generics],
      props: { ...this.#props },
      childProps: { ...this.#childProps },
      rules: [...this.#rules],
    };
  }

  #add(into: Record<string, PropShape>, what: string, name: string, prop: PropShape): void {
    if (name in this.#props || name in this.#childProps) {
      throw new Error(`${this.#name} has two props named "${name}"; give the ${what} its own name.`);
    }
    into[name] = prop;
  }

  #checkParams(type: TypeShape): void {
    switch (type.kind) {
      case "param":
        this.#declared(type.name, type.name);
        return;
      case "fieldOf":
        this.#declared(type.param, `fieldOf(${type.param})`);
        return;
      case "record":
        for (const field of Object.values(type.fields)) this.#checkParams(field);
        return;
      case "map":
      case "list":
      case "options":
      case "array":
      case "optional":
        this.#checkParams(type.of);
    }
  }

  #declared(name: string, used: string): void {
    if (!this.#generics.includes(name)) {
      throw new Error(
        `${used}: ${this.#name} declares no type parameter "${name}"; add .generic(param("${name}")) before using it.`,
      );
    }
  }
}

/** Starts a component's definition. */
export function component<const N extends string>(name: N): ComponentBuilder<N, unknown, unknown> {
  return new ComponentBuilder(name);
}
