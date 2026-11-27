# Adding a primitive

A surface is drawn only from roux's catalog ([Surfaces](surfaces.md)). When a screen needs something
the catalog can't draw (a calendar, a chart, a kind of field it lacks), the fix is a new **primitive**:
one more typed, implemented and tested component in the catalog. Never a hand-written screen, and
never a component an app keeps to itself: the catalog is roux's, in roux-web, so the generator, the
runtime and the drawing agent all know the new component the same way.

Until the primitive is in a roux-web release, the screen that needs it waits. Say so plainly rather
than drawing around the gap in React.

## Before adding one

- **Is it a primitive?** A primitive is a building block several screens could use: a chart, a
  calendar, a checkbox field, a badge. A screen-shaped thing (an "invoice summary") is a layout of existing
  primitives, drawn in the surface.
- **Does a prop do it?** A new `format` on a `DataTable` column, a `tone` on a `Card` or a `variant`
  on a `Button` is a smaller change than a new component, and is made the same way below.

## The steps

All of them are in roux-web (`web/roux-web/src`), and each one has a check that fails until it is
done.

### 1. The definition: `a2ui/primitives.ts`

```ts
const Badge = component("Badge")
  .prop("text", bindable(text))
  .prop("tone", optional(literal(oneOf(["neutral", "info", "success", "warning", "danger"]))))
  .describe("A short status word on its own, coloured by tone: a record's state beside its title.")
  .build();
```

Type every prop as precisely as the format allows ([The A2UI catalog](a2ui-catalog.md#defining-a-component)):
the generator reads these types to say what a surface's data must hold, so a prop typed `text` when
it is a date makes every binding of it looser than it should be. A component over records is
`.generic(T)` with its fields as `fieldOf(T)`; the generator then types the records from the fields a
surface names. `.describe(...)` is what the drawing agent reads: say what it is for and how it is
bound, in a sentence or two. Add it to `PRIMITIVES`, which `rouxCatalog` is translated from.

### 2. The implementation: `surface/components/`

```tsx
const { Badge: BadgeApi } = rouxCatalog.apis;

const BadgeC = defineComponent(BadgeApi, ({ props }) => (
  <Badge data-component-id={useComponentId()} colorPalette={TONES[props.tone ?? "neutral"]}>
    {props.text}
  </Badge>
));
```

`defineComponent(rouxCatalog.apis.X, render)` makes the A2UI React implementation; `render` gets the
props resolved from the data model, typed by the definition (`PropsOf<typeof def>`), an event prop as
a function to call, and `buildChild` for child ids. Draw with Chakra and roux-web's own components
(a field goes through the form bridge in `form.tsx`, as `InputField` does, so it gets roux's labels,
messages and blur behaviour). Put `data-component-id={useComponentId()}` on the outer element. Add it
to its group's list (`layoutComponents`, `dataComponents`, `formComponents`), which
`surfaceComponents` is made from; a test fails until every primitive has an implementation.

### 3. Tests

roux-web's gates are 100% coverage and a 100% mutation score. Test the implementation by rendering
a small surface that uses it, as the existing components' tests do: what it shows from bound data,
what it writes back, what its event sends. Test the generated types for a surface that uses it
(`surfaceTypes`), especially a generic one's row type. Mutation testing is incremental through
`.mutation-history/` at the repository's root: keep that directory, and run the mutation gate scoped
to the files you changed.

### 4. Docs

Name the component and its props in [The A2UI catalog](a2ui-catalog.md) and in the skill's
`a2ui-catalog.md` and `surfaces.md` references, and add a line to the changelog. Nothing checks
this for you: `check-guides.mjs` checks roux-web's exported names, and a new component is an entry
in `PRIMITIVES`, not an export, so a component the docs leave out goes unnoticed until an agent
can't find it.

### 5. Then the screen

Release roux-web, upgrade the app ([Upgrading](upgrading.md)), draw the component in the surface,
run `npm run surfaces`, and bind any new path or event.
