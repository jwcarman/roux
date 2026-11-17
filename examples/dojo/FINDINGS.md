# Findings

What building the dojo showed about roux: one entry per finding, in the order found.

## The README taught a superseded form API
- Where: `examples/dojo/README.md` (Forms and Feedback) and `CLAUDE.md`, copied from the template
- What was clunky: the README described forms built with `useAppForm`, validators written by hand
  and `showProblem`, and `FormDialog` holding a `useAppForm` form. roux-web has no `showProblem`,
  and the dojo's forms (`InviteForm`, `ProfileForm`) use `useSchemaForm` with roux's rule helpers.
  An agent reading the README would have learned the old way.
- roux could: describe its forms in the app's docs by pointing at roux's guides (Forms, Feedback)
  rather than re-explaining them, so an app's docs cannot drift from the API.
- Outcome: fixed in bae446d
