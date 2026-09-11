# agents-doctor

仓库 agent-ready 体检器。零依赖，Node ≥ 20。

一条命令回答「这个仓库对 AI agent 友好吗」——memory 文件、软链、hooks、决策记录、敏感文件、CI 门禁，8 项一次查完。路径清单与 rosetta/README.md 的跨工具对照一致。

## 用法

```bash
node tools/agents-doctor/index.mjs          # 体检当前目录
node tools/agents-doctor/index.mjs ../repo  # 体检别的仓库
node tools/agents-doctor/index.mjs --json   # 机器可读，见下
node tools/agents-doctor/index.mjs --help
```

发现 error 时退出码 1，适合直接进 CI。

## 检查项

| 检查 | 级别 | 内容 |
|---|---|---|
| `agents-md` | error/warn/ok | 根 AGENTS.md 存在，且通过 agentsmd-lint（有 lint error 本项 error，只有 warn 则 warn） |
| `claude-md` | ok/info/warn | 指向 AGENTS.md 的软链 ok；内容相同的独立副本 info；漂移或缺失 warn |
| `rules` | info | `.claude/rules/*.md`、`.cursor/rules/*.mdc`、`.github/instructions/*.instructions.md` 哪几家已配置（可选项） |
| `hooks` | info/warn | `.claude/settings.json` 的 `hooks` 键、`.codex/hooks.json`、`.cursor/hooks.json`、`.github/hooks/*.json`；settings.json 解析失败 warn |
| `skills` | info | `.claude/skills/*/SKILL.md`、`.agents/skills/*/SKILL.md`、`.github/skills/*/SKILL.md` 各有几个 |
| `adr` | info/ok/warn | `docs/adr` 等决策记录目录或 `*.adr.md` 文件存在且被 AGENTS.md 提到 → ok；存在但 AGENTS.md 没指到 → warn（agent 不知道历史动机在哪）；没有 → info（可选项） |
| `secrets` | error/ok | `.env` / `.env.local` / `credentials.json` / `cookies.json` 存在时必须被 `.gitignore` 覆盖，否则 error |
| `ci-gate` | ok/info | `.github/workflows/*.y*ml` 里有 `agentsmd-lint` 门禁 ok；有 CI 无门禁 info（见 practices/00 Step 5） |

末尾输出一行总结：`agent-ready: ok X · warn Y · error Z`。

## 机器可读输出

`--json` 让 stdout 只剩一个 JSON 对象（没有人类输出混入，没有 ANSI）。四个 CLI 共用同一个 schema，agent 只需要学一次：

```bash
node tools/agents-doctor/index.mjs /tmp/demo-app --json
```

```json
{
  "tool": "agents-doctor",
  "target": "/tmp/demo-app",
  "summary": {
    "ok": 1,
    "warn": 1,
    "error": 1,
    "info": 5
  },
  "results": [
    {
      "id": "agents-md",
      "level": "error",
      "message": "AGENTS.md 存在，但 agentsmd-lint 报 2 error / 1 warn",
      "advice": "node tools/agentsmd-lint/index.mjs AGENTS.md 看逐条明细"
    },
    {
      "id": "claude-md",
      "level": "warn",
      "message": "CLAUDE.md 与 AGENTS.md 内容不同——两份 memory 已经漂移",
      "advice": "合并进 AGENTS.md 后 ln -sf AGENTS.md CLAUDE.md"
    },
    {
      "id": "rules",
      "level": "info",
      "message": "没有条件规则（可选项）——Codex 无 glob 机制，需要时用嵌套 AGENTS.md"
    },
    {
      "id": "hooks",
      "level": "info",
      "message": "没有 hooks 配置（可选项）"
    },
    {
      "id": "skills",
      "level": "info",
      "message": "没有 skills（可选项）"
    },
    {
      "id": "adr",
      "level": "info",
      "message": "没有决策记录（可选项）——agent 看得懂现状，但查不到「为什么当初这样做」",
      "advice": "把重大取舍记成 ADR 放进 docs/adr/（https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/what-is-an-adr.html），并从 AGENTS.md 指过去"
    },
    {
      "id": "secrets",
      "level": "ok",
      "message": "根目录没有常见敏感文件"
    },
    {
      "id": "ci-gate",
      "level": "info",
      "message": "有 CI workflow 但没接 agentsmd-lint 门禁",
      "advice": "照 practices/00-agent-ready-walkthrough.md Step 5 加一步 node tools/agentsmd-lint/index.mjs AGENTS.md"
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `tool` | 工具名，固定 `agents-doctor` |
| `target` | 被体检仓库的绝对路径 |
| `summary` | `ok` / `warn` / `error` / `info` 四个计数，等于 `results` 里各 level 的条数 |
| `results[].id` | 上表 8 个检查 id，顺序固定，一次体检各出现一次 |
| `results[].level` | 只有 `ok` / `warn` / `error` / `info` 四个取值 |
| `results[].message` | 结论，与人类输出同一句话 |
| `results[].advice` | 可选：怎么修。没有可给的建议时省略这个键，不会是 null |

跨工具口径：`level` 四个取值全工具一致；`advice` 可选，缺失时省略这个键而不是给 null；`stage` 只有 verify-doctor 有；`line` 只有 agentsmd-lint 与 agents-init 的自检条目有。

退出码（`--json` 与默认模式逐字一致）：

| 码 | 含义 |
|---|---|
| 0 | 没有 error 级检查 |
| 1 | 有 error 级检查 |
| 2 | 用法错误（给的路径不是目录）；此时 stderr 一行用法说明，不输出 JSON |

`--help` 列出全部 flag 与退出码含义，退出码恒为 0。

## 测试

```bash
node --test tools/agents-doctor/test/doctor.test.mjs
```
