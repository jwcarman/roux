# Eval protocol: does the roux skill save time and money, and let a cheaper model do the work?

Written and committed before the measured run, so nothing below is chosen after seeing results.
The skill, the case, the fixture and the scoring are frozen at the commit that adds this file.

## Questions

1. **Efficiency.** Does the skill let an agent reach a working result in fewer turns, less time
   and less money? Better code is not claimed: the app template's gates (Spotless, 100% JaCoCo and
   Vitest coverage, PermissionsTest) push any agent toward the right way.
2. **A cheaper model.** Does the skill let Haiku succeed about as often as Sonnet without it?

## Design

- **Case:** `app-locations` only: a Locations page and API on a new app made from roux's app
  template (`eval-fixture.sh --app`, at the commit that adds this file).
- **Arms:** Sonnet with the skill, Sonnet without, Haiku with the skill, Haiku without
  (`claude plugin eval --ablation with-without --model <sonnet|haiku>`).
- **Runs:** 3 per arm, 12 in all. Every run is reported; none is rerun or dropped. A run that errors
  or times out counts as a failure, with whatever turns, time and cost it used.

## Scoring (by script, no LLM judge)

A run **succeeds** when both gates pass on its work:

1. **Acceptance:** all 10 hidden tests in `app-locations/acceptance` pass (`eval-acceptance.sh`): 8
   Spring tests of the API contract the prompt pins, and 2 Playwright tests in the browser. The
   agent cannot read them (the sandbox lets it read only the skill's own folder).
2. **Build:** the app's own `./mvnw verify -DskipITs` passes (`check-roux-way.sh`'s `build`),
   with nothing applied after the run (no `spotless:apply`). The agent's sandbox has no Docker, so
   it cannot run the Java tests itself; that holds equally for every arm.

Reported per arm: successes out of 3; each gate's pass count; mean and range of turns, time
(seconds) and cost (USD, API-equivalent, as `claude plugin eval` reports it); whether the skill
fired (with-arms); and check-roux-way's roux-way checks, for information only.

## What would support each claim

Written now; with 3 runs per arm the result is a signal, not proof.

- **Efficiency:** Sonnet with the skill succeeds at least as often as Sonnet without, at a lower
  mean cost and time.
- **A cheaper model:** Haiku with the skill succeeds at least as often as Sonnet without, at a
  lower mean cost; and more often than Haiku without.

Anything else is reported as not supported. A claim that is supported is followed by more runs of
this case before any wider claim.

## Caveat

The person who wrote the skill also wrote the case and its hidden tests. The case is an ordinary
feature request of the kind roux's users send, and its contract is pinned in the prompt so the
hidden tests can check it, which may make the task easier for both arms alike.

## Result of the measured run (fixture at d8443ee)

| Arm | Successes | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|
| Sonnet, no skill | 0 of 3 | 39 | 206 s | $0.88 |
| Sonnet + skill | 2 of 3 | 33 | 163 s | $0.77 |
| Haiku, no skill | 1 of 3 | 65 | 396 s | $0.56 |
| Haiku + skill | 3 of 3 | 56 | 265 s | $0.37 |

Every run passed all 10 hidden tests; the build decided success. Both claims were supported, as a
signal. (The skill-fired grader also passed in two Sonnet no-skill runs, which called a `roux`
skill that did not exist; it is not part of the scoring.)

## Follow-up (written before it runs)

Same case, fixture, skill and scoring as above, with no change but the driver's `--ablation`
option. 5 more runs each of Haiku + skill (`--ablation none --model haiku`) and of the Sonnet pair
(`--ablation with-without --model sonnet`: the eval has no way to run only its no-skill arm, so
Sonnet + skill runs too and is reported). Every run is reported.

The cheaper-model claim stands if, over all 8 runs of each arm (the 3 above and these 5), Haiku +
skill succeeds at least as often as Sonnet without the skill, at a lower mean cost. The efficiency
claim stands if, over all 8, Sonnet + skill succeeds at least as often as Sonnet without, at a lower
mean cost and time. The follow-up's 5 runs are also reported on their own.

## Result of the follow-up

The follow-up's 5 runs per arm:

| Arm | Successes | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|
| Sonnet, no skill | 0 of 5 | 39 | 268 s | $0.95 |
| Sonnet + skill | 3 of 5 | 34 | 178 s | $0.79 |
| Haiku + skill | 3 of 5 | 58 | 268 s | $0.29 |

All 8 runs of each arm (the measured run's 3 and the follow-up's 5):

