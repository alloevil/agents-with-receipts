# Rosetta Stone：跨工具概念对照

同一个概念，每家叫法和放置位置都不同。换工具、多工具并用、或给团队写规范时用这张表。

> **验证于 2026-08。** 这个领域几个月一变——发现过期请提 PR，注明官方文档链接。
> 置信度标注：无标 = 官方文档核实；`†` = 二手来源，待核实。

## 主对照表

| 概念 | Claude Code | OpenAI Codex | Cursor | GitHub Copilot |
|---|---|---|---|---|
| **项目级 memory 文件** | `CLAUDE.md`（就近优先，可嵌套） | `AGENTS.md`（就近优先，可嵌套） | `.cursor/rules/*.mdc` | `.github/copilot-instructions.md` |
| **用户级 memory** | `~/.claude/CLAUDE.md` | `~/.codex/AGENTS.md` | 设置里的 User Rules | `~/.copilot/copilot-instructions.md`† |
| **条件/路径规则** | rules（frontmatter globs） | 嵌套 `AGENTS.md`（离被改文件最近的生效） | `.mdc` frontmatter 的 `globs` / `alwaysApply` | `.github/instructions/*.instructions.md`（`applyTo` glob） |
| **技能/可复用能力** | Skills（开放标准 [agentskills.io](https://agentskills.io)） | Skills（同一开放标准） | Commands† | Prompt files |
| **钩子（确定性拦截）** | Hooks（PreToolUse / PostToolUse 等） | 无等价物；用审批模式兜 | Hooks† | 无 |
| **子代理/委派** | Subagents（独立上下文窗口） | 委派任务 / cloud tasks | 无原生等价物 | Coding Agent（PR 驱动） |
| **沙箱** | 权限 allowlist + 沙箱模式 | 三档：read-only / workspace-write / full-access，**OS 内核级**（Seatbelt / Landlock） | 无 OS 级沙箱† | Cloud 容器（Actions） |
| **审批模式** | 权限逐类放行（Allow once / session…） | Suggest / Auto-Edit / Full-Auto，2026-07 起有 auto-review | 逐操作确认 | PR review 即审批 |
| **MCP 接入** | `.mcp.json` | `config.toml` 的 `mcp_servers` | `mcp.json` | MCP 支持（org 策略控制） |
| **headless / CI** | `claude -p`（管道模式） | `codex exec` / Codex Cloud | 无官方 headless† | GitHub Actions 原生 |

## 通用互操作层

不想维护 N 份配置的话，2026 年的现实做法：

1. **memory 文件统一到根级 `AGENTS.md`**（[agents.md](https://agents.md) 开放标准，60k+ 项目在用；Codex/Cursor/Copilot coding agent/Jules/Zed 等直接读）。`CLAUDE.md` 放一行引用或软链过去：
   ```bash
   ln -s AGENTS.md CLAUDE.md
   ```
2. **技能统一走 agentskills.io 标准**（Anthropic 发起，Codex 已跟进）。
3. **钩子和沙箱没有跨工具标准**——这层必须按工具各写各的，也是对照表存在的意义。

## 已知的坑

- 各工具对"就近优先"的实现细节不同：Codex 按**被修改文件**就近取 `AGENTS.md`；Claude Code 按**工作目录**向上合并 `CLAUDE.md`。monorepo 里两者行为不一致。
- 同仓库放多家配置时注意加载优先级（例如同目录下 `.cursor/rules` 与根级 `AGENTS.md` 的关系由各工具自定），实测为准。
