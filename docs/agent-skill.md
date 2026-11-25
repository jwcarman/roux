# Agent Skill

roux ships an [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview)
for coding agents such as Claude Code. With it, an agent asked to add a feature to a roux app knows
where each piece goes (the migration, the module, the handlers, the pages, the tests) and the names
roux gives them, instead of guessing.

## Install

An app made from roux's template already names the plugin in `.claude/settings.json`: in Claude
Code, trust the folder and run `/plugin install roux@roux` once. Elsewhere, add roux's repository
as a plugin marketplace and install it:

```text
/plugin marketplace add jwcarman/roux
/plugin install roux@roux
```

For Codex, Cursor, Gemini CLI, GitHub Copilot and the other agents that read
[Agent Skills](https://agentskills.io), install it with Vercel's
[`skills`](https://github.com/vercel-labs/skills) command:

```bash
npx skills add https://github.com/jwcarman/roux/tree/main/plugins/roux/skills/roux
```

An agent without the skill can still read these docs as Markdown: this site publishes
[`llms.txt`](https://jwcarman.github.io/roux/llms.txt), an index of the guides with a line on what
each covers, and [`llms-full.txt`](https://jwcarman.github.io/roux/llms-full.txt), every guide in
one file.

## What it knows

- A recipe for a whole feature, server and browser, with complete files to start from.
- A card per topic (errors, permissions, lists, forms, money, dates, the activity log, users,
  email, tests): the rules, the exact names, and the pitfalls agents hit.
- A check script that runs the app's gates in the order the build needs, and says what it skipped.

The guides on this site are the full text; the skill is the same knowledge written for an agent.
