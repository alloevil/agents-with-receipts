# 02 — 机制选型：memory / rules / skills / hooks / subagents 什么时候用哪个

> 适用工具：Claude Code · Codex · Cursor · Copilot（实现位置见[对照表](../rosetta/)）· 验证于 2026-09

四个工具都提供五种放置指导的机制。选错的代价是真实的：常驻内容放错地方会**每次会话都烧上下文预算**；该硬拦的用了软提醒，规则会被无视。选型只需要回答两个问题：**多久用一次？违反了多严重？**

## 2.1 用两个维度定位机制

**场景**：你有一条想让 agent 遵守的指导，不知道放哪。

**做法**：按「使用频率 × 强制程度」定位：

| | 建议性（可被无视） | 强制性（必须发生） |
|---|---|---|
| **每次会话都相关** | memory 文件（AGENTS.md） | — 提示词没有强制力，见 hooks |
| **只在特定文件/动作时相关** | 条件规则（paths/globs 触发） | **hooks**（preToolUse 级拦截） |
| **只在特定任务类型时相关** | **skills**（按需加载的成套流程） | — |
| **需要隔离的探索/分工** | **subagents**（独立上下文窗口） | — |

判定顺序：先问"违反会怎样"——会造成不可逆伤害（读 secrets、动生成物、跳过测试）的放 **hooks**，因为提示词性质的机制全部可能被无视；再问"多久用一次"——每次都要的进 memory，特定路径才要的进条件规则，成套的专项流程进 skills。

