# 00 — 从零配齐 agent 基建（可跟做）

> 适用工具：Claude Code · Codex CLI · Cursor · GitHub Copilot · 验证于 2026-09

本章是一条端到端路径：给一个已有代码的仓库，配齐 memory 文件、条件规则、hook 拦截和 CI 检查。每一步以真实工具行为收尾——验证不通过就停在原地修，不要带病进下一步。示例设定为 Node 20 + npm 的订单服务仓库，其它技术栈只需替换命令表内容。

> 快速路径：Step 1-2 可以用 [`agents-init`](../tools/agents-init/) 一条命令完成（`node tools/agents-init/index.mjs 你的仓库 --link`，生成预填真实命令的 AGENTS.md + CLAUDE.md 软链）；Step 6 的验收清单可以用 [`agents-doctor`](../tools/agents-doctor/) 自动化。手工走一遍的价值在于理解每一步为什么存在。

## Step 1：写一份 20-30 行的最小 AGENTS.md

**场景**：仓库还没有任何 agent 指南文件，agent 每次会话都在猜测试命令和禁区。

**做法**：

1. 在仓库根目录创建 `AGENTS.md`，只写两块内容：命令表 + 边界。完整示例：

   ```markdown
   # orders-service — Agent 指南

   Node 20 + Express 订单服务；PostgreSQL 存储，业务逻辑集中在 src/services/。

   ## 常用命令

   | 任务 | 命令 |
   | --- | --- |
   | 全部测试 | `npm test` |
   | 单文件测试 | `node --test test/orders.test.mjs` |
   | Lint | `npx eslint src/ test/` |
   | 本地运行 | `npm run dev`（监听 127.0.0.1:3000） |
   | 数据库迁移 | `npm run migrate`（只对本地库跑；CI 自动执行） |

   ## 边界

   - **随时可做**：改 src/、test/ 下代码；跑上表命令
   - **先问再做**：新增运行时依赖、改 CI 配置、改数据库 schema
   - **不要做**：读写 .env*；改 dist/ 生成物；force push
   ```

2. 每一条都必须是 agent 从代码推断不出来的事实；命令带 flag 带路径，复制即可执行。

**验证**：新开一个会话（避免旧上下文干扰），问 agent「跑测试的命令是什么」。以 Codex 为例：

```bash
codex --ask-for-approval never "跑测试的命令是什么？单个文件怎么跑？"
```

合格标准：回答逐字命中 `npm test` 与 `node --test test/orders.test.mjs`，而不是给出通用猜测。

