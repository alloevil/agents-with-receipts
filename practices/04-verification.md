# 04 — 验证闭环

> 适用工具：Claude Code · Codex · 所有读 AGENTS.md 的工具 · 验证于 2026-09

Agent 在"看起来完成"时就会停手；没有一个它能自己运行的检查，你本人就是验证环节，每个错误都要等你发现。本章给出把验证做成闭环的五个手段：agent-TDD、独立评审、秒级静态检查、diff 对账、验收命令入库。目标是让 agent 自己跑检查、读结果、迭代到通过，而你只审证据。

本章讲的是"用 agent 时怎么验证"（工作流）。把仓库本身改造成可被验证的基建——单命令回路、确定性、结构化失败输出、flaky 治理、Feature Map——见 09 章「可验证的仓库」。

## 4.1 用 agent-TDD 把测试变成不可篡改的验收标准

**场景**：需求能写成明确的输入/输出对（API 行为、解析逻辑、边界条件），且你打算让 agent 长时间无人值守地实现。

**做法**：

1. 第一条指令只让 agent 写测试，明确禁止写实现。
2. 让 agent 运行测试并贴出失败输出，人工确认是"因缺少实现而失败"（红），而不是语法错误或环境问题。
3. 人工 commit 测试文件，形成锚点——之后任何对测试的改动都会出现在 diff 里，无法被悄悄吞掉：

   ```bash
   git add tests/rate-limit.test.ts
   git commit -m "test: rate limit acceptance (red)"
   git rev-parse HEAD   # 记下锚点 SHA
   ```

4. 发实现指令，明令禁改测试。完整 prompt 模板（两段对应两条消息，`[]` 内替换成你的内容）：

   ```text
   ── 消息 1：只写测试 ──
   读 [src/rate-limit/] 的现有代码和 [tests/] 里的测试约定。

   任务：为「[同一 IP 每分钟最多 60 次请求]」写验收测试，
   放在 [tests/rate-limit.test.ts]。覆盖：
   - [第 60 次请求通过；第 61 次被拒绝]
   - [时间窗口滑动后计数恢复]
   - [多 IP 互不影响]
   不要写任何实现代码。写完运行 [npm test -- rate-limit]，
   把失败输出原样贴出来，然后停下等我确认。

   ── 消息 2：实现（在我 commit 测试之后发送）──
   现在实现 [src/rate-limit/checkRateLimit.ts]，让上述测试通过。

   IMPORTANT: YOU MUST NOT modify, delete, or skip any file under
   [tests/]. 测试是验收标准，不是待修代码。如果你认为某条测试写错了，
   停下来向我说明，不要动它。

   循环执行「运行 [npm test -- rate-limit] → 修改实现」直到全部通过，
   最后贴出完整测试输出作为证据。
   ```

5. 全绿后人工过 diff，确认实现没有绕过测试意图（硬编码返回值、只覆盖测到的分支）：

   ```bash
   git diff a1b2c3d...HEAD   # a1b2c3d = 第 3 步的锚点 commit -- ':!tests'
   ```

**依据**：Claude Code 官方把"给 agent 一个能跑的 pass/fail 检查"列为核心工作方式，示范 prompt 是 "write a failing test that reproduces the issue, then fix it"，并推荐"一个会话写测试、另一个会话写实现让测试通过"的分工；`IMPORTANT` / `YOU MUST` 强调式指令被官方确认能提升遵从度（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）。

**边界**：没有 pass/fail 信号的任务（UI 视觉调整用截图对比，探索性 spike 用运行结果）不套这个流程；一句话能描述 diff 的小改动，写测试的成本超过收益。

**反模式**：不 commit 就让 agent 继续——agent 把失败断言"修"成通过，红绿循环形同虚设，事后无从对账。

## 4.2 让不带写作偏见的上下文评审 diff

**场景**：接受大改动之前，尤其是 agent 无人值守跑了很久之后。

**做法**：

1. Claude Code 会话内：运行自带的 `/code-review` skill，它在新的 subagent 上下文里评审当前 diff 并把发现返回主会话。要对照计划评审，自己写评审 prompt——点名评审对象、对照物和什么算问题：

   ```text
   Use a subagent to review the rate limiter diff against PLAN.md. Check that
   every requirement is implemented, the listed edge cases have tests, and
   nothing outside the task's scope changed. Report gaps, not style preferences.
   ```

2. 跨会话：另开一个会话做 Reviewer，只给它 diff 和评审标准，不给实现过程：

   ```text
   Review the rate limiter implementation in @src/middleware/rateLimiter.ts.
   Look for edge cases, race conditions, and consistency with our existing
   middleware patterns.
   ```

3. Codex：用两段式 `codex exec` 让新运行评审、再修复——第二次运行不继承第一次的实现推理：

   ```bash
   codex exec "review the change for race conditions"
   codex exec resume --last "fix the race conditions you found"
   ```