**依据**：Anthropic 官方按"上下文成本 × 权威度"给出同款选型框架（[steering 指南](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)）；hooks 的确定性语义见各家官方页（[Claude](https://code.claude.com/docs/en/hooks) / [Codex](https://developers.openai.com/codex/hooks) / [Cursor](https://cursor.com/docs/hooks.md) / [Copilot](https://docs.github.com/en/copilot/concepts/agents/hooks)）。

**边界**：团队没有维护配置的习惯时，先只用 memory 文件——五种机制一起上的维护成本会立刻反噬。

## 2.2 memory 文件：只放"每次都要、且推断不出"的

**场景**：项目命令、硬边界、踩过坑的契约。

**做法**：

1. 内容测试：这条如果删掉，agent 能从代码/配置自己推断出来吗？能就删。
2. 长度预算：每一行在**每次会话**都消耗上下文；超过 ~200 非空行就该把专题内容拆出去按需引用。
3. 拆分手段：Claude Code 用 `@path/to/doc.md` import（[官方语法](https://code.claude.com/docs/en/memory)）；跨工具通用的做法是正文一句"改 X 前先读 docs/Y.md"。

```markdown
## 常用命令
| 全部测试 | `npm test` |
| 单文件 | `node --test test/day-file.test.js` |

## 边界
- 不要动：`src-tauri/gen/**`（生成物）
- 先问再做：新增运行时依赖、force push
```

**依据**：[agents.md 规范](https://agents.md)与 [Anthropic 最佳实践](https://code.claude.com/docs/en/best-practices)（"treat CLAUDE.md like code：定期修剪"）。

**边界**：工作流类内容（"怎么做 TDD"）不属于 memory——那是 skills 的领地；写进 memory 只会常驻烧预算。

**反模式**：把整个 README 粘进 AGENTS.md——agent 本来就能读 README。

## 2.3 条件规则：路径相关的约定不要常驻

**场景**："改这个目录时才需要知道"的约定——迁移文件的写法、某个模块的不变量、构建产物的重建命令。

**做法**：写成带路径条件的规则，只在 agent 碰到匹配文件时浮现：

```markdown
---
# Claude Code: .claude/rules/sidecar.md
paths: ["viewer-server.js", "lib/*.js"]
---
这些代码会被打进桌面 sidecar：改完跑 node sidecar/build.mjs 重建。
```

```markdown
---
# Cursor: .cursor/rules/sidecar.mdc
globs: viewer-server.js,lib/*.js
alwaysApply: false
---
同上。
```

Copilot 用 `.github/instructions/*.instructions.md` 的 `applyTo:`（[语法](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)）。**Codex 没有 glob 触发机制**——用嵌套 `AGENTS.md` 做目录粒度，且注意它按 cwd 而非被改文件就近（[官方发现规则](https://developers.openai.com/codex/guides/agents-md#how-codex-discovers-guidance)）。

**依据**：[Claude rules `paths:`](https://code.claude.com/docs/en/memory#path-specific-rules) · [Cursor `.mdc` frontmatter](https://cursor.com/docs/rules.md#rule-anatomy)。

**边界**：条件规则依然是提示词。"改了 X 必须重建 Y"这类事漏掉就出事故的，再加一道 CI 检查或 hook。

## 2.4 skills：成套流程按需加载

**场景**：发版流程、评审清单、某类文档的生成规范——步骤多、用得着的会话少。

**做法**：一个目录一个 `SKILL.md`（frontmatter `name` + `description`，agent 按 description 判断何时加载）。放置位置四家已互通大半：`.agents/skills/` 同时被 Codex、Cursor、Copilot 读取；Claude Code 用 `.claude/skills/`（放软链兼容）。

```
.agents/skills/release/
└── SKILL.md   # name: release  description: 发版流程（bump/notes/tag）
```

**依据**：四家均基于 [agentskills.io](https://agentskills.io) 开放标准（[Claude](https://code.claude.com/docs/en/skills#where-skills-live) / [Codex](https://developers.openai.com/codex/skills#where-to-save-skills) / [Cursor](https://cursor.com/docs/skills.md) / [Copilot](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)）。

**边界**：description 写不清触发时机的 skill 等于不存在——agent 不会加载它。description 是 skill 最重要的一行。

## 2.5 hooks：不可逆的事不交给提示词

**场景**：绝不允许发生的动作——读凭据文件、写生成物目录、跳过验收命令。

**做法**：用 preToolUse 级 hook 做确定性拦截，四家全部支持程序化 deny：

| 工具 | 配置位置 | 拦截语义 |
|---|---|---|
| [Claude Code](https://code.claude.com/docs/en/hooks) | settings.json `hooks` 键 | `PreToolUse` 返回 `permissionDecision: "deny"` |
| [Codex](https://developers.openai.com/codex/hooks) | `.codex/hooks.json`（需 `/hooks` 授信） | `PreToolUse` 事件 |
| [Cursor](https://cursor.com/docs/hooks.md) | `.cursor/hooks.json` | 退出码 2 或 `permission:"deny"` |
| [Copilot](https://docs.github.com/en/copilot/concepts/agents/hooks) | `.github/hooks/*.json` | `preToolUse` approve/deny |

**依据**：见上表各官方页。

**边界**：hooks 是同步阻塞的，但默认超时比你预期长——Claude `command`/`http`/`mcp_tool` 默认 600s（`prompt` 30s、`agent` 60s），Codex 省略 `timeout` 时为 600s，Copilot `timeoutSec` 默认 30s；阻塞的是当次事件，所以只放秒级以内的判断，重逻辑放 CI。

**反模式**：在 memory 文件里写"绝对不要读 .env"然后指望它恒成立——提示词没有"绝对"。

## 2.6 subagents：隔离比委派更重要的理由

**场景**：大范围探索（读几十个文件找根因）、独立评审（不受主对话立场污染）、真正可并行的实施分片。

**做法**：把探索/评审派给 subagent，主上下文只收结论——省的不是时间，是**主对话的上下文预算**。定义文件：Claude `.claude/agents/*.md`、Codex `.codex/agents/*.toml`、Cursor `.cursor/agents/*.md`、Copilot `.github/agents/*.agent.md`（细节见[对照表](../rosetta/)）。

**依据**：[Claude subagents](https://code.claude.com/docs/en/sub-agents)（独立上下文窗口语义）。

**边界**：subagent 看不到主对话历史——任务描述必须自含。描述不清就并行，返工比串行更贵；独立性判定见 [07 并行与编排](07-parallel-orchestration.md)。

---

**位置**：轴一 · 读得懂 — 上一章 [01 Memory 文件](01-memory-files.md) · 下一章 [03 任务框架与规划](03-task-framing.md)

**相关**：[01 Memory 文件](01-memory-files.md) · [05 权限与沙箱](05-permissions-sandbox.md)

**对应检查**：`agents-doctor` 的 `rules` · `hooks` · `skills`

