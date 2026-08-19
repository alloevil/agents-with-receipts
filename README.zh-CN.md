[English](README.md) | 简体中文

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

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。一句话版本：**新条目必须带官方出处**，修正过期信息的 PR 请附官方链接。

## License

[MIT](LICENSE)。文档内容同时以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。
