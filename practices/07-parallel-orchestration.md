# 07 — 并行与编排

> 适用工具：Claude Code · Codex · Cursor · Copilot · 验证于 2026-08

单个 agent 会话的吞吐上限由上下文窗口和串行执行决定。本章解决的问题是：哪些工作可以拆给多个 agent 并行、怎么拆才不会互相踩、以及拆完之后怎么安全地合回来。

## 7.1 只并行真正独立的任务

**场景**：手上有一批任务想同时派给多个 agent，但不确定哪些能并行、哪些必须排队。

**做法**：

1. 对每对任务 (A, B) 只问一个问题：B 是否需要读取 A 产出的文件、接口或决策？答案是"是"才串行，其余全部并行。这是唯一的串行判据——"感觉有关联"不算数。
2. 读多写少的任务（探索、跑测试、triage、总结）直接并行；多个 agent 同时写代码的任务先过 7.2 的所有权检查再并行。
3. 如果 B 只依赖 A 的一小块产物（如一个接口签名），先自己把这块契约定下来，写进两个任务的 prompt，然后 A、B 照常并行。
4. 派发时明确划分、等待策略和回传格式：

```text
把下面三件事并行派给三个 subagent，互不等待，全部完成后按类别汇总：
1. 审查 src/auth/ 的安全风险
2. 找出 tests/ 里没有断言的测试
3. 统计 src/api/ 中未被引用的导出
每个 subagent 只读代码，返回带文件路径引用的清单。
```

**依据**：Codex 官方建议从读多的任务（探索、测试、triage、总结）起步用并行 agent，并对并行写代码保持警惕——多个 agent 同时编辑会产生冲突和协调开销（[Codex: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)）。

**边界**：每个 subagent 独立消耗 token，官方明确并行工作流比同等的单 agent 运行更贵；两分钟能串行做完的小事不值得编排开销。

**反模式**：把一条流水线（生成代码 → 写测试 → 跑测试）拆成三个"并行"agent——后两个只会空转，或基于过期状态工作。

## 7.2 事先定义文件所有权与集成顺序

**场景**：多个 agent 要同时修改同一个仓库的代码。

**做法**：

1. 派发前列一张所有权表：每个 agent 独占哪些目录和文件；共享文件（路由表、全局配置、lockfile）指定唯一的负责方。
2. 跨任务的契约（接口签名、schema、事件格式）由你先定好，写进每个 agent 的 prompt，不留给 agent 之间事后协商。
3. 规定集成顺序：谁先合入主干，后合入者负责 rebase 并解决冲突。
4. 把以上三条直接写进派发 prompt：

```text
你负责实现搜索功能。文件所有权：
- 你只修改 src/search/ 与 tests/search/
- src/routes.ts 由另一个 agent 统一修改；你需要新路由时，把路由声明写到 src/search/ROUTES.md
- 接口契约：searchItems(query: string, limit: number): Promise<Item[]>，不得更改签名
完成后不要合并，停在分支上等待集成指令。
```

