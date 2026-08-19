English | [简体中文](README.zh-CN.md)

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Agents with Receipts · An evidence-backed agentic coding practices handbook. On the right, a receipt-style ticket lists four boards, stamped with a red 'evidence-backed' seal: TOTAL 4 BOARDS · 0 SLOGANS.">
</p>

<p align="center">
  <a href="https://github.com/alloevil/agents-with-receipts/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/alloevil/agents-with-receipts/ci.yml?logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://github.com/alloevil/agents-with-receipts/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/alloevil/agents-with-receipts?logo=github&color=blue"></a>
</p>

<p align="center"><strong><a href="https://alloevil.github.io/agents-with-receipts/">→ Read online (GitHub Pages)</a></strong> · Receipt-stub navigation on the left · Content stays in sync with the repo Markdown</p>

**Every claim must answer one question: *where's the source?*** The answer is a clickable official doc, not a slogan.

There are already plenty of best-practice collections for Claude Code, Codex, and Cursor — but nearly all of them are unsourced assertions ("keep CLAUDE.md short", "plan before you code"). The approach here: a comparison table **verified cell-by-cell against official docs, where every cell is itself a link**; a practices map where every entry carries a source and verification date; plus an AGENTS.md checker that actually runs.

## Where should I start?

| What you want to do | Start here |
|---|---|
| **Setting up agent infrastructure for a repo for the first time** | Follow along with [`00 walkthrough`](practices/00-agent-ready-walkthrough.md): AGENTS.md → conditional rules → hooks → lint in CI, every step verifiable |
| **Writing an AGENTS.md / CLAUDE.md for a repo** | Start from the [`templates/`](templates/) skeletons, checked against the trade-off principles in [`01 Memory files`](practices/01-memory-files.md) |
| **Unsure whether to use memory, a rule, or a hook** | [`02 Mechanism selection`](practices/02-mechanism-selection.md): five mechanisms positioned along two dimensions |
| **Checking whether an existing AGENTS.md is any good** | Run [`agentsmd-lint`](tools/agentsmd-lint/) (checks the file) and [`agents-doctor`](tools/agents-doctor/) (checks the whole repo's infrastructure) |
| **Switching tools, or mixing Claude Code / Codex / Cursor** | The [`rosetta/`](rosetta/) comparison table: what each vendor calls the same concept, where it lives, and how proximity rules differ |
| **Systematically surveying the full landscape of agentic coding practices** | [`practices/`](practices/): nine chapters, every practice structured as "scenario → approach → evidence → boundaries" with official sources |
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
  <img src="./assets/readme/section-practices.svg" width="100%" alt="Board two, practices: a practices map with eight major categories plus templates, every claim carrying an official source and verification date.">
</p>

[`practices/`](practices/) is a nine-chapter practices handbook: [00, a follow-along walkthrough](practices/00-agent-ready-walkthrough.md) (setting up full agent infrastructure from scratch) + chapters 01–08 (memory files / mechanism selection / task framing / verification loops / permissions & sandboxing / context management / parallel orchestration / safety & governance). Every practice unfolds as "**scenario → approach (copy-paste examples) → evidence (official links) → boundaries**" — not a bullet-point index, but workflows you can actually follow to completion.

Accompanied by [`templates/`](templates/): `AGENTS.md` / `RULES.md` skeletons distilled from real projects, with usage notes in the comments, designed to be used together with the linter below.

<p align="center">
  <img src="./assets/readme/section-lint.svg" width="100%" alt="Board three, the tools toolbox: lint checks a file, doctor checks a repo, init generates a starting point — zero dependencies.">
</p>

A three-piece toolkit that turns practices into executable checks. Zero dependencies, Node ≥ 20:

| Tool | One command | What it does |
|---|---|---|
| [`agentsmd-lint`](tools/agentsmd-lint/) | `node tools/agentsmd-lint/index.mjs AGENTS.md` | Checks a **single file's** quality: excessive line count / placeholders / vague wording / references to nonexistent npm scripts / empty heading sections |
| [`agents-doctor`](tools/agents-doctor/) | `node tools/agents-doctor/index.mjs .` | Checks an **entire repo's** agent infrastructure: AGENTS.md quality, CLAUDE.md symlink/drift, rules/hooks/skills across the four tools, whether secrets are gitignored, CI gates |
| [`agents-init`](tools/agents-init/) | `node tools/agents-init/index.mjs . --link` | Detects package.json / Cargo.toml / pyproject / go.mod and generates an AGENTS.md starting point **pre-filled with real commands** + a CLAUDE.md symlink; the output automatically passes lint |

All three tools exit with code 1 on any error, so they slot straight into CI. This repo dogfoods the full set: CI runs the lint gate + doctor checkup, and the root `AGENTS.md` was generated by `agents-init` and then refined by hand.

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The one-sentence version: **new entries must carry an official source**, and PRs correcting outdated information should include the official link.

## License

[MIT](LICENSE). Documentation content is additionally available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
