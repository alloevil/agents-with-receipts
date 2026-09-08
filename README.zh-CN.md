[English](README.md) | 简体中文

# agents-with-receipts

**agents-with-receipts** 是一套有据可查的 agentic coding 实践手册，外加三个零依赖 CLI 工具，用来检查仓库的 AGENTS.md 与 agent 基建——写给不想再看无出处结论的工程师。

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Agents with Receipts · 有据可查：agentic coding 实践手册。右侧是一张列着四个板块的收据小票，盖着'有据可查'红章：TOTAL 4 BOARDS · 0 SLOGANS。">
</p>

<p align="center">
  <a href="https://github.com/alloevil/agents-with-receipts/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/alloevil/agents-with-receipts/ci.yml?logo=githubactions&logoColor=white&label=CI"></a>
  <a href="https://github.com/alloevil/agents-with-receipts/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/alloevil/agents-with-receipts?logo=github&color=blue"></a>
</p>

<p align="center"><strong><a href="https://alloevil.github.io/agents-with-receipts/">→ 在线阅读（GitHub Pages）</a></strong> · 左侧票根导航 · 内容与仓库 Markdown 实时同源</p>

**每条断言都必须回答一个问题：*出处在哪？*** 答案是可以点开的官方文档，而不是口号。

Claude Code、Codex、Cursor 的最佳实践收藏已经很多，但几乎全是无出处的断言（"保持 CLAUDE.md 简短"、"先规划再编码"）。这里的做法：对照表**逐格核实官方文档、每格就是链接**；实践地图每条带出处与验证日期；再配一个真的能跑的 AGENTS.md 检查器。

## 这是什么

一条规则下的三样东西。[`rosetta/`](rosetta/) 把 Claude Code、OpenAI Codex、Cursor、GitHub Copilot 放在十个概念上对照——项目级/用户级 memory、条件规则、skills、hooks、子代理、OS 沙箱、审批模式、MCP 配置、headless/CI——40 个单元格全部是官方文档链接，2026-08 逐格核实。[`practices/`](practices/) 是九个章节，每条实践按「场景 → 做法 → 依据 → 边界」展开。[`tools/`](tools/) 把这些变成可执行检查：`agentsmd-lint` 查单个 memory 文件，`agents-doctor` 查整仓 agent 基建，`agents-init` 生成只填真实探测到的命令的 AGENTS.md。[`templates/`](templates/) 是保证过 lint 的骨架。本仓库在 CI 里 dogfood 全套。

## 安装

Node ≥ 20，没有依赖需要装——三个 CLI 都是只用标准库的单文件 Node ESM 脚本。

```bash
git clone https://github.com/alloevil/agents-with-receipts.git
cd agents-with-receipts
node tools/agentsmd-lint/index.mjs AGENTS.md
```

三个工具也在 package.json 的 `bin` 里声明了，`npm link` 之后可以直接用 `agentsmd-lint` / `agents-doctor` / `agents-init` 命令名。

## 我该从哪看起？

| 你想做的事 | 从这里进 |
|---|---|
| **第一次给仓库配 agent 基建** | 跟做 [`00 walkthrough`](practices/00-agent-ready-walkthrough.md)：AGENTS.md → 条件规则 → hook → lint 进 CI，每步可验证 |
| **给仓库写一份 AGENTS.md / CLAUDE.md** | [`templates/`](templates/) 骨架起步，对照 [`01 Memory 文件`](practices/01-memory-files.md)的取舍原则 |
| **不知道该用 memory 还是 rule 还是 hook** | [`02 机制选型`](practices/02-mechanism-selection.md)：两个维度定位五种机制 |
| **检查已有的 AGENTS.md 写得好不好** | 跑 [`agentsmd-lint`](tools/agentsmd-lint/)（查文件）和 [`agents-doctor`](tools/agents-doctor/)（查整仓基建） |
| **在换工具，或 Claude Code / Codex / Cursor 混着用** | [`rosetta/`](rosetta/) 对照表：同一概念各家叫什么、放哪、就近规则差在哪 |
| **系统过一遍 agentic coding 的实践全景** | [`practices/`](practices/) 九个章节，每条实践「场景→做法→依据→边界」带官方出处 |
| **发现内容过期或有错** | [CONTRIBUTING.md](CONTRIBUTING.md)——带官方链接来提 PR，过期条目删除而非堆积 |

