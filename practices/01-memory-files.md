# 01 — Memory 文件：AGENTS.md / CLAUDE.md 的写法与维护

> 适用工具：Claude Code · Codex · Cursor · GitHub Copilot · 验证于 2026-08

memory 文件是 agent 每次会话都要付费加载的常驻上下文：写少了 agent 重复犯错，写多了反而淹没关键指令。本章给出从起步、写法、调优，到跨工具共享与 CI 门禁的完整维护路径。每条做法都对应到四家官方文档的原文。

## 1.1 从 20-30 行起步，只写 agent 推断不出的事实

**场景**：新项目第一次写 memory 文件，或者 `/init` 生成了一大篇目录描述和依赖清单，不知道该留什么。

**做法**：

1. 对每一行套用 Claude 官方的删行判据："删掉这一行，agent 会犯错吗？"——不会就删。目录结构、依赖列表、语言通用约定都属于 agent 能从代码推断的内容，删。
2. 起步只保留三类，20-30 行足够：一句话项目概述、无法从代码猜出的命令、与工具默认不同的约定。Claude Code 官方给出的单文件上限是 200 行，超过会降低遵从度。

   ```markdown
   # weibo-chat-auto — Agent 指南

   Node 20 CLI，抓取微博私信并生成回复草稿；核心状态机在 src/session.mjs。

   ## 常用命令
   | 任务 | 命令 |
   | --- | --- |
   | 全部测试 | `npm test` |
   | 单文件测试 | `node --test test/session.test.mjs` |

   ## 约定
   - 所有网络请求走 src/http.mjs 的封装，不直接 fetch
   - 提交信息用中文，首行不超过 50 字符
   ```

3. 之后按"同一个错误犯第二次才补一条"的节奏增长，而不是预先写全。

