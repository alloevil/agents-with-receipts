English | [简体中文](README.zh-CN.md)

# agents-with-receipts

**agents-with-receipts** is an evidence-first agentic-coding handbook plus four zero-dependency CLI tools that answer two questions about a repository: can an agent **understand** it (AGENTS.md, rules, hooks, skills) and can an agent **verify** its own work in it (one command that runs everything, determinism, failure evidence) — for engineers who want sourced practices instead of unsourced advice.

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Agents with Receipts · An evidence-backed agentic coding practices handbook. On the right, a receipt-style ticket lists four boards, stamped with a red 'evidence-backed' seal: TOTAL 4 BOARDS · 0 SLOGANS.">
</p>

<p align="center">
  <a href="https://github.com/alloevil/agents-with-receipts/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/alloevil/agents-with-receipts/ci.yml?logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://github.com/alloevil/agents-with-receipts/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/alloevil/agents-with-receipts?logo=github&color=blue"></a>
</p>

<p align="center"><strong><a href="https://alloevil.github.io/agents-with-receipts/">→ Read online (GitHub Pages)</a></strong> · Receipt-stub navigation on the left · Content stays in sync with the repo Markdown</p>

**Every claim must answer one question: *where's the source?*** The answer is a clickable official doc, not a slogan.

There are already plenty of best-practice collections for Claude Code, Codex, and Cursor — but nearly all of them are unsourced assertions ("keep CLAUDE.md short", "plan before you code"). The approach here: a comparison table **verified cell-by-cell against official docs, where every cell is itself a link**; a practices map where every entry carries a source and verification date; plus checkers that actually run — one for whether an agent can read the repo, one for whether it can verify its own work.

## What it is

Four artefacts under one rule, along two axes — can an agent **understand** this repo, and can an agent **verify** its own work. [`rosetta/`](rosetta/) compares Claude Code, OpenAI Codex, Cursor and GitHub Copilot across ten concepts — project and user memory, conditional rules, skills, hooks, sub-agents, OS sandbox, approval modes, MCP config, headless/CI — and all 40 cells are official-doc links, verified 2026-08. [`practices/`](practices/) is eleven chapters, each practice written as scenario → approach → evidence → boundaries; chapters 09–10 carry the second axis. [`tools/`](tools/) turns that into executable checks: `agentsmd-lint` grades one memory file, `agents-doctor` grades a whole repo's agent setup, `agents-init` writes an AGENTS.md pre-filled with commands it actually detected, `verify-doctor` grades the repo's verification loop across six stages (0, one command runs everything → 5, prerequisites for auto-merge). [`templates/`](templates/) holds skeletons built to pass the linter. The repo dogfoods all of it in CI.

## Install

Node ≥ 20, no dependencies to install — the four CLIs are single-file Node ESM scripts using only the standard library.

```bash
git clone https://github.com/alloevil/agents-with-receipts.git
cd agents-with-receipts
node tools/agentsmd-lint/index.mjs AGENTS.md
```

They are also declared as `bin` entries, so `npm link` gives you `agentsmd-lint`, `agents-doctor`, `agents-init` and `verify-doctor` as named commands.

## Where should I start?

