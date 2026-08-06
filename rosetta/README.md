# Rosetta Stone：跨工具概念对照

同一个概念，每家叫法和放置位置都不同。换工具、多工具并用、或给团队写规范时用这张表。

> **2026-08 逐格核实**：每个单元格的文字本身就是对应官方文档页的链接，点开即可验证。修正时请附官方链接提 PR。

## 主对照表

| 概念 | Claude Code | OpenAI Codex | Cursor | GitHub Copilot |
|---|---|---|---|---|
| **项目级 memory** | [`CLAUDE.md`（cwd 向上逐层收集拼接）](https://code.claude.com/docs/en/memory#how-claude-md-files-load) | [`AGENTS.md`（项目根→cwd 向下，`AGENTS.override.md` 优先）](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | [`.cursor/rules/*.mdc` + 原生 `AGENTS.md`（嵌套合并）](https://cursor.com/docs/rules.md) | [`.github/copilot-instructions.md` + `AGENTS.md`/`CLAUDE.md`](https://docs.github.com/en/copilot/concepts/prompting/response-customization) |
| **用户级 memory** | [`~/.claude/CLAUDE.md`](https://code.claude.com/docs/en/memory#choose-where-to-put-claude-md-files) | [`~/.codex/AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md#create-global-guidance) | [User Rules（设置 UI，不落盘）](https://cursor.com/docs/rules.md#user-rules) | [CLI：`~/.copilot/copilot-instructions.md`；GitHub.com 在 Chat 设置里](https://docs.github.com/en/copilot/reference/custom-instructions-support) |
| **条件/路径规则（glob）** | [`.claude/rules/*.md`，frontmatter `paths:`](https://code.claude.com/docs/en/memory#path-specific-rules) | [无 glob 触发机制；目录粒度靠嵌套 `AGENTS.md`](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance) | [`.mdc` frontmatter `globs:` + `alwaysApply`](https://cursor.com/docs/rules.md#rule-anatomy) | [`.github/instructions/*.instructions.md`，`applyTo:` glob](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide) |
| **技能 Skills** | [`.claude/skills/<name>/SKILL.md`](https://code.claude.com/docs/en/skills#where-skills-live) | [`.agents/skills/`（REPO→USER→ADMIN 多级）](https://learn.chatgpt.com/docs/build-skills#where-to-save-skills) | [`.cursor/skills/`、`.agents/skills/`，兼容 `.claude/` `.codex/`](https://cursor.com/docs/skills.md) | [`.github/skills/`，兼容 `.claude/skills/` `.agents/skills/`](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |
| **钩子 Hooks** | [settings.json `hooks` 键：`PreToolUse` 可 deny](https://code.claude.com/docs/en/hooks) | [`.codex/hooks.json`：`PreToolUse` 等 11 事件，需 `/hooks` 授信](https://learn.chatgpt.com/docs/hooks) | [`.cursor/hooks.json`：`beforeShellExecution` 等，退出码 2 阻断](https://cursor.com/docs/hooks.md) | [`.github/hooks/*.json`：`preToolUse` 可 approve/deny](https://docs.github.com/en/copilot/concepts/agents/hooks) |
| **子代理/委派** | [`.claude/agents/*.md`（Markdown + frontmatter）](https://code.claude.com/docs/en/sub-agents) | [`.codex/agents/*.toml` + Codex cloud 并行任务](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents) | [`.cursor/agents/*.md`，兼容 `.claude/` `.codex/`](https://cursor.com/docs/subagents.md) | [`.github/agents/*.agent.md` → subagent；cloud agent 走 PR](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli) |
| **沙箱（OS 级）** | [内置 Bash 沙箱：Seatbelt / bubblewrap，`sandbox.*` 设置](https://code.claude.com/docs/en/sandboxing) | [`--sandbox` 三档：Seatbelt / bubblewrap / Windows sandbox](https://learn.chatgpt.com/docs/sandboxing) | [Seatbelt / Landlock+seccomp，`.cursor/sandbox.json`](https://cursor.com/docs/agent/security/run-modes.md#sandboxing) | [CLI 本地沙箱（experimental）；cloud 用 Actions 容器+防火墙](https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes) |
| **审批模式** | [六档 permission modes + allow/ask/deny 规则](https://code.claude.com/docs/en/permission-modes) | [`approval_policy`：untrusted / on-request / never](https://learn.chatgpt.com/docs/sandboxing#configure-defaults) | [Run Modes：Auto-review / Allowlist / Run Everything](https://cursor.com/docs/agent/security/run-modes.md) | [`--allow-tool`/`--deny-tool` 分层；cloud 靠 workflow 批准+人工合并](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools) |
| **MCP 配置** | [`.mcp.json`（项目）/ `~/.claude.json`（用户）](https://code.claude.com/docs/en/mcp#mcp-installation-scopes) | [`config.toml` 的 `[mcp_servers]` 段（无独立 mcp.json）](https://learn.chatgpt.com/docs/extend/mcp#connect-codex-to-an-mcp-server) | [`.cursor/mcp.json` / `~/.cursor/mcp.json`](https://cursor.com/docs/mcp.md#configuration-locations) | [CLI：`~/.copilot/mcp-config.json` + 项目 `.mcp.json`；cloud 在仓库 Settings](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers) |
| **headless / CI** | [`claude -p`（`--output-format json` 等）](https://code.claude.com/docs/en/headless) | [`codex exec`（`--json`、`CODEX_API_KEY`）](https://learn.chatgpt.com/docs/non-interactive-mode) | [`agent -p`（二进制名就叫 `agent`，`CURSOR_API_KEY`）](https://cursor.com/docs/cli/headless.md) | [`copilot -p`（配 `--allow-tool` 最小权限）](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically) |

## 2026-08 的真实格局：收敛比想象快

核实过程推翻了"生态碎片化"的旧叙事——四家已在四个层面收敛：

1. **AGENTS.md 家族**：Cursor 和 Copilot 都已原生读取 `AGENTS.md`（Copilot 连 `CLAUDE.md` 也读）。根级 `AGENTS.md` 做单一事实源的策略比一年前更成立。
2. **Skills 开放标准**：四家全部基于 [agentskills.io](https://agentskills.io)，且 Cursor/Copilot/Codex 互认对方的技能目录。跨三家的最大公约数是 **`.agents/skills/`**（Claude Code 目前仍只读 `.claude/skills/`）。
3. **Hooks 全员到齐**：确定性拦截（preToolUse 级 deny）四家都有官方实现，只是文件位置和事件名不同。
4. **OS 级沙箱全员到齐**：macOS 清一色 Seatbelt，Linux 是 bubblewrap 或 Landlock+seccomp。

## 就近规则差异（monorepo 里最容易踩的坑）

同样是"就近优先"，四家语义不同：

| 工具 | 实际语义 |
|---|---|
| Claude Code | 从 cwd **向上**收集每层 `CLAUDE.md`，**全部拼接**（根→cwd 顺序，越近越靠后）；cwd 之下子目录的按需加载 |
| Codex | 从项目根**向下走到 cwd**，每目录取一个，**按 cwd 而不是被改文件**——编辑 `services/x.ts` 不会加载 `services/AGENTS.md`，除非从那里启动 |
| Cursor | 嵌套 `AGENTS.md` 合并，"更具体的优先"；CLI 额外读根级 `CLAUDE.md` |
| Copilot | VS Code "最近的优先"；CLI 官方**明确不定义优先级**，只做发现与去重 |

## 通用互操作层

1. **memory**：根级 `AGENTS.md` 单一事实源，`CLAUDE.md` 软链过去（`ln -s AGENTS.md CLAUDE.md`）——四家全覆盖。
2. **skills**：面向 Codex/Cursor/Copilot 的放 `.agents/skills/`；要同时喂 Claude Code 就在 `.claude/skills/` 放软链。
3. **hooks 与沙箱配置没有跨工具标准**——这层按工具各写各的，也是这张表存在的意义。