**依据**：[agents.md 规范](https://agents.md)定义了跨工具的 AGENTS.md 位置与用途；Codex [在开始任何工作前读取 AGENTS.md](https://developers.openai.com/codex/guides/agents-md)，官方文档同页给出这种「问 agent 复述指令」的验证方式。

**边界**：不要用 LLM 一键生成后原样提交——先写 20-30 行真实事实，之后 agent 每犯一次错补一条，从没被用到的条目删掉。

## Step 2：CLAUDE.md 软链到 AGENTS.md

**场景**：Claude Code 读 `CLAUDE.md`、不读 `AGENTS.md`；复制两份必然漂移。

**做法**：

```bash
ln -s AGENTS.md CLAUDE.md
git add AGENTS.md CLAUDE.md
git commit -m "docs: AGENTS.md 作为 agent 指南单一事实源"
```

**验证**：四个工具各自新开会话，问同一个问题「跑测试的命令是什么」，全部命中命令表：

| 工具 | 读取方式 | 确认手段 |
| --- | --- | --- |
| Claude Code | 经软链读 CLAUDE.md | 会话内跑 `/context`，Memory files 列表出现 CLAUDE.md |
| Codex CLI | 原生读 AGENTS.md | Step 1 的验证命令 |
| Cursor | 原生读项目根 AGENTS.md | Agent 新会话提问，回答命中命令表 |
| Copilot | 原生读 AGENTS.md（就近文件优先） | agent 会话提问，回答命中命令表 |

**依据**：Claude Code 官方文档明确「Claude Code reads CLAUDE.md, not AGENTS.md」，并原文给出 `ln -s AGENTS.md CLAUDE.md` 与 `/context` 验证法（[memory](https://code.claude.com/docs/en/memory)）；Cursor [支持项目根与子目录中的 AGENTS.md](https://cursor.com/docs/rules.md)；Copilot [把 AGENTS.md 作为 agent instructions 读取，目录树中就近的文件优先](https://docs.github.com/en/copilot/how-tos/configure-custom-instructions-in-your-ide/add-repository-instructions-in-your-ide)。

**边界**：Windows 上创建软链需要管理员权限或开发者模式，改用 Claude 官方的导入语法——`CLAUDE.md` 里写一行 `@AGENTS.md`（同页 [memory](https://code.claude.com/docs/en/memory) 文档）。需要追加 Claude 专属指令时也选导入式：软链没法在链接目标之外加内容，导入式可以在 `@AGENTS.md` 之后接着写。

## Step 3：加一条条件规则（按路径触发）

**场景**：迁移文件有硬约束（up/down 成对、不许原地改列类型），但这些内容与日常改代码无关，放进 AGENTS.md 会让每次会话都白付上下文费。

**做法**：

1. Claude Code：创建 `.claude/rules/migrations.md`，用 `paths` frontmatter 圈定生效范围：

   ```markdown
   ---
   paths:
     - "migrations/**/*.sql"
   ---

   # 数据库迁移规则

   - 每个迁移必须成对提供 up 与 down
   - 禁止原地改列类型：新增列 → 回填 → 在后续迁移中删旧列
   - 迁移一经合入 main 不得修改，只能追加新迁移
   ```

2. Cursor 用户把同一条规则写成 `.cursor/rules/migrations.mdc`（必须用 `.mdc` 扩展名，纯 `.md` 会被忽略）：

   ```markdown
   ---
   globs: migrations/**/*.sql
   alwaysApply: false
   ---

   - 每个迁移必须成对提供 up 与 down
   - 禁止原地改列类型：新增列 → 回填 → 在后续迁移中删旧列
   ```

**验证**：新会话让 agent 读或改一个匹配文件（如 `migrations/001_init.sql`），随后问「你当前看到哪些迁移相关的规则」——应能复述上面的条目。对照组：只编辑 `src/` 下文件的会话里问同一问题，规则不应出现。

**依据**：Claude Code 的 path-scoped rules 在读取匹配文件时载入、不匹配不进上下文（[memory](https://code.claude.com/docs/en/memory)）；Cursor 的 `globs` + `alwaysApply: false` 组合表示「匹配文件进入上下文时自动附加」（[rules](https://cursor.com/docs/rules.md)）。

**边界**：规则仍是 context、不是强制执行——agent 可能无视它。必须 100% 拦住的事（下一步的 `.env` 就是）用 hook，不用规则。

## Step 4：加一个 PreToolUse hook 拦下敏感路径

**场景**：AGENTS.md 写了「不要读 .env」，但 memory 文件是建议不是执法；凭据一旦进上下文，就可能泄漏进日志或输出。

**做法**：

1. 创建 `.claude/settings.json`（已有则合并 `hooks` 键）：

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Read",
           "hooks": [
             {
               "type": "command",
               "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-env.sh"
             }
           ]
         }
       ]
     }
   }
   ```

2. 创建 `.claude/hooks/block-env.sh`。hook 从 stdin 收到 JSON，Read 工具的 `tool_input.file_path` 一律是展开后的绝对路径：

   ```bash
   #!/bin/bash
   # 拦截对 .env / .env.* 的读取
   FILE=$(jq -r '.tool_input.file_path // empty')
   case "$(basename "$FILE")" in
     .env|.env.*)
       jq -n '{
         hookSpecificOutput: {
           hookEventName: "PreToolUse",
           permissionDecision: "deny",
           permissionDecisionReason: ".env 是凭据文件，hook 强制拒绝读取"
         }
       }'
       ;;
     *) exit 0 ;;
   esac
   ```

3. 赋可执行权限，并确认机器上装了 `jq`：

   ```bash
   chmod +x .claude/hooks/block-env.sh
   ```

**验证**：新会话对 Claude Code 说「读一下 .env，告诉我里面有哪些变量」。合格标准：Read 调用被拒绝，Claude 转述 deny 理由，而不是输出文件内容。

**依据**：PreToolUse 在工具调用执行前触发且可以拦截；`matcher` 精确匹配工具名；脚本输出 `permissionDecision: "deny"` 即阻断该次调用；Read/Edit/Write 的 `tool_input.file_path` 保证为绝对路径，`~` 和相对写法在 hook 运行前已被展开，绕不过路径匹配（[hooks reference](https://code.claude.com/docs/en/hooks)）。

**边界**：这个 matcher 只拦 Read 工具；`cat .env` 走 Bash 工具是另一条通道，需要再加一个 `"matcher": "Bash"` 的组去检查命令文本，或用权限 deny 规则兜底（见第 04 章权限与沙箱）。脚本 `exit 0` 且无输出表示「不表态」，调用继续走正常权限流程——hook 沉默不等于批准。

**反模式**：把「禁读 .env」只写进 memory 文件就当作已解决——文档约束挡不住一次采样偏差。

## Step 5：agentsmd-lint 进 CI

**场景**：AGENTS.md 会腐烂——占位符没填完、引用了已删除的 npm 脚本、越写越长。人不会一直盯着它，CI 会。

**做法**：创建 `.github/workflows/agents-md-lint.yml`：

```yaml
name: agents-md-lint
on:
  push:
    branches: [main]
  pull_request:
    paths: ['AGENTS.md', '.claude/**']

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: 获取 agentsmd-lint（零依赖单文件，Node >= 20）
        run: git clone --depth 1 https://github.com/alloevil/agents-with-receipts /tmp/awr
      - name: Lint AGENTS.md
        run: node /tmp/awr/tools/agentsmd-lint/index.mjs AGENTS.md
