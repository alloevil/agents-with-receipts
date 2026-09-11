# 03 — 任务框架与规划

> 适用工具：Claude Code · Codex（框架通用） · 验证于 2026-09

agent 拿到的第一条 prompt 决定它解决的是哪个问题。本章给出把任务写成 agent 能执行、能自查的方法：四要素结构、先规划后动手、先探索后编辑、以及可验证的完成条件。

## 3.1 用 Goal / Context / Constraints / Done-When 四要素写任务

**场景**：任务超过"改一行"的量级——多文件改动、修 bug、新功能——一句话描述会让 agent 自行脑补缺失的信息。

**做法**：

1. 按四段写 prompt：说清要什么行为（Goal）、指向相关代码或复现步骤（Context）、保住关键约束（Constraints）、说明如何验证（Done-When）。这个四段结构是本手册的综合，其中「复现步骤 + 验证方式」和「约束比高层描述更重要」两句都是 Codex 官方原文（见本节依据）。
2. 模板（替换方括号内容后直接可用）：

   ```text
   Goal: [要实现/修复的具体行为，一句话]

   Context:
   - 相关代码：@src/settings/save.ts @src/api/client.ts
   - 复现步骤：
     1) npm run dev
     2) 打开 /settings，切换 "Enable alerts"，点 Save
     3) 刷新页面：开关被重置

   Constraints:
   - Do not change the API shape.
   - Keep the fix minimal and add a regression test.

   Done-When:
   - 上面的复现步骤不再触发 bug
   - npm run lint && npm test -- settings 全绿，贴出命令和输出
   ```

3. 坏/好对比：

   | 坏 | 好 |
   |---|---|
   | "fix the login bug" | "用户反馈 session 超时后登录失败。查 src/auth/ 的 auth flow，重点看 token refresh。先写一个复现该问题的失败测试，再修复它" |