只有十分钟的话：读 [`rosetta/`](rosetta/) 的「收敛格局」和「就近规则差异」两节，然后对自己的仓库跑一次 linter。

<p align="center">
  <img src="./assets/readme/section-rosetta.svg" width="100%" alt="第一板块 rosetta：跨工具对照，同一概念在 Claude Code、Codex、Cursor、Copilot 里叫什么、放哪。">
</p>

概念在四个工具里的叫法和位置各不相同：memory 文件、条件规则、skills、hooks、沙箱、审批、MCP、headless。[`rosetta/`](rosetta/) 是一张**逐格对照官方文档核实**的对照表——每个单元格本身就是官方文档链接，点开即可验证（2026-08 核实，也记录了四家正在收敛的四个层面与 monorepo 里四种不同的"就近"语义）。

一个立刻能用的结论：**根级 `AGENTS.md` 做单一事实源**（[agents.md](https://agents.md) 开放标准，60k+ 项目在用；Cursor 与 Copilot 已原生读取），`CLAUDE.md` 软链过去：

```bash
ln -s AGENTS.md CLAUDE.md
```

<p align="center">
  <img src="./assets/readme/section-practices.svg" width="100%" alt="第二板块 practices：实践地图，八大类实践加模板，每条断言带官方出处与验证日期。">
</p>

[`practices/`](practices/) 是九个章节的实践手册：[00 可跟做的 walkthrough](practices/00-agent-ready-walkthrough.md)（从零配齐 agent 基建）+ 01-08 章（Memory 文件 / 机制选型 / 任务框架 / 验证闭环 / 权限沙箱 / 上下文管理 / 并行编排 / 安全治理）。每条实践按「**场景 → 做法（可复制示例）→ 依据（官方链接）→ 边界**」展开——不是要点索引，是能照着做完的工作流。

配套 [`templates/`](templates/)：从真实项目提炼的 `AGENTS.md` / `RULES.md` 骨架，注释里写明用法，和下面的 linter 配合使用。

<p align="center">
  <img src="./assets/readme/section-lint.svg" width="100%" alt="第三板块 tools 工具箱：lint 查文件、doctor 查仓库、init 生成起点，零依赖。">
</p>

把实践变成可执行检查的三件套。零依赖，Node ≥ 20：

| 工具 | 一条命令 | 干什么 |
|---|---|---|
| [`agentsmd-lint`](tools/agentsmd-lint/) | `node tools/agentsmd-lint/index.mjs AGENTS.md` | 查**单个文件**质量：行数超标 / 占位符 / 模糊措辞 / 引用不存在的 npm 脚本 / 空标题节 |
| [`agents-doctor`](tools/agents-doctor/) | `node tools/agents-doctor/index.mjs .` | 查**整个仓库**的 agent 基建：AGENTS.md 质量、CLAUDE.md 软链/漂移、四工具的规则/hooks/skills、secrets 是否 gitignore、CI 门禁 |
| [`agents-init`](tools/agents-init/) | `node tools/agents-init/index.mjs . --link` | 探测 package.json / Cargo.toml / pyproject / go.mod，生成**预填真实命令**的 AGENTS.md 起点 + CLAUDE.md 软链，产物自动过 lint |

三个工具发现 error 都以退出码 1 收场，可直接进 CI。本仓库 dogfood 全套：CI 里跑 lint 门禁 + doctor 体检，根目录的 `AGENTS.md` 就是 `agents-init` 生成后手工补充的。

```bash
# 对你的仓库跑一遍体检
git clone https://github.com/alloevil/agents-with-receipts.git
node agents-with-receipts/tools/agents-doctor/index.mjs 你的仓库/
```

## 核心立场

1. **证据优先。** 没有出处的断言不收；对照表的每一格都是官方文档链接。
2. **半衰期意识。** 这个领域几个月一变；每条标注适用工具与日期，过期即删。
3. **宁缺毋滥。** 手册的价值密度由最差的一条决定。
4. **可执行 > 可读。** 能写成 lint 规则、模板、脚手架的实践，不要只写成散文。

## 什么时候用

- 第一次给仓库配 agent 基建——第 00 章从 AGENTS.md → 条件规则 → hook → lint 进 CI，每步都能验证。
- 在换工具或多工具混用（Claude Code / Codex / Cursor / Copilot）：`rosetta/` 告诉你同一概念各家叫什么、文件放哪、monorepo 里「就近优先」的语义差在哪。
- 已经有 AGENTS.md，想知道写得好不好——linter 会抓出模板残留的占位符、引用了不存在的 npm 脚本、agent 无法执行的模糊措辞、空标题节、行数超标。
- 团队上手前先做一次仓库体检：`agents-doctor` 报告 memory 文件质量、CLAUDE.md 漂移、四家的 rules/hooks/skills 配了哪些、敏感文件是否 gitignore、CI 有没有门禁。
- 在写团队规范，需要每条规则都带一个同事能点开核实的出处。

## 什么时候别用

- **想要效率或性能数字。** 这里没有，而且是刻意的。[`claims.json`](https://alloevil.github.io/agents-with-receipts/claims.json) 只数本仓库自己的产物（40 个带出处单元格、9 个章节、3 个工具、5 条 lint 规则、7 项 doctor 检查、0 依赖）。没有任何「照做就更快/更准」的断言——因为没测过。
- **需要保证时效的厂商事实。** 对照表标的是 **2026-08**。这个领域几个月一变——每格都是链接正是为了这个：下判断前把你真正依赖的那一格点开重核一遍。
- **想让工具直接改你的文件。** 除 `agents-init`（写新的 AGENTS.md，已存在时不加 `--force` 拒绝覆盖）外，其余都只读只报。
- **Node < 20**，或者想要一个已发布的 npm 包——工具以源码形式随仓库分发。
- **想看模型选型或 prompt 工程的观点。** 范围是仓库侧配置：memory 文件、规则、skills、hooks、沙箱、审批、MCP、headless。

## 常见问题

**三个工具的区别是什么？**
作用范围不同。`agentsmd-lint` 查**单个 memory 文件的内容**：行数、未填的占位符、模糊措辞、引用了同目录 package.json 里不存在的脚本、空标题节。`agents-doctor` 查整个仓库里**围绕这些文件的基建**：AGENTS.md 质量、CLAUDE.md 是软链还是已漂移的副本、四家的 rules/hooks/skills 目录各配了几个、敏感文件是否被 gitignore 覆盖、CI 里有没有 lint 门禁。`agents-init` 面向还没有 AGENTS.md 的仓库，从探测到的构建工具生成一份，然后对自己的产物跑一遍 lint。

**为什么 `agents-init` 只写探测到的命令？**
因为 memory 文件里编造的命令比没有 memory 文件更糟——agent 照着跑、跑失败，而这个文件刚刚教给它一件假事。它读 package.json scripts、Cargo.toml、pyproject.toml、go.mod，只收真实存在的条目（`packageManager` 含 pnpm/yarn 时换前缀），pyproject 里没有 pytest 痕迹就只留注释而不编命令；写完自动跑 agentsmd-lint，有 error 级命中就退出码 1。

**`CLAUDE.md` 应该软链到 `AGENTS.md` 吗？**
这是本仓库的建议，实现就一行 `ln -s AGENTS.md CLAUDE.md`：`AGENTS.md` 是 Cursor 与 Copilot 已原生读取的开放标准，软链过去意味着只维护一份而不是每家一份。`agents-doctor` 按三档评价——软链 ok，内容相同的独立副本 info（能用，但会漂移），已漂移或缺失 warn。代价是：软链意味着所有工具看到完全相同的指令，如果你确实需要某家专属的指引，这样就不合适。

**对照表有多新？厂商改了怎么办？**
2026-08 逐格核实，日期写在表上而不是暗示。每个单元格的文字本身就是官方链接，所以任何一格都能一键重核，不必整表照信。修正以 PR 形式接收，要求附官方链接；过期条目直接删除，而不是加注保留。

**许可是什么，能用在公司内部文档里吗？**
代码 MIT；文档内容同时以 CC BY 4.0 提供，所以章节和表格行可以署名后拷进内部文档。引用时请引承载该断言的那一页（例如 `practices/05-permissions-sandbox.md`），并保留背后的官方链接——这样你的读者也拿到了那张收据。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。一句话版本：**新条目必须带官方出处**，修正过期信息的 PR 请附官方链接。

## License

[MIT](LICENSE)。文档内容同时以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。
