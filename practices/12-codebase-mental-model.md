# 12 — 理解陌生代码库：把「为什么」也问出来

> 适用工具：Claude Code · Codex · Cursor · Copilot（skills 互通情况见[对照表](../rosetta/)）· 验证于 2026-09

03 章说「不熟的仓库先让 agent 探索，再动手编辑」。本章把「探索」拆成四个可以反复执行的问题，并把它固化成仓库里的一份 skill：**/how** 问运行时怎么走、**/why** 问当初为什么这么写、**/teach** 要求它讲清取舍、**/recall** 把上次的结论取回来。四件事都指向同一个目的——让你和 agent 共用一份能被检验的理解，而不是各自脑补一套。

## 12.1 /how：先把运行时问清楚，再谈改法

**场景**：要改的模块你没读过，agent 已经开始列改动清单；或者它说「已经理解了代码结构」，依据只是它读过文件。

**做法**：

1. 用「它怎么跑起来」的问题开场，而不是「它由哪些文件组成」：

   ```text
   解释 [src/pricing/] 的运行时行为，不要罗列目录：
   - 一次请求从入口到落库经过哪些函数，按调用顺序列出文件:行
   - 哪一步做了校验，哪一步做了缓存，缓存失效的触发点在哪
   - 改 [discount 计算] 时最容易踩的三个坑，各给一个仓库里的例子
   ```

2. 追问边界而不是细节：「这段代码在什么输入下会走到那个分支？谁调用它？如果拿掉这个判断会怎样？」
3. 要求它把结论落进文件（见 [06 上下文管理](06-context-management.md) 的 6.3），不要只停在对话里——对话会被压缩，文件不会。
4. 拿不准就让它先跑起来再回答：能起服务就起服务，能跑单测就跑单测，用观察到的行为修正它的叙述（UI 类见 [11 验证技能](11-verification-skills.md)）。

