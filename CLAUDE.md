# roux

roux is built for agents. Its users are coding agents (Claude Code at a terminal, noir's builders)
building Go + React apps; people read it second. Judge every change by one question: **does an
agent get this right the first time, cheaply?**

## Design rules

- **One way.** Each task has one way to do it, named in the guides and the skill. No options, modes
  or alternatives an agent has to choose between.
- **The wrong way fails loudly.** Prefer what doesn't compile, a test that fails naming the fix, or a
  check script that refuses, over a rule the agent must remember. No silent failure modes.
- **Exact, guessable names.** A name says what it does; the same idea has the same name in Go, in
  roux-web and in the docs. No abbreviations an agent must look up.
- **Errors say what to do.** A failure message names the cause and the fix, in words an agent can
  act on without reading roux's source.
- **Small surface.** Export what apps need, nothing else. Every exported name is documented in the
  guides and the skill (`check-guides.mjs` enforces it).
- **Make the right way the easy way.** roux accelerates; it doesn't police app code. The template
  and the skill's recipe start an app on the right path.
- **Proven, not claimed.** Examples in the docs are code CI builds (`check-recipe.sh`). "Easy for an
  agent" is measured (turns, time, cost to a green build), not asserted.

## Code

- Comments state the contract and the why: what a caller may rely on, what must not change. Not
  narration of the code.
- Consistency beats local cleverness: a new package looks like its neighbours.
- Tests are deterministic: time from an injected clock, no sleeps, no shared state between tests.
- Never suppress a warning (no `//nolint`, `eslint-disable`); fix it. No star imports. No license
  headers (the root LICENSE covers the repository).

## Docs

- `docs/guides/` is the full text, for people. The skill (`plugins/roux/skills/roux`) is the same
  knowledge rewritten for an agent: rules first, by task, exact names. Change both together.

## Working here

- Gates before pushing: `make check` (Go), the web gates in `web/` (`format:check`, `lint`,
  `typecheck`, `coverage`, `build`, `mutate`), and the template's and Roux The Day's front ends
  (`format:check`, `lint`, `coverage`, `build`). For the skill:
  `node plugins/roux/scripts/check-guides.mjs` and `bash plugins/roux/scripts/check-recipe.sh`.
- Push to `main`; no pull requests. Commits touching only a CLAUDE.md get `[skip ci]`.
- Pre-1.0: breaking changes are fine when they make roux more effective for agents.