**依据**：Codex 官方指出多个 agent 同时编辑代码会产生冲突并增加协调开销（[Codex: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)）；Anthropic 对并行会话的对应建议是用隔离检出让"edits don't collide"（[Claude Code 官方指南](https://code.claude.com/docs/en/best-practices)）。

**边界**：所有权表本身有维护成本。两个 agent 各改一个互不相干的目录时，prompt 里一句"只改 X 目录"即可，不需要完整的表。

**反模式**：让两个 agent"改完自己解决冲突"——冲突解决发生在双方都看不到对方意图的时刻，产物是缝合怪。

## 7.3 用 git worktree 给每个 agent 一个隔离检出

**场景**：在同一台机器上跑多个 agent 会话，各做各的分支，要求文件系统层面互不干扰。

**做法**：

1. 在仓库根目录为每个并行任务创建独立 worktree 和分支：

```bash
git worktree add ../myrepo-auth -b agent/auth
git worktree add ../myrepo-search -b agent/search
```

2. 每个终端进入一个 worktree，各启动一个 agent 会话：

```bash
cd ../myrepo-auth && claude
```

```bash
cd ../myrepo-search && codex
```

3. 任务完成后回到主检出，按 7.2 定好的顺序合并，然后清理：

```bash
cd ../myrepo
git merge agent/auth
git merge agent/search
git worktree remove ../myrepo-auth
git worktree remove ../myrepo-search
git branch -d agent/auth agent/search
git worktree list
```

`git worktree list` 最后应只剩主检出一行；若 remove 报错说明 worktree 内有未提交改动，先回去处理再清理。

4. Claude Code 的 subagent 还能在定义文件里声明 `isolation: worktree`，由工具在会话内自动创建并守护隔离检出，不需要手工执行上述命令。

**依据**：Anthropic 官方把 worktree 列为并行会话的第一种形态——"run separate CLI sessions in isolated git checkouts so edits don't collide"（[Claude Code 官方指南](https://code.claude.com/docs/en/best-practices)）；`isolation: worktree` 字段及其强制检查见 [Claude Code: Subagents](https://code.claude.com/docs/en/sub-agents)。

**边界**：worktree 共享同一个对象库但不共享未跟踪文件——`node_modules`、构建缓存要在每个 worktree 里单独安装。纯只读探索任务不需要 worktree，读操作本来就不冲突。

**反模式**：多个写代码的 agent 共用一个检出，靠"盯紧一点"避免互相覆盖。

## 7.4 按探索型 / 实施型 / 评审型给 subagent 分工

**场景**：一个复杂任务既要大量搜索代码，又要动手修改，还需要独立把关；全部塞进主会话会撑爆上下文。

**做法**：

1. **探索型**：只读工具，负责搜代码、定位文件、收集证据，只把结论带回主会话。Claude Code 内置 Explore、Codex 内置 explorer、Cursor 内置 Explore，均为只读探索 agent。
2. **实施型**：拿到探索结论后做修改，改动范围限定在 7.2 分配的文件内。Codex 内置 worker，Claude Code 用 general-purpose 或自定义 agent。
3. **评审型**：在全新上下文里审 diff——评审者没有实现者的推理历史，只基于结果和你给出的标准做判断。示例定义（Claude Code 格式）：

```markdown
---
name: code-reviewer
description: Reviews diffs for correctness, security, and missing tests
tools: Read, Glob, Grep
model: sonnet
---
你是代码评审者。只报告影响正确性或既定需求的缺口，
附文件路径与行号，不提风格意见。
```

4. 自定义 subagent 定义文件位置：Claude Code 用 `.claude/agents/*.md`（用户级 `~/.claude/agents/`），Codex 用 `.codex/agents/*.toml`（用户级 `~/.codex/agents/`），Cursor 用 `.cursor/agents/*.md` 并兼容读取 `.claude/agents/` 与 `.codex/agents/`；Copilot 官方文档（截至验证日期）没有 subagent 定义文件机制，其可核实的按需定制入口是 agent skills。

**依据**：Claude Code 定义了只读的 Explore/Plan 内置 subagent 与 `.claude/agents/` 自定义格式（[Claude Code: Subagents](https://code.claude.com/docs/en/sub-agents)）；Codex 内置 default/worker/explorer 并从 `.codex/agents/` 读取 TOML 自定义 agent（[Codex: Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)）；Cursor 内置 Explore/Bash/Browser 并列出三个兼容目录（[Cursor: Subagents](https://cursor.com/docs/subagents.md)）；对抗式评审 subagent 的用法见 [Claude Code 官方指南](https://code.claude.com/docs/en/best-practices)；Copilot 的 skills 目录见 [Copilot: About agent skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills)。

**边界**：评审型 agent 被要求找问题时总能找出一些。Anthropic 官方提醒：只处理影响正确性或既定需求的发现，其余当可选项——否则评审意见会把实现推向过度设计。

**反模式**：给评审型 agent 写权限——它会顺手"修掉"发现的问题，评审和实现又混回同一个上下文。

## 7.5 维护型杂活批量派发

**场景**：同构的机械任务重复出现在几十个文件或多个仓库：升级依赖、替换废弃 API、统一 CI 配置。

**做法**：

1. 先让 agent 生成任务清单文件（如 `repos.txt`），不要边扫描边修改。
2. 写一个循环，对每项调用一次非交互模式，权限收窄到任务所需：

```bash
# Claude Code：对清单里的每个仓库跑同一个修复
for repo in $(cat repos.txt); do
  (cd "$repo" && claude -p "把 CI 配置里的 node 18 升级到 22，改完运行 npm test，最后只输出 OK 或 FAIL" \
    --allowedTools "Edit,Read,Bash(npm test),Bash(git commit *)")
done
```

```bash
# Codex：读写沙箱内跑同一任务，JSONL 输出便于脚本收集结果
for repo in $(cat repos.txt); do
  (cd "$repo" && codex exec --sandbox workspace-write --json \
    "把 CI 配置里的 node 18 升级到 22，改完运行 npm test")
done
```

3. 先在 2-3 个目标上试跑，根据失败样本改 prompt，再对全量放行。
4. 要求每次调用输出机器可读的结果（`OK`/`FAIL` 或 `--json` 事件流），失败项收集后单独重派，不混在成功批次里重跑。

**依据**：Anthropic 官方的 fan-out 模式即"生成清单 → 循环调用 `claude -p` → 小样本试跑再放量"，并用 `--allowedTools` 限权（[Claude Code 官方指南](https://code.claude.com/docs/en/best-practices)）；`claude -p` 与 `codex exec` 是两家官方的脚本化入口，后者默认只读沙箱、写操作需显式 `--sandbox workspace-write`（[Claude Code: Headless](https://code.claude.com/docs/en/headless)、[Codex: Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)）。

**边界**：需要跨文件判断力的任务（架构调整、边界模糊的重构）不属于批量派发。`--sandbox danger-full-access` 只用在隔离的 CI runner 或容器里，Codex 官方对此有同样限定。

**反模式**：跳过小样本直接对 2000 个文件放量——prompt 的第一个缺陷会被原样复制 2000 遍。

---

**位置**：轴一 · 读得懂 — 上一章 [06 上下文管理](06-context-management.md) · 下一章 [08 安全与治理](08-security-governance.md)

**相关**：[06 上下文管理](06-context-management.md) · [10 硬约束下沉](10-hard-constraints.md)

**对应检查**：无 —— 编排纪律没有仓库内证据（规矩停在提示层，见 [10 硬约束下沉](10-hard-constraints.md)）