**依据**：Codex 官方 prompting 指引要求 "Include steps to reproduce an issue, validate a feature, and run linting and pre-commit checks"，并把复杂任务拆小（[Prompting Codex](https://developers.openai.com/codex/prompting)）；其 bug 修复工作流把「复现步骤与约束」标为 "these matter more than a high-level description"（[Workflows](https://developers.openai.com/codex/workflows)）；坏/好对比出自 [Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)。

**边界**：一句话能说清 diff 的小改动（改 typo、加一行 log、重命名变量）直接下指令，四要素是负担不是帮助。探索性提问也不用套模板——"这个文件你会改进什么？"这类模糊 prompt 在你能承受纠偏成本时反而能带来意外收获。

**反模式**：四段都写满但 Done-When 只有"确保正常工作"——等于没写。

## 3.2 复杂任务先进 Plan mode，或让 agent 反向面试你

**场景**：方案不确定、改动跨多文件、或你自己说不清完整需求——直接开写大概率解决错误的问题。

**做法**：

1. Claude Code：按 `Shift+Tab` 切到 plan mode（状态栏显示 `⏸ plan mode on`），或启动时指定；单条消息计划用 `/plan` 前缀。

   ```bash
   claude --permission-mode plan
   ```

   plan mode 下 Claude 只读文件、跑探索命令、写计划，不改源码。计划就绪后按 `Ctrl+G` 可在编辑器里直接修改计划再批准；批准即退出 plan mode 开始执行。
2. Codex：在 app composer 输入 `/plan`，让它先调查并提出方案再动手编辑；IDE 里有 `$plan` skill 时显式调用它产出重构计划，再逐条谈判修订。
3. 需求本身模糊时，反过来让 agent 面试你，产出 spec 后另开新会话执行：

   ```text
   I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.

   Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask obvious questions, dig into the hard parts I might not have considered.

   Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
   ```

**依据**：Claude plan mode 的进入方式与只读行为见 [Permission modes](https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode)；Codex `/plan` 与 `$plan` 入口见 [Workflows](https://developers.openai.com/codex/workflows)；面试式 prompt 模板逐字出自 [Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)。

**边界**：Anthropic 官方明说 plan mode 有额外开销："如果你能用一句话描述 diff，就跳过计划"。计划最值钱的三种情况：方案不确定、改动跨多文件、你不熟悉被改的代码。

**反模式**：把 plan mode 当免死金牌——每个 typo 修复都先出一页计划，会话烧在仪式上。

## 3.3 不熟的仓库先让 agent 探索，再动手编辑

**场景**：接手陌生服务、新加入的仓库、或要改的模块你从没读过。

**做法**：

1. 在 plan mode 里先下纯探索指令，不带任何编辑要求：

   ```text
   read /src/auth and understand how we handle sessions and login.
   also look at how we manage environment variables for secrets.
   ```

2. 像问资深工程师一样提问："How does logging work?"、"How do I make a new API endpoint?"、"What edge cases does `CustomerOnboardingFlowImpl` handle?"——官方确认这类问题不需要特殊 prompt 技巧，直接问。
3. 探索完成后再要计划、再实现，走完整四阶段：Explore → Plan → Implement → Commit。
4. Codex 对应工作流：打开或 `@` 附上相关文件，让它解释请求流再动手：

   ```text
   Explain how the request flows through the selected code.

   Include:
   - a short summary of the responsibilities of each module involved
   - what data is validated and where
   - one or two "gotchas" to watch for when changing this
   ```

**依据**：Anthropic 官方推荐工作流是 "Explore first, then plan, then code"，四阶段与探索 prompt 均出自 [Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)；Codex 的 "Explain a codebase" 工作流见 [Workflows](https://developers.openai.com/codex/workflows)。

**边界**：已熟悉的代码路径重复探索只烧上下文。探索的产出（结论、涉及文件清单）应固化进计划或 spec 文件，不要依赖对话记忆——对话会被压缩，文件不会。

## 3.4 把关键约束写进首条 prompt，用 @ 精确附上文件

**场景**：任务有不可违反的红线（API 形状不能变、已批准的数字不能改），或你已经知道该看哪些文件。

**做法**：

1. 约束在 agent 动手之前就写进 prompt 的 Constraints 段，只留一两条最要命的，不要等它做错再纠正：

   ```text
   Constraints:
   - Do not change the API shape.
   - Use only the supplied sources. Flag missing information instead of guessing.
   ```

2. 用 `@` 直接引用文件，代替描述"代码大概在哪"：Claude Code 里写 `@src/auth/token.ts`，agent 回答前会先读该文件；Codex CLI 里用 `@` 路径自动补全，或用 `/mention` 附加指定文件。
3. 记住各 surface 的默认上下文差异：Codex IDE 扩展自动带上你打开的文件；CLI 里必须显式写路径或 `@` 附件。

**依据**：Codex 的 bug 修复工作流注明复现步骤和约束 "matter more than a high-level description"（[Workflows](https://developers.openai.com/codex/workflows)）；`@` 文件引用与 IDE/CLI 上下文差异见 [Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)与 [Workflows](https://developers.openai.com/codex/workflows)。

**边界**：对每次会话都成立的规则（测试命令、代码风格、禁改目录）属于 AGENTS.md / CLAUDE.md 这类 memory 文件，不该在每条 prompt 里重复；prompt 里只留本任务特有的约束。

**反模式**："别忘了遵守我们的编码规范"——agent 不知道你的规范是什么，也没被给到写着规范的文件。

## 3.5 把 Done-When 写成可执行的检查，不是形容词

**场景**：任何你打算离开屏幕的任务，或打算一次接受较大 diff 的任务。

**做法**：

1. 完成条件写成 agent 自己能跑、能读到 pass/fail 的东西：测试命令、构建退出码、linter、对比 fixture 的脚本、浏览器截图对照。
2. 在 prompt 里写明具体用例和"实现后要跑测试"：

   ```text
   write a validateEmail function. example test cases: user@example.com is true,
   invalid is false, user@.com is false. run the tests after implementing
   ```

3. 修复类任务要求 agent 修完重跑复现步骤，并跑最小相关检查：

   ```text
   After the fix, run lint + the smallest relevant test suite. Report the commands and results.
   ```

4. 要证据不要断言：让 agent 贴出测试输出、执行过的命令及返回值、或结果截图。你审证据比自己重跑验证快，也覆盖你不在场的会话。
5. 长任务可以把完成条件升级成 Codex 的 Goal mode：用 `/goal` 启动（app / IDE / CLI），目标文本同时充当起始 prompt 与完成判据，Codex 据此决定下一步和何时收工。写目标时带上具体结果、可测指标或测试判据，官方示例是 "Migrate this codebase from JavaScript to TypeScript. The app should compile in strict mode without explicit `any` type definitions."（[Prompting: Goal mode](https://developers.openai.com/codex/prompting#goal-mode)）。

**依据**：Anthropic 官方："Claude stops when the work looks done"——没有可跑的检查时你本人就是验证环节，每个错误都要等你发现；给出 pass/fail 信号后循环自动闭合（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）。Codex 同样要求 prompt 带上验证方式（"Include steps to reproduce an issue, validate a feature, and run linting and pre-commit checks"），并在修复后重跑 repro（[Prompting Codex](https://developers.openai.com/codex/prompting) · [Workflows](https://developers.openai.com/codex/workflows)）；Goal mode 见 [Prompting: Goal mode](https://developers.openai.com/codex/prompting#goal-mode)。

**边界**：检查本身要快——完成条件挂在十分钟的全量集成测试上，agent 的自查循环会退化成你等结果；挂最小相关测试集，全量检查留给 CI。验证闭环的升级形态（test-first、独立评审、Stop hook 硬门禁）见验证闭环一章。

**反模式**：Done-When 写"代码质量高、无明显问题"——没有命令、没有测试名，agent 无法自查，只能"看起来完成了"就停。

---

**位置**：轴一 · 读得懂 — 上一章 [02 机制选型](02-mechanism-selection.md) · 下一章 [04 验证闭环](04-verification.md)

**相关**：[06 上下文管理](06-context-management.md) · [12 理解陌生代码库](12-codebase-mental-model.md)

**对应检查**：无 —— 任务写法没有机械检查项（规矩停在提示层，见 [10 硬约束下沉](10-hard-constraints.md)）

