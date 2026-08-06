# 06 — 上下文管理

> 适用工具：Claude Code · Codex · Cursor · Copilot（实现位置见[对照表](../rosetta/)）· 验证于 2026-08

上下文窗口装着整段对话：每条消息、每个读过的文件、每次命令输出。窗口越满，模型表现越差——Anthropic 称之为需要管理的"最重要资源"，OpenAI 称之为 context pollution / context rot。本章的每条实践都指向同一件事：只让当前任务需要的信息占据窗口。

## 6.1 任务之间用 /clear 重置，不共享无关历史

**场景**：上一个任务结束，要开始一个不相关的新任务；或者同一个问题你已经纠正 agent 两次还没对。

**做法**：

1. 任务切换时直接清空上下文，不要在同一会话里堆积多个话题：

```text
/clear
```

2. 纠正同一问题两次仍失败时，也用 `/clear`——然后把这两轮学到的东西写进一条更具体的初始 prompt 重新开始。干净会话 + 好 prompt 几乎总是胜过带着失败尝试的长会话。
3. 想保留部分历史而不是全清时，Claude Code 用 `/compact <instructions>` 定向压缩（如 `/compact Focus on the API changes`）；顺手的小问题用 `/btw` 问，答案不进入对话历史。

**依据**：Anthropic 把"kitchen sink session"和"correcting over and over"列为头两个常见失败模式，修法都是 `/clear`（[最佳实践指南](https://code.claude.com/docs/en/best-practices)）。

**边界**：深入单个复杂问题时历史本身有价值，不要中途清空——Anthropic 明确说"sometimes you *should* let context accumulate"。

**反模式**：靠自动压缩兜底。压缩是有损摘要，被压掉的决策和文件状态不会回来（对策见 6.3）。

## 6.2 探索丢给 subagent，主上下文只收结论

**场景**：需要摸清一个子系统、跑一轮测试、翻大量日志——这些工作会产生几万 token 的中间输出，而你之后只需要结论。

**做法**：

1. 直接在 prompt 里要求委派，让探索发生在独立上下文窗口里：

```text
Use subagents to investigate how our authentication system handles token
refresh, and whether we have any existing OAuth utilities I should reuse.
Report back file paths and a summary; don't paste file contents.
```

2. 各工具的入口：
   - **Claude Code**：内置 Explore（只读、专做代码库搜索）自动触发；自定义 subagent 放 `.claude/agents/*.md`（[sub-agents](https://code.claude.com/docs/en/sub-agents)）。
   - **Codex**：直接说 "spawn one agent per point, wait for all of them, and summarize"；CLI 里用 `/agent` 查看和切换 agent 线程（[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)）。
   - **Cursor**：内置 Explore / Bash / Browser 三个 subagent 自动隔离噪音输出；自定义放 `.cursor/agents/*.md`，用 `/name` 显式调用（[subagents](https://cursor.com/docs/subagents.md)）。
   - **Copilot**：官方文档未提供项目内 subagent 机制；等价做法是把探索放进独立会话，只把结论带回主会话。
3. 给 subagent 的任务描述必须自含——它看不到主对话历史，缺的约束要写进 prompt。

**依据**：OpenAI 官方把这归为对抗 context pollution 的核心手段："Return summaries from subagents instead of raw intermediate output"（[Codex subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)）；Anthropic 的表述是"探索在独立窗口进行，主对话留给实现"（[sub-agents](https://code.claude.com/docs/en/sub-agents)）。

**边界**：写多改重的任务不要并行丢给多个 subagent——OpenAI 明确警告并发写代码会制造冲突、抬高协调成本；subagent 每个都独立跑模型，token 消耗高于单 agent。

**反模式**：让 agent 无边界地"investigate"——它会读几百个文件填满主上下文。要么收窄范围，要么丢给 subagent。

## 6.3 计划落盘成文件，不留在对话里

**场景**：跨多次会话的大任务；或者你预计会话会长到触发自动压缩。

**做法**：

1. 计划阶段结束时，让 agent 把 spec 写成文件而不是停在对话里：

```text
I want to build [brief description]. Interview me in detail using the
AskUserQuestion tool. Ask about technical implementation, edge cases,
and tradeoffs. Keep interviewing until we've covered everything,
then write a complete spec to SPEC.md.
```

2. spec 写完后开一个全新会话执行——新会话上下文干净，只装实现所需的内容，spec 文件就是它的输入。
3. 好的 spec 自含：点名涉及的文件和接口、声明什么不在范围内、以一个端到端验证步骤收尾。
4. 后续验收也引用这个文件，而不是靠对话记忆：

```text
Use a subagent to review the rate limiter diff against PLAN.md. Check that
every requirement is implemented and nothing outside the task's scope changed.
```

**依据**：这是 Anthropic 官方的 "Let Claude interview you" 工作流原文——"Once the spec is complete, start a fresh session to execute it"（[最佳实践指南](https://code.claude.com/docs/en/best-practices)）。对话在接近上限时会被自动压缩成摘要，文件不会。

**边界**：一句话能描述清 diff 的小改动不值得写计划文件——Anthropic 原话是 "If you could describe the diff in one sentence, skip the plan"。

**反模式**：让计划只存在于 plan mode 的对话输出里，然后在同一个塞满探索记录的会话里直接开写。

## 6.4 长任务设检查点：commit 锚点 + 可恢复会话

**场景**：任务跨越多次坐下来的时间；或者你要让 agent 尝试一个可能失败的激进方案。

**做法**：

1. 每完成一个可验证的阶段就让 agent commit，把进度锚定在 git 里：

```text
commit with a descriptive message and open a PR
```

2. Claude Code 里每条 prompt 自动创建 checkpoint：`Esc Esc` 或 `/rewind` 可以只回滚对话、只回滚代码、或两者一起。用它做低成本试错——让 agent 试激进方案，不行就 rewind 换路。
3. 跨会话恢复：`claude --continue` 接最近会话，`claude --resume` 从列表选；用 `/rename` 给会话起 `oauth-migration` 这类可检索的名字。Cursor 的 subagent 返回 agent ID，可以 resume 继续之前的线程。
4. checkpoint 只覆盖 agent 编辑工具的改动——Bash 命令和外部进程的改动不在内。git commit 才是完整锚点，两者配合用。

**依据**：Anthropic 官方四阶段工作流以 commit 收尾，并明确警告 checkpoint "isn't a replacement for git"（[最佳实践指南](https://code.claude.com/docs/en/best-practices)）；subagent resume 语义见 [Cursor subagents](https://cursor.com/docs/subagents.md)。

**边界**：checkpoint 是会话内的撤销机制，不是团队协作产物——需要别人（或 CI）接手的进度必须以 commit / PR 形式存在。

## 6.5 memory 文件按上下文预算写：拆分 + 按需引用

**场景**：AGENTS.md / CLAUDE.md 越写越长，agent 开始无视其中的规则。

**做法**：

1. 记住计费模型：memory 文件在**每次会话**开始时整体载入，每一行每次都消耗 token。Claude 官方给的目标是单文件 200 行以内——更长的文件"消耗更多上下文并降低遵循度"。
2. 大文档拆出去，正文用 `@` import 引用（Claude Code 语法，相对路径以所在文件为基准，最多递归 4 层）：

```text
See @README for project overview and @package.json for available npm commands.

# Additional Instructions
- git workflow @docs/git-instructions.md
- 个人偏好（跨 worktree 共享）：@~/.claude/my-project-instructions.md
```

   注意 import 的文件仍在启动时全量进入上下文——`@` 解决的是组织问题，不是预算问题。想提路径而不触发 import，用反引号包住：`` `@README` ``。
3. 只在特定路径才相关的内容，改成条件加载才真正省预算。Claude Code 用 `.claude/rules/` 的 `paths` frontmatter，规则只在 agent 读到匹配文件时载入：

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules

- All API endpoints must include input validation
- Use the standard error response format
```

   Cursor 的等价物是 `.cursor/rules/*.mdc` 的 `globs` 字段（`globs: src/components/**/*.tsx` + `alwaysApply: false`）。
4. 成套的专项流程（发布步骤、TDD 工作流）放 skills——按需加载，不占常驻预算（选型见 [02 机制选型](02-mechanism-selection.md)）。
5. 给维护者的注释写成 HTML 注释：Claude Code 注入上下文前会剥掉 `<!-- ... -->` 块级注释，不花 token。

**依据**：`@` import 语法、200 行目标、`paths` 规则、HTML 注释剥离均来自 [Claude memory 官方页](https://code.claude.com/docs/en/memory)；Cursor `globs` 语法见 [rules 官方页](https://cursor.com/docs/rules.md)；"Bloated CLAUDE.md files cause Claude to ignore your actual instructions" 见 [最佳实践指南](https://code.claude.com/docs/en/best-practices)。

**边界**：`@` import 是 Claude Code 专属语法，Codex / Cursor / Copilot 不解析；跨工具通用的按需引用写法是正文一句"改 X 前先读 docs/Y.md"。

**反模式**：把风格指南整本粘进 memory 文件——Cursor 官方点名这是错法："Use a linter instead. Agent already knows common style conventions."
