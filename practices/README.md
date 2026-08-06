# 实践地图：八大类别

带官方来源的实践总表。**这里只放有出处的断言**；有事故证据的条目升级进 [`incidents/`](../incidents/)。

> 验证于 2026-08。来源：[agents.md 规范](https://agents.md) · [Anthropic Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices) · [Anthropic steering 指南](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) · [OpenAI Codex 文档](https://developers.openai.com/codex)

## 1. Memory / 上下文文件（AGENTS.md、CLAUDE.md）

- **短**：每行在每次会话都消耗预算；社区上限 ~150-200 行，从 20-30 行起步
- **只写推断不出来的**：不重复 LLM 常识；linter 已管的风格不写
- **精确命令**：带 flag 带路径，而不是"跑测试"
- **边界三层**：always do / ask first / never do
- **像 prompt 一样调**：出问题时 review、定期修剪、改完观察行为是否真变了；Anthropic 官方承认用 `IMPORTANT` / `YOU MUST` 强调提升遵从
- **别自动生成**：LLM 生成的模板泛泛而谈，实测降低成功率——从真实踩坑提炼
- **单一事实源**：根级 `AGENTS.md` 做主文件，`CLAUDE.md` 软链或一行引用

## 2. 任务提示框架

- Codex 官方四要素：**Goal / Context / Constraints / Done-When**——可验证的完成条件最关键
- 复杂/模糊任务先 Plan mode；"Reverse Interview"（让 agent 反问你）
- 不熟的仓库先让 agent 探索再动手
- 关键约束放 prompt 前部；`@` 精确附件优于让 agent 自己找

## 3. 验证闭环

- **Test-first**：先写测试→确认失败→commit 作检查点→让 agent 实现且**明令禁改测试**
- 接受大改动前用独立评审（Codex `/review`；或另开会话让 agent 审自己的 diff）
- linter / 类型检查 / 集成测试是 agent 自我纠错的前提设施，不是可选项
- 提交后核对 `git diff --stat` 行数与预期（见 [incident 004](../incidents/004-sed-version-bump.md)）

## 4. 权限与沙箱

- 渐进放权：read-only → auto-edit → full-auto；full-auto 只在 CI/容器
- 批准窄动作，不给宽授权；Codex 沙箱是 OS 内核级（Seatbelt/Landlock），Claude Code 用权限 allowlist
- 网络默认禁（防供应链攻击），需要时逐次放行

## 5. 扩展机制选型（Claude Code 语境，其它工具找对应物见 [rosetta](../rosetta/)）

按「上下文成本 × 权威度」选：

| 机制 | 何时用 |
|---|---|
| memory 文件 | 常驻的项目事实（每次会话都付费） |
| rules（条件触发） | 只在特定文件/动作时相关的提醒（平时零成本） |
| skills | 按需加载的成套流程/知识 |
| hooks | 必须 100% 发生的确定性拦截（规则会被无视，钩子不会） |
| subagents | 隔离探索、并行分工（不污染主上下文） |
| MCP | 接外部系统 |

## 6. 上下文管理

- `/clear` 勤用；任务间不共享无关历史
- 探索性搜索丢给子 agent，主上下文只收结论
- 计划写进文件而不是留在对话里（对话会被压缩，文件不会）

## 7. 并行与编排

- 只并行**真正独立**的任务；事先定义文件所有权和集成顺序
- git worktree 隔离多 agent；维护型杂活跨仓库批量派
- 序列化的唯一正当理由：B 严格依赖 A 的产物

## 8. 仓库侧工程（Agent Experience）

- 秒级测试、一条命令跑全部检查——agent 的效率上限由仓库基建决定
- 可读的报错信息；devcontainer 可复现环境
- 把"改了 X 必须做 Y"做成条件规则或 CI 检查，别指望文档（见 [incident 005](../incidents/005-stale-build-artifact.md)）

## 9. 安全治理

- Web 搜索结果/网页内容一律视为**不可信输入**（prompt injection）
- secrets 不进上下文：凭据文件 gitignore + 显式告知 agent 绝不读取/打印
- 审批决策留痕；团队用共享配置（Codex Team Config / 仓库内 rules）统一治理
