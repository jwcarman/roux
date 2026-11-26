// The typed catalog's type model: plain data an agent or a tool can read, plus, at the TypeScript level only, the
// A2UI wire value each type and prop stands for (so the translator can give web_core schemas precise types).
import type {
  Action,
  CheckRule,
  Child,
  ChildList,
  DynamicBoolean,
  DynamicNumber,
  DynamicString,
  DynamicValue,
} from "@a2ui/web_core/v1_0";

/** Phantom key: the A2UI wire value a type or prop stands for. Never present at runtime. */
declare const WIRE: unique symbol;

/** Scalars, named after roux-web's form rules (`text()`, `email()`, `money()`, ...). */
export type Scalar =
  "text" | "email" | "url" | "phone" | "date" | "time" | "number" | "integer" | "money" | "id" | "boolean";

/** A type in the catalog's type language. */
export type TypeShape =
  | { readonly kind: "scalar"; readonly scalar: Scalar }
  | { readonly kind: "oneOf"; readonly values: readonly string[] }
  | { readonly kind: "record"; readonly fields: Readonly<Record<string, Type>>; readonly name?: string }
  | { readonly kind: "map"; readonly of: Type }
  | { readonly kind: "list"; readonly of: Type }
  | { readonly kind: "options"; readonly of: Type }
  | { readonly kind: "array"; readonly of: Type }
  | { readonly kind: "param"; readonly name: string }
  | { readonly kind: "fieldOf"; readonly param: string }
  | { readonly kind: "optional"; readonly of: Type };

/** A type whose literal A2UI value is `V`. */
export type Type<V = unknown> = TypeShape & { readonly [WIRE]?: V };

/** The literal A2UI value of a type. */
export type ValueOf<T> = T extends Type<infer V> ? V : never;

/** How a component takes a prop. */
export type PropShape =
  | { readonly kind: "bindable"; readonly type: Type; readonly optional: boolean }
  | { readonly kind: "literal"; readonly type: Type; readonly optional: boolean }
  | { readonly kind: "event"; readonly optional: boolean }
  | { readonly kind: "children"; readonly optional: boolean }
  | { readonly kind: "child"; readonly optional: boolean }
  | { readonly kind: "checks"; readonly optional: boolean };

/** A prop whose A2UI wire value is `V`; `O` says whether it may be left out. */
export type Prop<V = unknown, O extends boolean = boolean> = PropShape & {
  readonly optional: O;
  readonly [WIRE]?: V;
};

/** The A2UI wire value a bound prop of type `T` takes: a literal, a binding or a function call. */
export type BoundValue<T> =
  T extends Type<string>
    ? DynamicString
    : T extends Type<number>
      ? DynamicNumber
      : T extends Type<boolean>
        ? DynamicBoolean
        : DynamicValue;

export type EventValue = Action;
export type ChildrenValue = ChildList;
export type ChildValue = Child;
export type ChecksValue = CheckRule[];
