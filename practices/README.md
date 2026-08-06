# 实践地图

八个章节 + 一篇可跟做的 walkthrough。**只放有出处的断言**：每条实践按「场景 → 做法（可复制示例）→ 依据（官方链接）→ 边界」展开，验证于 2026-08，过期即删。

## 阅读顺序

新上手：先跟做 [00 walkthrough](00-agent-ready-walkthrough.md)，再读 [01 Memory 文件](01-memory-files.md) 和 [02 机制选型](02-mechanism-selection.md)——这三篇解决"配置放哪、写什么"。其余章节按需查。

## 章节

| # | 章节 | 一句话 |
|---|---|---|
| [00](00-agent-ready-walkthrough.md) | 从零配齐 agent 基建 | 可跟做：AGENTS.md → 条件规则 → hook → lint 进 CI，每步可验证 |
| [01](01-memory-files.md) | Memory 文件 | AGENTS.md / CLAUDE.md 的写法、取舍与维护 |
| [02](02-mechanism-selection.md) | 机制选型 | memory / rules / skills / hooks / subagents 什么时候用哪个 |
| [03](03-task-framing.md) | 任务框架与规划 | Goal / Context / Constraints / Done-When，先探索后编辑 |
| [04](04-verification.md) | 验证闭环 | agent-TDD、独立评审、diff 对账 |
| [05](05-permissions-sandbox.md) | 权限与沙箱 | 渐进放权、四工具档位、CI 全自动的安全前提 |
| [06](06-context-management.md) | 上下文管理 | /clear 纪律、探索隔离、计划落盘、预算意识 |
| [07](07-parallel-orchestration.md) | 并行与编排 | 独立性判定、文件所有权、git worktree |
| [08](08-security-governance.md) | 安全与团队治理 | 不可信输入、secrets 拦截、配置入库 |

## 主要来源

[agents.md 规范](https://agents.md) · [Anthropic Claude Code 官方文档](https://code.claude.com/docs/en/best-practices) · [Anthropic steering 指南](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) · [OpenAI Codex 官方文档](https://developers.openai.com/codex) · [Cursor 官方文档](https://cursor.com/docs) · [GitHub Copilot 官方文档](https://docs.github.com/en/copilot)——具体到每条实践的「依据」行。
