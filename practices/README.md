# 实践地图

十四个章节 + 一篇可跟做的 walkthrough，分两条轴：01–08 与 12 讲 agent **读得懂**这个仓库（12 是接手陌生代码库时的心智模型：问运行时、问历史动机、要取舍），09–11 讲 agent **验得动**自己的工作成果。**只放有出处的断言**：每条实践按「场景 → 做法（可复制示例）→ 依据（官方链接）→ 边界」展开，验证于 2026-09（首轮 2026-08），过期即删。

## 阅读顺序

新上手：先跟做 [00 walkthrough](00-agent-ready-walkthrough.md)，再读 [01 Memory 文件](01-memory-files.md) 和 [02 机制选型](02-mechanism-selection.md)——这三篇解决"配置放哪、写什么"。想让 agent 自己验证、敢自动合 PR：从 [09 可验证的仓库](09-verifiable-repo.md) 的阶段门读起，再看 [10 硬约束下沉](10-hard-constraints.md)；UI 类工作补 [11 验证技能](11-verification-skills.md)；接手不熟的代码补 [12 理解陌生代码库](12-codebase-mental-model.md)。其余章节按需查。

## 结构地图：轴 · 章 · 对应检查

编号是**追加顺序**，不是阅读顺序——分组看轴，上一章 / 下一章按轴内顺序接（每章末尾都有这一行）。这张表是三个板块之间唯一需要的对齐：左边是要解决的问题，右边是能机械判定它对不对的检查项（`--json` 输出里的稳定 `id`）。写「无」的四章正是 [10 硬约束下沉](10-hard-constraints.md) 说的「停在提示层」，不是遗漏。

| 轴 | 章 | 这章回答什么 | 对应检查（`--json` 的 `id`） |
|---|---|---|---|
| 读得懂 | [00 从零配齐（可跟做）](00-agent-ready-walkthrough.md) | 一个仓库从没有任何基建，到 lint 进 CI 的完整动线 | `agentsmd-lint` 的 5 条规则 · `agents-doctor` 的 `ci-gate` · `agents-init` 生成起点 |
| 读得懂 | [01 Memory 文件](01-memory-files.md) | AGENTS.md / CLAUDE.md 写什么、删什么、怎么维护，以及怎么审计 Claude 的 auto memory | `agentsmd-lint` 的 `max-lines` · `placeholder` · `vague` · `dead-script` · `empty-section` · `agents-doctor` 的 `agents-md` · `claude-md` |
| 读得懂 | [02 机制选型](02-mechanism-selection.md) | 同一件事该写成 memory、rule、skill、hook 还是 subagent | `agents-doctor` 的 `rules` · `hooks` · `skills` |
| 读得懂 | [03 任务框架与规划](03-task-framing.md) | 怎么把任务写成 agent 能执行、能自查的样子 | 无 —— 任务写法没有机械检查项 |
| 读得懂 | [04 验证闭环](04-verification.md) | agent-TDD、独立评审、diff 对账 | `verify-doctor` 的 `evidence-template` |
| 读得懂 | [05 权限与沙箱](05-permissions-sandbox.md) | 放权到哪一档、网络与 secrets 怎么圈 | 无 —— 档位由工具自身强制，不在仓库里 |
| 读得懂 | [06 上下文管理](06-context-management.md) | /clear 纪律、探索隔离、计划落盘、预算意识 | 无 —— 上下文纪律没有仓库内证据 |
| 读得懂 | [07 并行与编排](07-parallel-orchestration.md) | 什么能并行、文件所有权、git worktree | 无 —— 编排纪律没有仓库内证据 |
| 读得懂 | [08 安全与治理](08-security-governance.md) | 不可信输入、secrets 不进上下文、配置入库 | `agents-doctor` 的 `secrets` |
| 读得懂 | [12 理解陌生代码库](12-codebase-mental-model.md) | 问运行时、查历史动机、要取舍、取回上下文 | `agents-doctor` 的 `skills` · `adr` |
| 验得动 | [09 可验证的仓库](09-verifiable-repo.md) | 一条命令跑完全部、确定性、失败证据、flaky 清零 | `verify-doctor` 的 `verify-command` · `determinism` · `failure-artifacts` · `flaky-quarantine` |
| 验得动 | [10 硬约束下沉](10-hard-constraints.md) | 规矩从提示搬到结构 / 类型 / 机械门禁 | `verify-doctor` 的 `module-boundary` · `type-strict` · `lint-hardness` · `escape-ratchet` |
| 验得动 | [11 验证技能](11-verification-skills.md) | UI 失败证据、驱动真实应用、视觉证据进 PR | `verify-doctor` 的 `ui-evidence` |
| 验得动 | [13 可核对的宣称](13-checkable-claims.md) | 每个对外数字配一条能重算它的命令；六种失效模式与「算不了」时怎么写 | `verify-claims` 的 `claims.json` |

## 主要来源

[agents.md 规范](https://agents.md) · [Anthropic Claude Code 官方文档](https://code.claude.com/docs/en/best-practices) · [Anthropic steering 指南](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more) · [Agent Skills 规范](https://agentskills.io/specification) · [OpenAI Codex 官方文档](https://developers.openai.com/codex) · [Cursor 官方文档](https://cursor.com/docs) · [GitHub Copilot 官方文档](https://docs.github.com/en/copilot) · [Git 官方文档](https://git-scm.com/docs)——具体到每条实践的「依据」行。