| What you want to do | Start here |
|---|---|
| **Setting up agent infrastructure for a repo for the first time** | Follow along with [`00 walkthrough`](practices/00-agent-ready-walkthrough.md): AGENTS.md → conditional rules → hooks → lint in CI, every step verifiable |
| **Writing an AGENTS.md / CLAUDE.md for a repo** | Start from the [`templates/`](templates/) skeletons, checked against the trade-off principles in [`01 Memory files`](practices/01-memory-files.md) |
| **Unsure whether to use memory, a rule, or a hook** | [`02 Mechanism selection`](practices/02-mechanism-selection.md): five mechanisms positioned along two dimensions |
| **Checking whether an existing AGENTS.md is any good** | Run [`agentsmd-lint`](tools/agentsmd-lint/) (checks the file) and [`agents-doctor`](tools/agents-doctor/) (checks the whole repo's infrastructure) |
| **Wanting the agent to verify its own work — or to trust it enough to auto-merge** | [`09 Verifiable repositories`](practices/09-verifiable-repo.md) for the stage order, then run [`verify-doctor`](tools/verify-doctor/): it reports the verification-loop gap stage by stage |
| **Switching tools, or mixing Claude Code / Codex / Cursor** | The [`rosetta/`](rosetta/) comparison table: what each vendor calls the same concept, where it lives, and how proximity rules differ |
| **Systematically surveying the full landscape of agentic coding practices** | [`practices/`](practices/): eleven chapters, every practice structured as "scenario → approach → evidence → boundaries" with official sources |
| **Found outdated or incorrect content** | [CONTRIBUTING.md](CONTRIBUTING.md) — open a PR with an official link; stale entries get deleted, not accumulated |

If you only have ten minutes: read the "convergence landscape" and "proximity-rule differences" sections in [`rosetta/`](rosetta/), then run the linter once against your own repo.

<p align="center">
  <img src="./assets/readme/section-rosetta.svg" width="100%" alt="Board one, rosetta: a cross-tool comparison of what the same concept is called and where it lives in Claude Code, Codex, Cursor, and Copilot.">
</p>

Concepts go by different names and live in different places across the four tools: memory files, conditional rules, skills, hooks, sandboxing, approvals, MCP, headless. [`rosetta/`](rosetta/) is a comparison table **verified cell-by-cell against official docs** — every cell is itself an official documentation link you can click to verify (verified 2026-08; it also records the four layers along which the four vendors are converging, and the four distinct "proximity" semantics in monorepos).

One immediately usable takeaway: **make a root-level `AGENTS.md` the single source of truth** (the [agents.md](https://agents.md) open standard, used by 60k+ projects; Cursor and Copilot already read it natively), and symlink `CLAUDE.md` to it:

```bash
ln -s AGENTS.md CLAUDE.md
```

<p align="center">
  <img src="./assets/readme/section-practices.svg" width="100%" alt="Board two, practices: a practices map with ten major categories plus templates, every claim carrying an official source and verification date.">
</p>

[`practices/`](practices/) is an eleven-chapter practices handbook: [00, a follow-along walkthrough](practices/00-agent-ready-walkthrough.md) (setting up full agent infrastructure from scratch) + chapters 01–10 (memory files / mechanism selection / task framing / verification loops / permissions & sandboxing / context management / parallel orchestration / safety & governance / verifiable repositories / pushing rules down into hard constraints). Every practice unfolds as "**scenario → approach (copy-paste examples) → evidence (official links) → boundaries**" — not a bullet-point index, but workflows you can actually follow to completion.

Accompanied by [`templates/`](templates/): `AGENTS.md` / `RULES.md` skeletons distilled from real projects, with usage notes in the comments, designed to be used together with the linter below.

<p align="center">
  <img src="./assets/readme/section-lint.svg" width="100%" alt="Board three, the tools toolbox: lint checks a file, doctor checks a repo, init generates a starting point, verify checks the verification loop — zero dependencies.">
</p>

A four-piece toolkit that turns practices into executable checks. Zero dependencies, Node ≥ 20:

| Tool | One command | What it does |
|---|---|---|
| [`agentsmd-lint`](tools/agentsmd-lint/) | `node tools/agentsmd-lint/index.mjs AGENTS.md` | Checks a **single file's** quality: excessive line count / placeholders / vague wording / references to nonexistent npm scripts / empty heading sections |
| [`agents-doctor`](tools/agents-doctor/) | `node tools/agents-doctor/index.mjs .` | Checks an **entire repo's** agent infrastructure: AGENTS.md quality, CLAUDE.md symlink/drift, rules/hooks/skills across the four tools, whether secrets are gitignored, CI gates |
| [`agents-init`](tools/agents-init/) | `node tools/agents-init/index.mjs . --link` | Detects package.json / Cargo.toml / pyproject / go.mod and generates an AGENTS.md starting point **pre-filled with real commands** + a CLAUDE.md symlink; the output automatically passes lint |
| [`verify-doctor`](tools/verify-doctor/) | `node tools/verify-doctor/index.mjs .` | Checks whether an agent can **verify its own work** in the repo: one command that runs everything, determinism, failure artefacts, module boundaries, type strictness, lint hardness, escape-hatch ratchet, flaky quarantine, evidence template — 9 checks reported by stage 0–5 |

All four tools exit with code 1 on any error, so they slot straight into CI. Stage gaps that `verify-doctor` finds are warnings by default (`--strict` promotes them to errors), so adopting it does not turn a repo red overnight. This repo dogfoods the full set: CI runs the lint gate + doctor checkup + verify-doctor, and the root `AGENTS.md` was generated by `agents-init` and then refined by hand.

```bash
# Run a checkup on your own repo
git clone https://github.com/alloevil/agents-with-receipts.git
node agents-with-receipts/tools/agents-doctor/index.mjs your-repo/
```

## Core Positions

1. **Evidence first.** Unsourced claims are not accepted; every cell of the comparison table is an official documentation link.
2. **Half-life awareness.** This field shifts every few months; every entry is annotated with the applicable tool and date, and stale entries get deleted.
3. **Less but better.** A handbook's value density is set by its worst entry.
4. **Executable > readable.** A practice that can be turned into a lint rule, template, or scaffold should not remain prose.

## When to use it

- Setting up agent infrastructure for a repo for the first time — chapter 00 walks AGENTS.md → conditional rules → hooks → lint in CI, every step verifiable.
- Switching between, or simultaneously using, Claude Code / Codex / Cursor / Copilot: `rosetta/` tells you what each calls the same concept, where the file lives, and how their "nearest wins" semantics differ in a monorepo.
- You already have an AGENTS.md and want to know whether it is any good — the linter catches leftover template placeholders, references to npm scripts that do not exist, vague wording an agent cannot act on, empty sections and excessive length.
- You need a repo-level checkup before onboarding a team: `agents-doctor` reports memory-file quality, CLAUDE.md drift, which vendors' rules/hooks/skills exist, whether secret files are gitignored, and whether CI has a lint gate.
- You are about to let agents merge their own PRs and need to know whether the verification loop can carry that: `verify-doctor` reports, stage by stage, whether one command runs everything, whether that command is deterministic, whether failures leave artefacts an agent can read, and whether type/lint escape hatches are ratcheted downward.
- You are writing team standards and need every rule to carry a citation a colleague can click.

## When NOT to use it

- **You want productivity or performance numbers.** There are none, by design. [`claims.json`](https://alloevil.github.io/agents-with-receipts/claims.json) only counts this repo's own artefacts (40 sourced cells, 11 chapters, 4 tools, 5 lint rules, 7 doctor checks, 9 verify-doctor checks, 0 dependencies). No claim is made that any practice makes an agent faster or more accurate, because that has not been measured.
- **You need vendor facts guaranteed current.** The comparison table is dated **2026-08**. This field moves in months — that is why every cell is a link: re-verify the one cell your decision rests on before betting on it.
- **You want the tools to fix your files.** All are read-only reporters except `agents-init`, which writes a new AGENTS.md and refuses to overwrite an existing one without `--force`.
- **You want `verify-doctor` to close the gaps it finds.** It is a detector, not a fixer: it names the stage and the missing evidence, and never edits your tests, config or CI. It also ships no dependency-cruiser or betterer of its own — zero dependencies is a rule here — it only detects whether you have already adopted such a tool.
- **You are on Node < 20,** or want a published package — the tools ship as source in this repo.
- **You want opinions on models or prompt engineering.** Scope is the repository side of two axes: can an agent understand this repo (memory files, rules, skills, hooks, sandboxing, approvals, MCP, headless) and can an agent verify its own work in it (verification command, determinism, failure artefacts, module boundaries, escape-hatch ratchets, flaky quarantine).

## FAQ

**What is the difference between the four tools?**
They work at four scopes. `agentsmd-lint` grades the *content of one memory file*: line count, unfilled placeholders, vague wording, references to npm scripts that do not exist in the sibling package.json, empty heading sections. `agents-doctor` grades the *infrastructure around* those files in a whole repo: AGENTS.md quality, CLAUDE.md symlink vs drift, which of the four vendors' rules/hooks/skills directories exist, whether secret files are gitignored, whether CI has a lint gate. `agents-init` takes a repo with no AGENTS.md and generates one from detected build tooling, then lints its own output. `verify-doctor` changes axis: instead of asking whether the repo explains itself to an agent, it asks whether the repo lets an agent *check itself* — one command that runs everything, determinism, failure artefacts, module boundaries, type and lint hardness, an escape-hatch ratchet, flaky quarantine, and an evidence template in the PR flow.

**Why does `agents-init` only write commands it detected?**
Because an invented command in a memory file is worse than no memory file — the agent runs it, it fails, and the file has taught the agent something false. It reads package.json scripts, Cargo.toml, pyproject.toml and go.mod, emits only entries that exist (switching prefix when `packageManager` names pnpm or yarn), and for pyproject without pytest traces writes a comment instead of guessing. It then runs the linter on its output and exits non-zero if that fails.

**Should `CLAUDE.md` be a symlink to `AGENTS.md`?**
That is the recommendation here, and `ln -s AGENTS.md CLAUDE.md` is the whole implementation: `AGENTS.md` is an open standard that Cursor and Copilot read natively, so one file is maintained instead of one per vendor. `agents-doctor` grades this on three levels — symlink is ok, an identical separate copy is info (it works but will drift), drifted or missing is a warning. The trade-off: a symlink means every tool sees identical instructions, which is wrong if you genuinely need vendor-specific guidance.

**How current is the comparison table, and what happens when a vendor changes something?**
Verified cell by cell in 2026-08, and that date is stated on the table rather than implied. Every cell's text *is* the vendor link, so any single cell can be re-verified in one click instead of trusting the table wholesale. Corrections are accepted as PRs that include the official link, and outdated entries get deleted rather than caveated.

**What is the licence, and can I reuse this internally?**
Code is MIT; documentation content is additionally available under CC BY 4.0, so chapters and table rows can be copied into internal docs with attribution. Cite the page that carries the claim (e.g. `practices/05-permissions-sandbox.md`) and keep the vendor link that backs it, so your readers inherit the receipt.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The one-sentence version: **new entries must carry an official source**, and PRs correcting outdated information should include the official link.

## License

[MIT](LICENSE). Documentation content is additionally available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
