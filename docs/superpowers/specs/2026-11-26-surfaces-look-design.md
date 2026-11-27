# Surfaces look nicer

Status: design, awaiting approval. Follows `2026-11-26-surfaces-design.md`; branch `surfaces-look`, cut from
`surfaces`.

## Intent

Roux The Day's items list is now a surface, and it works, but it looks plainer than the hand-written page it
replaced, than tasting's storyboards and than Google's A2UI playground. The user chose a look (mockup "B,
themed", 2026-11-26): a wide page, stats in one row, filters in one row, an inline add row, raised cards on a
tinted page, coloured stats and badges, "All day" for an item with no time, in a teal, rounded theme.

The look is earned in roux, not in Roux The Day: every piece is a theme setting, a layout rule or a catalog
prop, so every app's surfaces (and tasting's storyboards) get it. Roux The Day then only picks a look and is
redrawn.

## Goals

- `/items` in Roux The Day matches mockup B (below), from roux's theme and catalog plus its surface JSON.
- Each new capability is generic, typed in the catalog, implemented in roux-web, documented, and drawable
  by tasting.

## Non-goals

- Mockup B's two extras: overdue dates in red (a cell coloured by its row) and initials beside names (a
  "people" format). Later, if wanted.
- Mockup C's pieces: filter chips, a side panel, gradient tiles.
- Behaviour gaps (place kept in the URL, permission gating, debounced search, busy button, blocking client
  checks). A later round.
- Dark mode polish beyond "nothing breaks": every change must read in both modes.

## Anti-goals

- App-specific CSS or a theme override in Roux The Day. If Items needs it, roux grows it.
- A second way to style: no style props in surface JSON. Surfaces stay structure; looks come from the theme.

## The look (mockup B)

The mockup: `assets/2026-11-26-items-mockup-b.png` (static HTML, not roux). It fixes the layout and the
treatment (wide page, one-row stats and filters, inline add row, raised cards on a tinted page, coloured stat
numbers and badges, "All day"); it does not fix exact colours, shadows or spacing. The bar is: a person
putting the real page beside it sees the same page.

```
┌ sidebar ┐ Items
│ (tinted)│ Everything the team has on.                               ← Heading + muted Text
│ Items ◀ │ ┌ Open ──────┐ ┌ Overdue ───┐ ┌ Today ─────┐               ← one Row, raised cards
│         │ │ 12         │ │ 1 (red)    │ │ 3 (accent) │
│         │ └────────────┘ └────────────┘ └────────────┘
│         │ ┌ Search……………… │ When ⌄ │ Status ⌄ │ Assigned to ⌄ ┐      ← one Card, fields in a Row
│         │ ┌ New item: What needs doing? │ Day: Today │ [Add item] ┐ ← one Card, fields + button in a Row
│         │ ┌ Day ↑ │ Time    │ Title │ Assigned to │ Status ┐
│         │ │ Wed…  │ All day │ …     │ Olive Owner │ (Open)  │       ← badges: Open info, Done success
│         │ └ ‹ Page 1 of 2 ›                Showing 1–8 of 14 ┘
```

Page width about 1150px on a wide screen; the page behind the cards slightly tinted; cards with a soft shadow
and the theme's rounding.

## The design

1. **Wide pages.** Today `AppShell` puts every page in `Container maxW="3xl"` (about 768px). A page can ask
   for the wide column (about `6xl`, 1150px, as tasting's desk frame uses). `<Surface>` asks for it; roux's
   built-in pages keep the narrow one. The builder chooses the mechanism (a prop on the shell's page, a route
   static, a context), as long as it is one way and documented.
2. **Raised cards: a theme setting.** `ShellTheme` gains a depth: `flat` (today's bordered cards on a plain
   page) or `raised` (a subtly tinted page, cards with a soft shadow and a lighter border). It is stored and
   chosen like shape: roux-theme's table and validation, the Appearance page (shown visually, as owners lack
   design words), and the ready-made looks (Friendly and Calm raised; Clean, Bold and Classic flat: builder
   may adjust). It applies to every Card, not only on surfaces, so built-in pages and tasting's storyboards
   change too for any app on a raised look; that is intended (my call). Any screenshot or e2e baseline that
   pins the flat look is refreshed.
3. **A Stat's tone.** `Stat` gains `tone`: `accent` (the theme's palette) or `danger`. The number is shown in
   that colour while it isn't zero; zero stays plain, so "Overdue 0" doesn't alarm. Colours come from the
   palette's text-safe shade (Chakra's semantic `fg` tokens for the palette and for red), so they meet AA
   for every palette an owner can pick, built-in or brand; tests check the built-in palettes and a sample of
   brand colours in both modes (my call).
4. **A column's empty text.** A `DataTable` column gains `emptyText`: what an empty cell shows (muted), e.g.
   "All day". A cell is empty when its value is null or an empty string (an empty list too), in any format
   (my call). The generator still types the field nullable.
5. **Forms lay out in Rows.** A Form's fields may sit in a Row (the review found the Form's context already
   reaches them; confirm and test it). Row children already take a `weight`. New rule: a Button in a Row
   takes its own width and lines up with the bottom of the fields beside it, whatever the Row's other
   children do (my call; documented in Row's description).
6. **An app's default look.** Today an app's theme defaults to roux's stock theme (`app/modules.go`,
   `spa.StockTheme`). An app may name its default look (one of the ready-made looks, or explicit settings);
   the owner's choices still win. roux-theme already stores only what the owner chose and falls back per
   setting (`theme.Service.Defaults`), so an owner who never chose sees the app's default, and a setting
   the owner did choose stays. How an app declares it (an app-module option beside the app name, most
   likely) is the builder's, as one documented way. Roux The Day defaults to Friendly.
7. **Items redrawn.** `items.surface.json`: Heading plus a muted Text; a Row of three Stats in Cards (Open
   plain, Overdue `danger`, Today `accent`); one Card with Search and the three SelectFields in a Row (search
   wider, using `weight`); one Card with Title, Day and the Add button in a Row; the DataTable with Time
   `emptyText: "All day"` and status tones Open `info`, Done `success`. The binding doesn't change unless a
   path does; the e2e tests keep passing (locators by role and label).

Every new prop is in the typed catalog with a description an agent can draw from; tasting's prompts and
validator pick them up from the catalog (check tasting still builds and its drawings still validate).

## Constraints

- roux's gates: `make check`; roux-web 100% coverage and 100% mutation score (scoped to changed files, keep
  the incremental history); Roux The Day's gates and e2e; `check-guides.mjs`; `check-recipe.sh`.
- roux's rules: errors say what to do, one way, exact names alike in Go, roux-web and docs, pre-1.0 no
  shims (a new theme column needs no migration back-compat beyond roux's usual).
- Contrast: coloured numbers and badges meet WCAG AA in both colour modes, as the button colours already do.
- See it: the round ends with screenshots of `/items` in light and dark mode, compared with mockup B.

## Approaches considered

- **In roux (chosen):** theme, layout and catalog grow; Roux The Day picks a look and is redrawn. Every app
  and tasting benefit; one way to style.
- **Only in Roux The Day** (its own CSS or theme override): fastest, but nothing else gains and it is a second
  way to style. Rejected.
- **Only what exists** (wide column, redraw, the Friendly look): smallest, but flat cards, a blank Time cell
  and plain stats; it wouldn't look like B.

## Left to the builder

- The wide-page mechanism; shadow, tint and border values for `raised` (in both modes); the exact looks'
  depth; how the Appearance page shows depth; file layout and tests.

## Open (not this round)

- Overdue dates in red (a cell tone from a row field), initials beside names, filter chips, side panels.