4. 可以照抄 Codex 仓库自己的做法：仓库级评审规则写进根 `AGENTS.md` 的 `## Code Review Rules` 节，每条规则写清"要标记的行为 + 安全替代路径"（[openai/codex 的 AGENTS.md](https://github.com/openai/codex/blob/main/AGENTS.md)）。

**依据**：Claude Code 官方专设 "Add an adversarial review step" 一节——fresh context 的评审者只看到 diff 和标准，不受产出该改动的推理影响（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）；Codex 的两段式 exec/resume 评审模式见 [Non-interactive mode](https://developers.openai.com/codex/noninteractive)；`## Code Review Rules` 这一节出自 Codex 仓库自己的 [AGENTS.md](https://github.com/openai/codex/blob/main/AGENTS.md)，不是 Codex 的文档化功能。

**边界**：被要求找问题的评审者总会找出问题——官方明确警告全盘采纳会导致过度工程（多余抽象层、防御代码、测不可能发生的用例）。指令里限定只报影响正确性或既定需求的 gap，其余当可选建议。小 diff 人眼直接过更快。

**反模式**：把评审发现原样贴回实现会话让它"全部修掉"，不做取舍。

## 4.3 先架好秒级 lint / 类型检查，agent 才能自纠错

**场景**：agent 提交的代码连编译都不过，或反复引入同类类型错误。

**做法**：

1. 保证仓库里存在一条命令、几秒返回、退出码可靠的静态检查（`npm run lint`、`tsc --noEmit`、`cargo check`）。退出码就是 agent 能读的 pass/fail 信号。
2. 把检查写进 memory 文件，用官方示例的写法——精确到时机：

   ```markdown
   # Workflow
   - Be sure to typecheck when you're done making a series of code changes
   - Prefer running single tests, and not the whole test suite, for performance
   ```

3. 必须 100% 发生的检查升级成 hook。memory 文件是建议性的（advisory），hook 是确定性的（deterministic）。Claude Code 里可以直接让它替你写：

   ```text
   Write a hook that runs eslint after every file edit
   ```

**依据**：Claude Code 官方把 "a build exit code, a linter" 列为闭环检查的合法形式，上述 CLAUDE.md 与 hook prompt 均为官方原文示例，advisory 与 deterministic 的区分也来自同页（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)；hook 事件与配置细节见 [Hooks](https://code.claude.com/docs/en/hooks)）。

**边界**：噪音大、团队自己都不遵守的 lint 规则先修配置再接入 agent，否则 agent 会把轮次耗在没人关心的告警上；分钟级的全量集成测试不要挂在"每次编辑后"的 hook 上——慢反馈会拖垮整个循环，留给任务结束前跑。

## 4.4 用 git diff --stat 对账改动规模

**场景**：批量替换、跨文件重命名、依赖迁移——任何"预期改动范围可以事先说清"的操作之后。

**做法**：

1. 动手前先要预期数字：让 agent 报告"将改动哪些文件、大约多少处"。
2. 完成后对账：

   ```bash
   git diff --stat          # 每个文件的增删行数 + 总计
   git diff --stat HEAD~1   # 已 commit 时对上一个提交
   ```

3. 核对两件事：**文件清单**里有没有不该出现的文件；**行数量级**是否与预期一致。一个"只改 import 路径"的任务出现 +400/-380，就是当场停下的信号。
4. 数字对不上时定位到具体文件再看全文 diff：

   ```bash
   git diff --stat | sort -t'|' -k2 -rn | head   # 改动最大的文件排前
   git diff -- path/to/suspicious-file
   ```

   典型案例：批量升级某个依赖的版本号，lockfile 里其它依赖恰好同版本号也被替换——单看抽样 diff 发现不了，行数对账当场截获。

**依据**：Claude Code 官方要求评审时确认 "nothing outside the task's scope changed"，并要求 agent 以证据（命令与输出）而非断言来声明成功——`git diff --stat` 就是范围核对最便宜的证据（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）。

**边界**：生成代码、快照、lockfile 的行数天然巨大，先用 pathspec 排除再对账（`git diff --stat -- . ':!*.snap' ':!package-lock.json'`），被排除的文件单独抽查。

**反模式**：只看 agent 的文字总结"已完成 N 处替换"就合并，不与 git 的数字对照。

## 4.5 把验收命令写进 AGENTS.md 让 agent 自跑

**场景**：每个任务都要手动提醒 agent"记得跑测试"，而它有时跑、有时不跑。

**做法**：

1. 在 AGENTS.md 里开 Testing instructions 节，命令写到 flag 和路径级，并包含"跑单个测试"的过滤方式：

   ```markdown
   ## Testing instructions
   - Run `pnpm turbo run test --filter <project_name>` to run every check
     defined for that package.
   - To focus on one step, add the Vitest pattern:
     `pnpm vitest run -t "<test name>"`.
   - Fix any test or type errors until the whole suite is green.
   - After moving files or changing imports, run
     `pnpm lint --filter <project_name>`.
   ```

2. 跨仓库通用的验收约定放 Codex 全局层 `~/.codex/AGENTS.md`，写成"动作 → 触发条件"：

   ```markdown
   ## Working agreements
   - Always run `npm test` after modifying JavaScript files.
   ```

3. 验证 agent 真的读到了：`codex --ask-for-approval never "Summarize the current instructions."`，输出应复述你写的条目。

**依据**：agents.md 官方 FAQ 确认"列出的测试命令 agent 会自动执行相关检查并在结束任务前修复失败"，上述 Testing instructions 为官方示例文件原文（[agents.md](https://agents.md)）；全局 `~/.codex/AGENTS.md` 分层与验证命令见 [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)。

**边界**：全量套件跑一次要几分钟的仓库，只把过滤后的单测命令写成默认动作，全量命令标注"合并前跑一次"；AGENTS.md 里的指令是建议性的，agent 可能跳过——必须无一例外执行的检查用 hook 兜底（见 4.3）。

**反模式**：写"跑测试"三个字不带命令——agent 猜一个错误的 runner，把轮次耗在修环境上。

---

**位置**：轴一 · 读得懂 — 上一章 [03 任务框架与规划](03-task-framing.md) · 下一章 [05 权限与沙箱](05-permissions-sandbox.md)

**相关**：[09 可验证的仓库](09-verifiable-repo.md) · [11 验证技能](11-verification-skills.md)

**对应检查**：`verify-doctor` 的 `evidence-template`