**依据**：Anthropic 官方工作流是 "Explore first, then plan, then code"，并确认「像问资深工程师一样提问」不需要特殊技巧（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）；Codex 官方给出的 "Explain a codebase" 工作流要求回答里包含各模块职责、数据在哪被校验、以及改动时要注意的 gotcha（[Codex: Workflows](https://developers.openai.com/codex/workflows)）。

**边界**：已熟悉的路径重复探索只烧上下文；探索的产出（调用链、涉及文件、坑）应当进计划或 spec 文件，而不是靠会话记忆。

**反模式**：「读一下整个仓库，告诉我怎么改」——它会把上下文填满，然后用最像答案的那段代码回答你。

## 12.2 /why：改动动机在历史里，不在代码里

**场景**：一段代码看起来完全多余——写死的超时、绕一圈的兼容分支、被注释掉的断言——「删掉它会怎样」没人答得上来。

**做法**：

1. 先查这段代码是哪个提交引入或删除的（`-S` 找的是「出现次数发生变化」的提交，不是文本搜索）：

   ```bash
   git log -S "REQUEST_TIMEOUT_MS" -- src/api/client.ts
   git log --oneline -20 -- src/api/client.ts    # 先看这条路径最近发生了什么
   ```

2. 想知道某一行/某个函数是怎么一步步演变成现在这样的，用行区间或函数名追踪：

   ```bash
   git log -L 120,180:src/api/client.ts
   git log -L '/function retryRequest/,/^}/:src/api/client.ts'
   ```

3. 想找「最后改这行的人是谁、在哪个提交」，用 blame 并限定行区间；整文件改名它也会跟着追：

   ```bash
   git blame -L 120,140 src/api/client.ts
   ```

4. 拿到提交号后去读那次提交的信息、关联的 PR 讨论和 issue——动机几乎只写在那里。GitHub 上可以按消息内容、作者、时间搜提交：

   ```text
   repo:acme/svc "timeout" author:liwei committer-date:>2025-01-01
   ```

5. 结论写回来：在代码旁留一行注释指向提交/PR，或写进 ADR。下一个来问的人（和 agent）就不用再考古一遍。

**依据**：`-S<string>` 的官方定义是「查找使指定字符串出现次数发生变化的差异（即增删）」、`-L` 是「追踪 `start,end` 行区间或函数名匹配区间在文件内的演进」（[git-log](https://git-scm.com/docs/git-log)）；`git blame` 是「显示每一行最后被哪个修订、哪个作者修改」，`-L` 可把标注限制在指定行，重命名会被自动跟随（[git-blame](https://git-scm.com/docs/git-blame)）；GitHub 官方支持按提交消息内容与作者/时间限定搜索提交（[Searching commits](https://docs.github.com/en/search-github/searching-on-github/searching-commits)）。

**边界**：查不到动机就写「未知」，别让 agent 从代码风格倒推一个故事——编出来的理由比没有理由更贵。历史不等于正当性：「一直都这样」不是保留它的理由，只是说明没人敢动。squash 合并或 rebase 之后 blame 只能指到最近一次改动，这时要回到 PR 里找原始讨论。

**反模式**：让 agent「分析一下这段代码为什么这么写」然后接受一段听起来合理的推测——它没有 git 历史以外的信息，也没有读过当年的工单。

## 12.3 /teach：要取舍，不要结论

**场景**：agent 给了你一个方案，你没法判断它是不是更好；或者你需要在评审里向别人解释这个改动。

**做法**：

1. 把问题从「哪个对」换成「各自牺牲了什么」：

   ```text
   针对 [把同步调用换成队列] 给两个方案，按这个格式各写一段：
   - 方案：一句话
   - 换来什么 / 牺牲什么：各一到两条，指名具体代价（延迟、运维面、测试方式）
   - 什么条件下我会改用另一个：给出可观测的触发条件
   ```

2. 要求它引用仓库里的既有做法作为对照：「仓库里有没有已经在用队列的地方？它们为什么适合，为什么不适用于这里？」
3. 让它自己说出什么证据会推翻它的建议——说不出，就说明这个建议还没被检验。

**依据**：Anthropic 官方把「用你能理解的方式解释」列为探索阶段的目的之一，并给出向 agent 追问实现细节与边界条件的提问方式（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）；Codex 的 explain 工作流同样要求给出各模块职责与 gotcha，而不是结论（[Codex: Workflows](https://developers.openai.com/codex/workflows)）。

**边界**：取舍清单不能替代决策——你负责选，它负责把代价摆到台面上。深层设计分歧不要靠追问解决，去写一个能跑的原型（结论见下条的做法 4）。

**反模式**：「你觉得哪种更好？」——你会得到一段自信的推荐，而不是两条可以比较的代价。

## 12.4 /skill：把这四个问题固化成仓库里的技能

**场景**：同一套问题每次开新会话都要重打一遍；或者反过来，CLAUDE.md 已经长到 agent 开始忽略里面的规矩。

**做法**：

1. 把「反复粘贴的流程」搬进 skill，不要塞进 memory 文件——skill 正文只在被用到时载入，常驻的 memory 文件每行都在花每次会话的预算：

   ```text
   .agents/skills/repo-mental-model/SKILL.md   # 跨工具（Codex / Cursor / Copilot）
   .claude/skills/repo-mental-model/SKILL.md   # Claude Code 只读这里，用软链指过去
   ```

   各家实际读取的目录与互通情况见[对照表](../rosetta/)（逐格核实，2026-09）。

2. frontmatter 至少写 `name` 与 `description`。`name` 必须与目录名一致、小写字母数字加连字符；`description` 决定 agent 什么时候自动加载它——写清「做什么」和「什么时候用」：

   ```markdown
   ---
   name: repo-mental-model
   description: 用 git 历史回答「这段代码为什么是这样」，查不到动机时如实说未知。用于调查陌生模块、可疑的兼容分支，或改动前没人记得缘由的代码。
   ---
   ```

3. 正文写步骤和输出格式（怎么问、按什么结构回答、查不到时怎么办），不要写通用原则。
4. 本仓库自己带一个可用的例子：[`repo-mental-model`](https://github.com/alloevil/agents-with-receipts/blob/main/.agents/skills/repo-mental-model/SKILL.md)——把 12.1–12.3 的问法写成了一份可直接提交的 skill，`agents-doctor` 的 `skills` 检查会数出它。
5. 写完跑一遍检查，确认仓库真的认得它：

   ```bash
   node tools/agents-doctor/index.mjs .
   ```

**依据**：Claude Code 官方定义 skills 为「把反复粘贴的指令、清单或多步流程写成 `SKILL.md`」，并说明「与 CLAUDE.md 不同，skill 正文只在被使用时载入」，`description` 用于判断何时自动加载，项目级位置是 `.claude/skills/<skill-name>/SKILL.md`（[Extend Claude with skills](https://code.claude.com/docs/en/skills)）；Agent Skills 规范规定 `name` 必填且必须与父目录同名、`description` 必填且应同时说明用途与使用时机，并规定渐进披露：启动时只载入元数据，正文在激活时载入、建议 500 行以内（[Specification](https://agentskills.io/specification)）；这套格式是跨工具的开放标准，Claude Code 也声明遵循它（[Agent Skills](https://agentskills.io)）。

**边界**：事实（命令、约定、禁改目录）留在 memory 文件，流程才进 skill——两边串了会同时得到「每次都付费」和「该用时不加载」。skill 不是越多越好：没人用的 skill 只是没人读的文档。改 skill 内容后按各工具的重载方式生效，不要假设立刻生效。

**反模式**：把整本规范粘进 `CLAUDE.md`——它的每一行都会进入每次会话，而 skill 的正文只在用到时才付费。

## 12.5 /recall：把上下文取回来，但别只放在会话里

**场景**：上周那次调查的结论、某个决定的理由，只存在于某个会话里，而你要接着往下做。

**做法**：

1. 接着上一次的会话继续，而不是从零重开：

   ```bash
   claude -c                      # 继续当前目录下最近一次会话
   claude -r "auth-refactor"      # 按会话 ID 或名字恢复
   ```

2. 给长会话起可检索的名字，让 `-r` 有意义。
3. 更可靠的一条：把结论写进仓库——spec、ADR、失败证据模板、代码旁的一行注释。会话记录是本地个人资产，仓库文件才是团队资产，也是下一个 agent 唯一的入口。
4. 跨工具或换机器时不要指望会话历史：把上下文重建的成本，压到「读一个文件」的量级。

**依据**：Claude Code 官方 CLI 提供 `claude -c`（继续当前目录最近一次会话）与 `claude -r "<session>"`（按 ID 或名字恢复会话）（[CLI reference](https://code.claude.com/docs/en/cli-reference)）。

**边界**：会话恢复属于个人机器上的状态，不进版本控制、不随人走；决定一旦只留在会话里，就等于没记录下来。

**反模式**：把「上次讨论的结论」当成团队共识——它只在你那台机器上存在。

---

**位置**：轴一 · 读得懂 — 上一章 [08 安全与治理](08-security-governance.md) · 下一章 [09 可验证的仓库](09-verifiable-repo.md)（轴二 · 验得动）

**相关**：[03 任务框架与规划](03-task-framing.md) · [06 上下文管理](06-context-management.md)

**对应检查**：`agents-doctor` 的 `skills` · `adr`