| Arm | Successes | Hidden tests all passed | Build passed | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|---|---|
| Sonnet, no skill | 0 of 8 | 8 of 8 | 0 of 8 | 39 | 245 s | $0.92 |
| Sonnet + skill | 5 of 8 | 8 of 8 | 5 of 8 | 34 | 172 s | $0.78 |
| Haiku + skill | 6 of 8 | 7 of 8 | 6 of 8 | 57 | 267 s | $0.32 |
| Haiku, no skill (3 runs only) | 1 of 3 | 3 of 3 | 1 of 3 | 65 | 396 s | $0.56 |

Both claims stand on this case:

- **Efficiency:** Sonnet + skill succeeded 5 of 8 against 0 of 8, at 15% lower mean cost and 30%
  less time.
- **A cheaper model:** Haiku + skill succeeded 6 of 8 against Sonnet without the skill's 0 of 8, at
  65% lower mean cost (it took more turns, and about as long).

Why builds failed. Sonnet without the skill: Spotless 5 times, Java coverage 3 times. Sonnet +
skill: a test of the run's own failed twice, `permissions.gen.ts` stale once. Haiku + skill: a
frontend test of the run's own failed once, `permissions.gen.ts` stale once (that run also failed
one hidden browser test). A stale `permissions.gen.ts` is the skill's rule ("never edit it;
PermissionsTest writes it") meeting a sandbox with no Docker, where PermissionsTest cannot run.

One case, 8 runs per arm, written and scored by the skill's author: a result for this case, not yet
for roux's skill in general.

## A local open-weight model (written before it runs)

**Question:** does the skill help a local open-weight model do the same task?

- **Agent and model:** OpenCode v2.2.5 with Qwen3-Coder 30B (LM Studio's `qwen/qwen3-coder-30b`,
  8-bit, 64K context), served by LM Studio on a MacBook Pro (M5 Max, 64 GB).
