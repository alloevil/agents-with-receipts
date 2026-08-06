<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Agents with Receipts · 有据可查：agentic coding 实践手册。右侧是一张列着四个板块的收据小票，盖着'有据可查'红章：TOTAL 4 BOARDS · 0 SLOGANS。">
</p>

<p align="center"><strong><a href="https://alloevil.github.io/agents-with-receipts/">→ 在线阅读（GitHub Pages）</a></strong> · 左侧票根导航 · 内容与仓库 Markdown 实时同源</p>

**每条断言都必须回答一个问题：*出处在哪？*** 答案是可以点开的官方文档，而不是口号。

Claude Code、Codex、Cursor 的最佳实践收藏已经很多，但几乎全是无出处的断言（"保持 CLAUDE.md 简短"、"先规划再编码"）。这里的做法：对照表**逐格核实官方文档、每格就是链接**；实践地图每条带出处与验证日期；再配一个真的能跑的 AGENTS.md 检查器。

## 我该从哪看起？

| 你想做的事 | 从这里进 |
|---|---|
| **给仓库写一份 AGENTS.md / CLAUDE.md** | [`templates/`](templates/) 骨架起步，对照 [`practices/`](practices/) 第 1 节的取舍原则 |
| **检查已有的 AGENTS.md 写得好不好** | 跑 [`tools/agentsmd-lint`](tools/agentsmd-lint/)，五条规则给出行号级反馈 |
| **在换工具，或 Claude Code / Codex / Cursor 混着用** | [`rosetta/`](rosetta/) 对照表：同一概念各家叫什么、放哪、就近规则差在哪 |
| **系统过一遍 agentic coding 的实践全景** | [`practices/`](practices/) 八大类地图，每条断言带官方出处 |
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

[`practices/`](practices/) 是八大类实践地图：memory 文件 / 提示框架 / 验证闭环 / 权限沙箱 / 机制选型 / 上下文管理 / 并行编排 / 安全治理——**只放有出处的断言**，每条标注来源与验证日期，过期即删。

配套 [`templates/`](templates/)：从真实项目提炼的 `AGENTS.md` / `RULES.md` 骨架，注释里写明用法，和下面的 linter 配合使用。

<p align="center">
  <img src="./assets/readme/section-lint.svg" width="100%" alt="第三板块 tools/agentsmd-lint：AGENTS.md 质量检查器，零依赖。">
</p>

「treat your memory file like code」说了两年，一直没有工具支撑——这是那个工具。零依赖，Node ≥ 20：

```bash
node tools/agentsmd-lint/index.mjs path/to/AGENTS.md
```

| 规则 | 级别 | 抓什么 |
|---|---|---|
| `max-lines` | warn | 非空行超 200——每行在每次会话都消耗上下文预算 |
| `placeholder` | error | `TODO` / `<项目名>` 之类的模板占位符没填完就上岗 |
| `vague` | warn | "`酌情` / `properly` / `as needed`"——agent 无法执行的措辞 |
| `dead-script` | error | 引用了 package.json 里不存在的 npm 脚本 |
| `empty-section` | warn | 空标题节：写了骨架没填肉 |

发现 error 退出码 1，可直接进 CI（本仓库的 CI 就在用它自检）。

## 核心立场

1. **证据优先。** 没有出处的断言不收；对照表的每一格都是官方文档链接。
2. **半衰期意识。** 这个领域几个月一变；每条标注适用工具与日期，过期即删。
3. **宁缺毋滥。** 手册的价值密度由最差的一条决定。
4. **可执行 > 可读。** 能写成 lint 规则、模板、脚手架的实践，不要只写成散文。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。一句话版本：**新条目必须带官方出处**，修正过期信息的 PR 请附官方链接。

## License

[MIT](LICENSE)。文档内容同时以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。