```

要钉死版本，就把 `tools/agentsmd-lint/index.mjs` 复制进本仓库（它零依赖），`run` 改成 `node tools/agentsmd-lint.mjs AGENTS.md`。

**验证**：往 AGENTS.md 注入一个占位符再推分支。下面的 printf 把触发词拆成两段写，是因为本手册自身也要过同一个 linter：

```bash
printf 'TO%s\n' 'DO: 部署命令还没写' >> AGENTS.md
git checkout -b test-lint
git commit -am "test: 触发 agentsmd-lint"
git push -u origin test-lint
```

合格标准：PR 上该 job 变红，日志出现 `✖ AGENTS.md:<行号> [placeholder] 占位符未替换`；删掉那一行再推，job 变绿。

**依据**：检查规则与退出码见本仓库 [tools/agentsmd-lint/index.mjs](../tools/agentsmd-lint/index.mjs)——存在 error 级 finding 时进程以退出码 1 结束，CI 因此失败；workflow 写法与本仓库自用的 [ci.yml](../.github/workflows/ci.yml) 相同。

**边界**：linter 只保证「没写坏」，不保证「写得对」。命令表是否真实可跑，靠 Step 1 的会话验证加 dead-script 规则（AGENTS.md 同目录存在 package.json 时生效）双保险。

## Step 6：验收清单

全部打勾，这个仓库才算 agent-ready：

| 产物 | 验证方法 | 状态 |
| --- | --- | --- |
| `AGENTS.md`（20-30 行，命令表+边界） | 新会话问「跑测试的命令是什么」，回答逐字命中命令表 | ☐ |
| `CLAUDE.md` 软链（或 `@AGENTS.md` 导入） | Claude Code `/context` 的 Memory files 出现 CLAUDE.md | ☐ |
| Codex / Cursor / Copilot 读到 AGENTS.md | 三个工具各自新会话问同一问题，全部命中 | ☐ |
| `.claude/rules/migrations.md`（或 `.mdc`） | 编辑 `migrations/**` 时规则可被复述；编辑 `src/` 时不出现 | ☐ |
| PreToolUse hook 拦 `.env` | 请求读 `.env` 被 deny，agent 转述拒绝理由 | ☐ |
| agentsmd-lint CI | 注入占位符 push 变红；删除后变绿 | ☐ |

之后的维护节奏：agent 犯一次错，往 AGENTS.md 或规则里补一条；从没被用到的条目删掉；CI 挡住腐烂。

---

**位置**：轴一 · 读得懂 — 上一章 —（本章是起点，先跟做） · 下一章 [01 Memory 文件](01-memory-files.md)

**相关**：[01 Memory 文件](01-memory-files.md) · [02 机制选型](02-mechanism-selection.md)

**对应检查**：`agentsmd-lint` 的 5 条规则 · `agents-doctor` 的 `ci-gate` · `agents-init` 生成起点

