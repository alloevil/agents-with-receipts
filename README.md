<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Agents with Receipts · 有据可查：事故驱动的 agentic coding 实践手册。右侧是一张列着五条真实事故的收据小票，盖着'有据可查'红章：TOTAL 5 INCIDENTS · 0 SLOGANS。">
</p>

**每条实践都必须回答一个问题：*没这么做的时候，具体发生了什么？*** 答案是可以点开的 commit，而不是口号。

Claude Code、Codex、Cursor 的最佳实践收藏已经很多，但几乎全是断言（"保持 CLAUDE.md 简短"、"先规划再编码"）。这里只收带证据链的条目：真实事故、可验证的修复、以及事故最终**沉淀成了哪条规则或哪个测试**。

## 我该从哪看起？

| 你想做的事 | 从这里进 |
|---|---|
| **给仓库写一份 AGENTS.md / CLAUDE.md** | [`templates/`](templates/) 骨架起步，对照 [`practices/`](practices/) 第 1 节的取舍原则 |
| **不知道该往 AGENTS.md 里写什么** | 看 [`incidents/`](incidents/) 每条的「沉淀」一节——条目不是凭空写的，是从踩坑里提炼的 |
| **检查已有的 AGENTS.md 写得好不好** | 跑 [`tools/agentsmd-lint`](tools/agentsmd-lint/)，五条规则给出行号级反馈 |
| **在换工具，或 Claude Code / Codex / Cursor 混着用** | [`rosetta/`](rosetta/) 对照表：同一概念各家叫什么、放哪、坑在哪 |
| **系统过一遍 agentic coding 的实践全景** | [`practices/`](practices/) 八大类地图，每条断言带官方出处 |
| **踩过有意思的坑，想让别人少踩** | [CONTRIBUTING.md](CONTRIBUTING.md)——带上证据链来投稿 |

只有十分钟的话：读 [001](incidents/001-dom-guessing-auth.md) 和 [005](incidents/005-stale-build-artifact.md) 两条事故，然后对自己的仓库跑一次 linter。

<p align="center">
  <img src="./assets/readme/section-incidents.svg" width="100%" alt="第一板块 incidents：事故案例，症状、根因、修复、沉淀，每条都有可点开的 commit。">
</p>

| # | 事故 | 通用教训 |
|---|---|---|
| [001](incidents/001-dom-guessing-auth.md) | 猜 DOM 判断登录态，带失效凭据静默空跑 3 天 | 外部服务的状态判断只认协议级信号，UI 表象不是契约 |
| [002](incidents/002-rolling-session-expiry.md) | 凭据名义有效期一年，实际会话 24 小时一死 | 别信凭据字段上的过期时间，信实测行为 |
| [003](incidents/003-output-parsing-contract.md) | 跨进程 grep 输出当契约，上游改一行日志下游静默断裂 | 字符串契约要么提炼成模块+测试，要么早晚断 |
| [004](incidents/004-sed-version-bump.md) | sed 全局替换版本号，误伤 lockfile 里的同版本无关依赖 | 批量文本替换后必须 diff 对账，锚点越宽越危险 |
| [005](incidents/005-stale-build-artifact.md) | 构建脚本"缺失才编译"，桌面应用长期运行旧代码 | 缓存型构建的失效条件必须写进 agent 的条件规则 |

每条的固定结构：**症状 → 根因 → 修复 → 沉淀 → 通用教训**。「沉淀」是这里和普通 post-mortem 的区别——事故的价值在于它变成机器可执行的防线（AGENTS.md 条目、粘性规则、回归测试、lint 规则），而不是变成一篇没人再读的文章。

<p align="center">
  <img src="./assets/readme/section-rosetta.svg" width="100%" alt="第二板块 rosetta：跨工具对照，同一概念在 Claude Code、Codex、Cursor、Copilot 里叫什么、放哪。">
</p>

生态碎片化严重：memory 文件、条件规则、skills、hooks、沙箱、审批、MCP、headless——每家叫法和位置都不同。[`rosetta/`](rosetta/) 是一张标注了验证日期和置信度的对照表，换工具或多工具并用时先看它。

一个立刻能用的结论：**根级 `AGENTS.md` 做单一事实源**（[agents.md](https://agents.md) 开放标准，60k+ 项目在用），`CLAUDE.md` 软链过去：

```bash
ln -s AGENTS.md CLAUDE.md
```

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

## 另外两个板块

- [`practices/`](practices/) — 八大类实践地图（memory 文件 / 提示框架 / 验证闭环 / 权限沙箱 / 机制选型 / 上下文管理 / 并行编排 / 安全治理），每条断言都有官方出处和验证日期
- [`templates/`](templates/) — 从真实项目提炼的 `AGENTS.md` / `RULES.md` 模板，配合 linter 使用

## 核心立场

1. **证据优先。** 没有事故或数据支撑的实践进不了 incidents/。
2. **半衰期意识。** 这个领域几个月一变；每条标注适用工具与日期，过期即删。
3. **宁缺毋滥。** 手册的价值密度由最差的一条决定。
4. **可执行 > 可读。** 能写成 lint 规则、模板、脚手架的实践，不要只写成散文。

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。一句话版本：**新条目必须带证据**（公开 commit / issue / 可复现步骤），必须标注适用工具和日期。

## License

[MIT](LICENSE)。文档内容同时以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。