**依据**：Claude Code 官方原话："For each line, ask: would removing this cause Claude to make mistakes? If not, cut it"，并明确警告臃肿的 CLAUDE.md 会让真正的指令被无视（[Claude Code 官方指南](https://code.claude.com/docs/en/best-practices)）；Cursor 官方同样把"复制整份 style guide"和"记录 agent 已知的常用命令"列为要避免的写法（[Cursor Rules](https://cursor.com/docs/rules.md)）。

**边界**：删行判据是"会不会犯错"，不是行数本身——出过事故的硬契约再长也要留；组织级 managed CLAUDE.md 的合规条款由安全团队定，不适用此判据。

**反模式**：把 `/init` 或 LLM 生成的全文直接提交——Claude Code 的 `/doctor` 检查会主动提议删掉其中能从代码推断的目录布局、依赖列表和架构综述（[memory](https://code.claude.com/docs/en/memory#my-claude-md-is-too-large)）。

## 1.2 命令写到 flag 和路径，让 agent 拿来即跑

**场景**：agent 每次自己猜测试命令，猜错了浪费一轮；或者明明只改了一个文件却跑全量测试。

**做法**：

1. 用"任务 → 命令"两列表格组织，每条命令带 flag、带路径、带占位符示例：

   ```markdown
   ## 常用命令
   | 任务 | 命令 |
   | --- | --- |
   | 全部测试 | `pnpm turbo run test --filter <package>` |
   | 单个用例 | `pnpm vitest run -t "<test name>"` |
   | Lint | `pnpm lint --max-warnings 0` |
   | 本地运行 | `pnpm dev`（端口 5173） |
   | 重建快照 | `pnpm test -u`（警告：只在确认 UI 改动符合预期后跑） |
   ```

2. 高危命令在同一行注明什么情况下不要跑（如上表最后一行）。
3. 每条命令在当前仓库真实执行一遍再入表——引用不存在的 npm script 会被 [agentsmd-lint](../tools/agentsmd-lint/) 的 `dead-script` 规则报 error（见 1.6）。

**依据**：Claude 官方以对比例证说明精确度要求——"Run `npm test` before committing" 优于 "Test your changes"（[memory](https://code.claude.com/docs/en/memory#write-effective-instructions)）；agents.md 官方示例同样精确到 `pnpm vitest run -t "<test name>"`，且 FAQ 确认 agent 会自动执行文件里列出的检查命令并修复失败（[agents.md](https://agents.md)）。

**边界**：git、npm 的基础用法不用写——Cursor 官方明确 "Agent already knows common tools like npm, git, and pytest"（[Cursor Rules](https://cursor.com/docs/rules.md)），写了只是消耗上下文。

**反模式**："改完请跑测试并确保通过"——没有命令，agent 只能猜 runner 和入口。

## 1.3 用 always / ask first / never 三层写边界

**场景**：agent 改了生成物目录、碰了密钥文件、擅自加了运行时依赖；或者反过来，每一步都停下来问你。

**做法**：

1. 把行为边界写成三个固定小节，每条 never 附一句原因：

   ```markdown
   ## 边界
   ### Always
   - 改完 JS 文件后运行 `npm test`
   - 提交前运行 `npm run lint`

   ### Ask first
   - 新增运行时依赖
   - 修改 .github/workflows/ 下的任何文件
   - force push

   ### Never
   - 修改 dist/ 与 src/generated/（构建产物，源头在 codegen 配置）
   - 读取或打印 .env* 文件内容（含凭据）
   ```

2. 对必须 100% 拦截的 never 条目，再配一层 hooks 或 permissions deny 兜底——memory 文件是 context，不是强制配置。

**依据**：Codex 官方示例文件本身就使用这三种句式——"Always run `npm test`…"、"Ask for confirmation before adding new production dependencies"、"Never rotate API keys without notifying the security channel"（[Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md#create-global-guidance)）；Claude 官方明确 memory 文件"treats them as context, not enforced configuration"，要无条件阻止某动作需用 PreToolUse hook（[memory](https://code.claude.com/docs/en/memory#claude-md-vs-auto-memory)）。

**边界**：never 列表超过十条说明约束放错了层——可机检的（路径、命令模式）挪进 hooks 与 permissions（见 [05 章](05-permissions-sandbox.md)），memory 里只留需要判断的边界。

## 1.4 像调 prompt 一样调 memory 文件

**场景**：规则明明写了，agent 就是不遵守。

**做法**：

1. 先确认文件真的加载了。Claude Code 在会话里跑 `/context`，检查 **Memory files** 列表；Codex 用一条命令让它复述：

   ```bash
   codex --ask-for-approval never "Summarize the current instructions."
   ```

2. 排查冲突：两条规则矛盾时 Claude 官方说明它"may pick one arbitrarily"——找到旧的那条，删除。
3. 对关键条目加强调词提升遵从，这是 Anthropic 官方确认有效的手法：

   ```markdown
   - IMPORTANT: src/db/migrations/ 下已合并的文件 NEVER 修改；要改 schema 就新建迁移
   ```

4. 每次修改后观察 agent 行为是否真的变了；没变就说明措辞含糊或文件太长，回到 1.1 的删行判据修剪。

**依据**：Claude Code 官方原话："Treat CLAUDE.md like code: review it when things go wrong, prune it regularly, and test changes by observing whether Claude's behavior actually shifts"，并确认 "adding emphasis (e.g., 'IMPORTANT' or 'YOU MUST')" 可提升遵从（[Claude Code 官方指南](https://code.claude.com/docs/en/best-practices)）。

**边界**：强调词会通胀——满篇 IMPORTANT 等于没有 IMPORTANT。一条规则反复强调仍不生效、且它必须在固定时点执行（每次提交前、每次编辑后），官方的建议是改写成 hook 而不是继续加粗（[memory · Troubleshoot](https://code.claude.com/docs/en/memory#claude-isnt-following-my-claude-md)）。

## 1.5 用根级 AGENTS.md 做单一事实源，CLAUDE.md 软链过去

**场景**：团队混用多个工具，仓库里同时躺着 AGENTS.md、CLAUDE.md、`.cursor/rules/`，内容开始互相漂移。

**做法**：

1. 根级 `AGENTS.md` 做主文件：这是 60k+ 开源项目采用的开放格式，Cursor 与 Copilot 原生读取（[agents.md](https://agents.md)、[Cursor Rules](https://cursor.com/docs/rules.md#agentsmd)、[Copilot 支持矩阵](https://docs.github.com/en/copilot/reference/custom-instructions-support)）。
2. Claude Code 只认 `CLAUDE.md`，软链过去：

   ```bash
   ln -s AGENTS.md CLAUDE.md
   git add AGENTS.md CLAUDE.md
   ```

   需要追加 Claude 专属内容（或在 Windows 上，建 symlink 需要管理员权限）时，改用 import：

   ```markdown
   @AGENTS.md

   ## Claude Code
   - src/billing/ 下的改动先用 plan mode
   ```

3. 新会话跑 `/context`，确认 `CLAUDE.md` 出现在 **Memory files** 下。
4. monorepo 想放嵌套文件之前，先弄清四家"就近"语义并不相同：

   | 工具 | 官方定义的加载语义 |
   |---|---|
   | Claude Code | 从 cwd 向上收集每层 `CLAUDE.md` 全部拼接，越近越靠后；cwd 之下的子目录文件按需加载（[memory](https://code.claude.com/docs/en/memory#how-claude-md-files-load)） |
   | Codex | 从项目根向下走到 cwd，每目录至多取一个文件拼接，越近越靠后；按 cwd 而不是被编辑的文件（[AGENTS.md discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md#how-codex-discovers-guidance)） |
   | Cursor | 嵌套 `AGENTS.md` 与父目录合并，更具体的优先（[Cursor Rules](https://cursor.com/docs/rules.md#agentsmd)） |
   | Copilot | VS Code 里最近的 `AGENTS.md` 优先；CLI 文档只列出读取 `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`，未定义优先级（[仓库指令](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide) · [支持矩阵](https://docs.github.com/en/copilot/reference/custom-instructions-support)） |

**依据**：`ln -s AGENTS.md CLAUDE.md` 与 `@AGENTS.md` import 都是 Claude 官方文档给出的方案，包括 Windows 例外（[memory · AGENTS.md](https://code.claude.com/docs/en/memory#agents-md)）。

**边界**：Codex 的就近按启动目录算——编辑 `services/x.ts` 不会加载 `services/AGENTS.md`，除非从那个目录启动；依赖嵌套文件做关键约束之前，先在目标工具里验证它真的加载了（1.4 的第 1 步）。

**反模式**：每个工具各写一份内容相似的文件——三个月后它们描述的是三个不同的项目。

## 1.6 用 lint 把约定变成门禁

**场景**：memory 文件随时间腐烂：模板占位符没填就提交、表里的命令随重构失效、写了标题没填内容。

**做法**：

1. 把本手册的 [`tools/agentsmd-lint`](../tools/agentsmd-lint/)（零依赖单文件，Node ≥ 20）复制进你的仓库，本地检查：

   ```bash
   node tools/agentsmd-lint/index.mjs AGENTS.md
   node tools/agentsmd-lint/index.mjs --max-lines 150 AGENTS.md CLAUDE.md
   ```

   五条规则：`max-lines`（超长降低遵从）、`placeholder`（未填的模板占位符）、`vague`（agent 无法执行的模糊措辞）、`dead-script`（引用了 package.json 里不存在的 npm 脚本）、`empty-section`（空标题节）。
2. 发现 error 时退出码为 1，直接接进 CI：

   ```yaml
   # .github/workflows/agentsmd.yml
   name: agentsmd-lint
   on:
     pull_request:
       paths: ["AGENTS.md", "CLAUDE.md"]
   jobs:
     lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 20 }
         - run: node tools/agentsmd-lint/index.mjs AGENTS.md
   ```

3. 修复顺序：先 `dead-script`（命令必须真实可跑，对应 1.2），再 `vague`（把模糊措辞换成具体条件与数字，对应 1.4）。

**依据**：Claude 官方要求定期 review memory 文件、移除过期与冲突指令（[memory · Consistency](https://code.claude.com/docs/en/memory#write-effective-instructions)）；agents.md 官方 FAQ 把该文件定位为 "living documentation"（[agents.md](https://agents.md)），活文档需要门禁防腐。

**边界**：linter 只查得出形式问题（占位符、死命令、空节），查不出"这条规则本身还对不对"——内容层面的修剪仍靠 1.4 的行为观察。

**反模式**：warning 长期挂着不修——门禁只对 error 生效时，warning 堆积等于没有门禁。
