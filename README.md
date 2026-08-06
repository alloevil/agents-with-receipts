# Agents with Receipts · 有据可查

**事故驱动的 agentic coding 实践手册。** 每条实践都必须回答一个问题：*没这么做的时候，具体发生了什么？*

Claude Code、Codex、Cursor、Copilot 的最佳实践收藏已经很多了——但几乎全是断言式口号（"保持 CLAUDE.md 简短"、"先规划再编码"）。本手册只收带证据链的条目：真实事故、可点开的 commit、修复前后的对比、以及事故最终**沉淀成了哪条规则或哪个测试**。

## 三个板块

| 板块 | 内容 | 为什么存在 |
|---|---|---|
| [`incidents/`](incidents/) | 事故案例：症状 → 根因 → 修复 → 沉淀 → 通用教训 | 口号不可验证，事故可以。每条都附真实仓库的 commit 链接 |
| [`rosetta/`](rosetta/) | 跨工具对照表：同一概念在 Claude Code / Codex / Cursor / Copilot 里叫什么、放哪 | 生态碎片化严重，换工具时最缺一张 Rosetta Stone |
| [`tools/`](tools/) | 可执行工具，第一个是 [`agentsmd-lint`](tools/agentsmd-lint/)：AGENTS.md 质量检查器 | "treat AGENTS.md like code" 说了两年，没有工具支撑就是空话 |

另有 [`practices/`](practices/)（八大类别实践地图，附官方来源）和 [`templates/`](templates/)（从真实项目提炼的 AGENTS.md / RULES.md 模板）。

## 核心立场

1. **证据优先。** 没有事故或数据支撑的实践进不了 incidents/；只能进 practices/ 并标注来源。
2. **半衰期意识。** 这个领域的内容几个月就过期。每条都标注适用工具与验证日期；过期条目删除而非堆积。
3. **宁缺毋滥。** 本手册的价值密度由最差的一条决定。
4. **可执行 > 可读。** 能写成 lint 规则、模板、脚手架的实践，就不要只写成散文。

## 快速开始

```bash
# 检查你的 AGENTS.md 质量（零依赖，Node ≥ 20）
node tools/agentsmd-lint/index.mjs path/to/AGENTS.md
```

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。一句话版本：**新条目必须带证据**（公开 commit / issue / 可复现步骤），必须标注适用工具和日期。

## License

[MIT](LICENSE)。文档内容同时以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供。