- **Where it runs:** a Docker container (`scripts/opencode/`), one run at a time, holding a Linux
  copy of the same fixture (built from the fixture at d8443ee by `build-image.sh`). The container
  sees only its own copy of the app: not this repository, not the hidden tests. With the skill, roux's
  skill is copied into the app's `.claude/skills/roux/`; without, there is no roux skill anywhere in
  the container (a probe confirmed both; OpenCode's own two built-in skills are in both arms).
- **Arms and runs:** with the skill and without, 3 runs each, alternating (with-1, without-1, …).
  Same prompt. A run is stopped after 60 minutes and scored on what it left; every run is reported.
- **Scoring:** unchanged. The run's diff is applied to the Mac fixture and scored by the same
  hidden tests and the same `./mvnw verify -DskipITs`, with nothing applied after the run.
- **Differences from the Claude Code runs:** a different agent; no API cost (turns are OpenCode's
  steps; tokens are reported); the container can reach the internet, where the eval sandbox
  refused (the fixture already holds everything a run needs); no Docker, as before.

**What would support the claim:** the model with the skill succeeds more often than without it.
Anything else is reported as not supported. The comparison with the Claude Code arms is reported
side by side, not as a measured difference: the agent and the model both differ.

## Result of the local open-weight model

| Arm | Successes | Hidden tests | Build | Mean steps | Mean time | Skill loaded |
|---|---|---|---|---|---|---|
| Qwen3-Coder 30B + skill | 0 of 3 | 0 of 3 | 0 of 3 | 77 | 616 s | 0 of 3 |
| Qwen3-Coder 30B, no skill | 0 of 3 | 0 of 3 | 0 of 3 | 68 | 379 s | n/a |

Not supported. No run passed a single hidden test: every run left a build that failed (Spotless
twice, frontend tests or compilation four times), so the hidden tests never ran. In the arm with
the skill, the model never loaded it, though OpenCode offered it (a probe asking for it by name
loaded it); so this measured the model, not the skill. Qwen never ran `./mvnw` in any run (it tried
`mvn` once), and two runs never ran a build at all. The roux-way checks were cleaner with the skill
present (fetch, roux internals and forms failed 4 times without it, once with it), but the skill was
never loaded, so that is not credited to it.

## A second local model: Qwen3.8 27B (written before it runs)

Same as the Qwen3-Coder test above (agent, container, fixture, prompt, scoring, 3 runs per arm,
alternating, 60-minute limit), with one model change: Qwen3.8 27B (LM Studio's
`qwen/qwen3.8-27b`, 4-bit MLX, 128K context). The context is larger because Qwen3-Coder's runs
reached 51K of their 64K without the skill loaded, and the skill's guides would add more.

**What would support the claim:** with the skill, it succeeds more often than without. Anything
else is reported as not supported, along with whether the skill was loaded. If neither arm
succeeds, the 8-bit build of the same model may be tried next, under its own rules written first.

**Restarted (harness bug).** The first attempt was stopped 11 minutes into its first run (with the
skill, 26 steps, reading only, no code yet): OpenCode's config gave the model no context limit, so
OpenCode never compacted, and the run was about to overflow LM Studio's 128K window. The config now
gives it (`run-opencode.sh --context`, written into the model's `limit`), and a probe at a small
window showed OpenCode compacting. All 6 runs start again; the stopped run is not counted. (The
Qwen3-Coder runs above had the same gap but never came near their 64K window: their largest prompt
was 51K.)

## Result of Qwen3.8 27B: stopped, not supported

Stopped by decision 35 minutes into the first run (with the skill), so no run is scored. It loaded
the skill on its own and compacted correctly, but in 51 steps it wrote nothing: it read the guides,
then the app's files, then, after compacting, roux-web's compiled code in `node_modules`. At that
pace each run would have taken the full 60 minutes. Neither local model tried (Qwen3-Coder 30B,
Qwen3.8 27B) can do this task: one writes without checking, the other reads without writing.

## A harder case: Events on the dojo (written before it runs)

**Question:** does the cheaper-model result hold on a harder task? Haiku + skill succeeded 6 of 8
on Locations against Sonnet without the skill's 0 of 8. Events adds what Locations lacked: a rule
across two fields (an end date after the start date, with a message the prompt fixes), dates, and
a grown app (the dojo, a dozen features) to find one's way around.

- **Case:** `dojo-events`, its contract pinned in the prompt as Locations' is. Fixture: the dojo
  at 6fa8fdf (`eval-fixture.sh 6fa8fdf`), whose preflight passes.
- **Hidden tests:** 9 Spring tests of the API contract and 2 Playwright tests in the browser
  (`dojo-events/acceptance`). Proven before any run: the untouched dojo fails all 11 (404s, as it has
  no events API); a reference implementation passes all 11; and each of 7 mutants of it fails only
  the tests for what it broke.
- **Arms and runs:** Haiku + skill (`--ablation none --model haiku`) and the Sonnet pair
  (`--ablation with-without --model sonnet`), 3 runs each. Every run is reported.
- **Scoring:** as for Locations: all 11 hidden tests pass, and `./mvnw verify -DskipITs` passes on
  the run's work with nothing applied after it.

**What would support the claim:** Haiku + skill succeeds at least as often as Sonnet without the
skill, at a lower mean cost. Sonnet + skill against Sonnet without is reported, against the
efficiency rule as before (at least as often, at lower mean cost and time). Anything else is
reported as not supported.

## Result of Events on the dojo

| Arm | Successes | Hidden tests all passed | Build passed | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|---|---|
| Sonnet, no skill | 3 of 3 | 3 of 3 | 3 of 3 | 25 | 143 s | $0.58 |
| Sonnet + skill | 3 of 3 | 3 of 3 | 3 of 3 | 31 | 157 s | $0.73 |
| Haiku + skill | 0 of 3 | 3 of 3 | 0 of 3 | 49 | 176 s | $0.11 |

Neither claim is supported on this case.

- **A cheaper model:** Haiku + skill succeeded 0 of 3 against Sonnet without the skill's 3 of 3.
  Every Haiku run built a working feature (all 11 hidden tests passed) and failed the build the
  same way: it named its table `school_event` but emptied `event` in its own tests
  (`users.reset("event")`), so every test in its `EventsControllerTest` errored. The sandbox has no
  Docker, so no run could run its Java tests to see it.
- **Efficiency:** both Sonnet arms succeeded every time; the skill cost more (+26%) and took longer
  (+10%). On the dojo, a grown app whose Plans feature is a close pattern to copy, Sonnet needed no
  guide.

So the Locations result (a new app, with little to copy) does not carry over to a grown app. 3 runs
per arm; the same caveat about the author applies.

## The skill rewritten for agents (written before it runs)

**Question:** does the skill rewritten for agents (a recipe for a feature plus short cards, in place
of copies of the guides; `docs/superpowers/specs/2026-11-22-agent-skill-design.md`) succeed at least
as often as the current skill, at a lower mean cost? On the dojo the current skill cost 26% more
than no skill (above), for guides Sonnet did not need.

- **Case:** `dojo-events`, unchanged (11 hidden tests).
- **Fixture:** the dojo at f029cf3 (`eval-fixture.sh f029cf3`), not 6fa8fdf: roux changed since
  (`TestUsers.reset()` takes no tables), and a skill written for today's roux would not compile
  against the older dojo.
- **Arms:** Sonnet + current skill (`--ablation none --model sonnet`, run before any reference
  changes) and Sonnet + rewritten skill (the same, run once the rewrite is done), 3 runs each, on
  the same fixture. Every run is reported. The 6fa8fdf Events rows are shown beside them for
  reference, not compared.
- **Scoring:** unchanged: all 11 hidden tests pass, and `./mvnw verify -DskipITs` passes on the
  run's work with nothing applied after it.

**What would support the claim:** the rewritten skill succeeds at least as often as the current one,
at a lower mean cost. Anything else is reported as not supported.

## Result: the current skill (fixture f029cf3)

| Arm | Successes | Hidden tests all passed | Build passed | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|---|---|
| Sonnet + current skill | 3 of 3 | 3 of 3 | 3 of 3 | 35 (32–39) | 149 s (145–155) | $0.73 ($0.62–$0.87) |

Every run passed all 11 hidden tests and all six of check-roux-way's checks. Close to the same arm
on 6fa8fdf (3 of 3, 31 turns, 157 s, $0.73).

## Result: the rewritten skill (fixture f029cf3)

| Arm | Successes | Hidden tests all passed | Build passed | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|---|---|
| Sonnet + current skill | 3 of 3 | 3 of 3 | 3 of 3 | 35 (32–39) | 149 s (145–155) | $0.73 ($0.62–$0.87) |
| Sonnet + rewritten skill | 2 of 3 | 3 of 3 | 2 of 3 | 32 (24–39) | 157 s (129–177) | $0.61 ($0.50–$0.70) |
| *For reference, 6fa8fdf:* Sonnet, no skill | 3 of 3 | 3 of 3 | 3 of 3 | 25 | 143 s | $0.58 |

**Not supported.** The rewritten skill cost 17% less a run, but succeeded 2 of 3 against 3 of 3,
and the rule asked for at least as often. Run 2 built a working feature (all 11 hidden tests
passed). Its build failed on one of its own Java tests: `eventsAreAnsweredSoonestFirst` created an
event that ends on the day it starts, which the run's own `@After` rule refuses (400). The sandbox
has no Docker, so the run could not run the test to see it. With 3 runs per arm, one failure is
within the spread seen on Locations (Sonnet + skill, 5 of 8).

## Does agent-friendly wording help where the skill is needed? (written before it runs)

**Hypothesis:** on a new app with nothing to copy, an agent with the rewritten skill (written for
agents) reaches a green build more often than with the current skill (copies of the guides), at no
higher cost. The dojo could not test this: there, agents copy the nearest feature and mostly do not
read the skill.

- **Model:** Haiku only, where wording should matter most (it leans on the docs; Haiku + current
  skill went 6 of 8 on Locations).
- **Case:** `app-locations` only: the one new-app case with hidden acceptance tests (10). The other
  new-app cases are scored by LLM graders.
- **Fixture:** the app template at 143165c (`eval-fixture.sh --app 143165c`).
- **Arms:** Haiku + current skill (the skill at 0afcc0a, the last commit before the rewrite, run from
  a worktree there) and Haiku + rewritten skill (at 143165c, which adds a pitfall on test data that
  breaks the feature's own rules), 30 runs each (`--ablation none --model haiku`). The arms alternate
  in batches of 5 (current first). Every run is reported; none is rerun or dropped. A run that errors
  or times out is a failure.
- **Scoring:** unchanged: all 10 hidden tests pass, and `./mvnw verify -DskipITs` passes on the run's
  work with nothing applied after it.
- **Not possible:** letting agents run their Java tests. A probe showed the eval sandbox refuses a
  TCP connection to a local PostgreSQL and drops outside environment variables, so
  `ROUX_TEST_DATABASE_URL` cannot reach it. Both arms are equally without Docker.

**Decision rule.** Primary: successes, by a one-sided Fisher's exact test.

- **Supported:** the rewritten skill succeeds more often, p < 0.05.
- **Refuted:** the current skill succeeds more often, p < 0.05; or the rewrite succeeds no more
  often and costs more.
- **Not shown:** anything else. With about 75% for the current skill, 30 runs per arm detect a rise
  to 95% about 60% of the time, so a null result is weak evidence of no effect, not proof.

Secondary, reported for both arms: mean cost, turns and time; the hidden tests and the build as
separate pass counts; which references each run read; why each build failed.

## Result: agent-friendly wording on a new app, Haiku

| Arm | Successes | Hidden tests all passed | Build passed | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|---|---|
| Haiku + current skill | 21 of 30 | 29 of 30 | 22 of 30 | 53 | 236 s | $0.28 |
| Haiku + rewritten skill | 20 of 30 | 28 of 30 | 20 of 30 | 40 | 188 s | $0.08 |

**Not shown.** Successes are equal within noise (one-sided Fisher's exact: p = 0.71 that the rewrite
is better, p = 0.50 that the current skill is). The rewritten skill cost 70% less a run, with 25%
fewer turns and 20% less time. Every run loaded its arm's skill; the current arm only ever opened
the copied guides, the rewritten arm only the new references (24 of 30 runs read `feature.md` alone).

Why builds failed:

| Cause | Current | Rewritten |
|---|---|---|
| Java not formatted (Spotless) | 5 | 1 |
| Java coverage below 100% (an untested branch) | 2 | 3 |
| Frontend coverage below 100% | 1 | 0 |
| Permissions changeset put after `</databaseChangeLog>` in `roles.xml` (the app does not start) | 0 | 2 |
| A stale-version test whose first edit changed nothing, so the version did not move (200, not 409) | 0 | 2 |
| One test signing in the same address twice (`EmailAddressTakenException`), copying the recipe's `signedIn(...)` line | 0 | 2 |
| Build passed, one hidden test failed | 1 | 0 |

The rewrite fixed formatting (5 to 1) and introduced six failures that trace to the recipe: a
`roles.xml` changeset shown without saying it goes inside `<databaseChangeLog>`, a test example
whose sign-in line was copied twice in one test, and no example of a stale-version test (the
guides' example sends a version that was never read). Without them it would have succeeded 26 of 30.
That is a hypothesis for the next run, not a result of this one.

## Round 2: the recipe fixed where the runs broke (written before it runs)

**Hypothesis:** the round-2 skill (6a6b942) removes the causes behind most of the rewritten skill's
failed builds, so Haiku succeeds more often on a new app at about the same cost. Round 2:

- the recipe's Java test reaches every branch, including an edit that keeps its own name, and
  shows a stale edit that changes a value and one sign-in per address;
- the `roles.xml` changeset is shown inside `<databaseChangeLog>`;
- the skill has a check script (`scripts/check.sh`) that agents run instead of listing commands;
- rules give their reasons;
- the recipe's code is proven by building it into a fresh app (`check-recipe.sh`).

- **Model, case, fixture:** Haiku; `app-locations`; the app template at 143165c (the same fixture
  as the 60 runs above, so they stay the comparison).
- **Arm:** Haiku + round-2 skill, 30 runs (`--ablation none --model haiku`, 6 batches of 5). Every
  run is reported; none is rerun or dropped; an error or timeout is a failure.
- **Scoring:** unchanged (all 10 hidden tests pass, and `./mvnw verify -DskipITs` passes on the
  run's work).

**Decision rule**, against the rewritten skill's 20 of 30, by a one-sided Fisher's exact test:

- **Supported:** 27 or more successes (p < 0.05) at a mean cost of $0.12 or less.
- **Refuted:** fewer than 20 successes.
- **Not shown:** anything else.

Against the same day's runs this is a historical comparison: the model or the eval harness could
have changed in between. It is reported as such.

Secondary: mean cost, turns and time; how many runs ran `check.sh`; why each build failed.

## Result: round 2

| Arm | Successes | Hidden tests all passed | Build passed | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|---|---|
| Haiku + rewritten skill (earlier today) | 20 of 30 | 28 of 30 | 20 of 30 | 40 | 188 s | $0.08 |
| Haiku + round-2 skill | 28 of 30 | 29 of 30 | 29 of 30 | 28 | 154 s | $0.05 |

**Supported:** 28 of 30 (one-sided Fisher's exact p = 0.011 against 20 of 30) at $0.05 a run. Against
the current skill's 21 of 30 at $0.28, round 2 succeeds more often at less than a fifth of the cost.
26 of 30 runs ran `check.sh`. A historical comparison: the earlier arms ran the same day on the same
fixture, not interleaved with this one.

The two failures:

- One run never ran `check.sh` and failed on Java formatting (Spotless), the failure the script
  exists to prevent.
- One run did nothing: every Read and Glob it made was denied by the eval's sandbox, and it stopped
  after 8 turns saying so. An environment failure, counted as a failure as the rules say.

None of round 1's recipe-caused failures (changeset placement, stale-version test, double sign-in,
the untested own-name branch) recurred.
