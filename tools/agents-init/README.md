# agents-init

从真实项目探测生成 AGENTS.md 起点。零依赖，Node ≥ 20。

通用模板的问题是通用：命令是编的、边界是抄的，上岗第一天就被 linter 抓。
agents-init 只写探测到的真实命令和真实存在的生成物目录，产出保证过
[agentsmd-lint](../agentsmd-lint/) 零命中——写完当场自跑一遍验证。

## 用法

```bash
node tools/agents-init/index.mjs            # 当前目录
node tools/agents-init/index.mjs ~/my-repo  # 指定仓库
node tools/agents-init/index.mjs --force    # 覆盖已存在的 AGENTS.md
node tools/agents-init/index.mjs --link     # 额外软链 CLAUDE.md -> AGENTS.md
node tools/agents-init/index.mjs --json     # 机器可读，见下
node tools/agents-init/index.mjs --help
```

AGENTS.md 已存在且没加 `--force` 时拒绝写入，退出码 1。写入后自动跑
agentsmd-lint，有 error 级命中退出码 1。

## 探测项

| 探测源 | 生成内容 |
|---|---|
| `package.json` scripts 里的 test/build/lint/dev/format | `npm test` / `npm run X`（只收真实存在的；`packageManager` 含 pnpm/yarn 时换前缀） |
| `package.json` name / description | H1 标题和开头一句话 |
| `Cargo.toml` | `cargo test` / `cargo build` / `cargo clippy` |
| `pyproject.toml` | 含 pytest 痕迹给 `pytest`，否则只留注释提示，不编命令 |
| `go.mod` | `go test ./...` |
| `dist/` `build/` `target/` `node_modules/` | 存在哪个，哪个进 never 边界（外加 `.env`） |

多语言共存时全部收录。ask-first 边界固定三条：新增运行时依赖、修改 CI、force push。

生成物末尾留一条注释提醒：这是起点，agent 犯一次错就补一条边界，定期跑 agentsmd-lint。

## 机器可读输出

`--json` 让 stdout 只剩一个 JSON 对象（没有人类输出混入，没有 ANSI）。四个 CLI 共用同一个 schema，agent 只需要学一次——它是唯一会写文件的工具，所以 `results` 里既有「做了什么」也有「自检结果」：

```bash
node tools/agents-init/index.mjs /tmp/demo-init --link --json
```

```json
{
  "tool": "agents-init",
  "target": "/tmp/demo-init",
  "summary": {
    "ok": 3,
    "warn": 0,
    "error": 0,
    "info": 2
  },
  "results": [
    {
      "id": "write",
      "level": "ok",
      "message": "已写入 /tmp/demo-init/AGENTS.md",
      "file": "/tmp/demo-init/AGENTS.md"
    },
    {
      "id": "detect",
      "level": "info",
      "message": "探测到 3 条真实命令：npm test、npm run build、npm run lint"
    },
    {
      "id": "never-dirs",
      "level": "info",
      "message": "生成物目录写进 never 边界：dist"
    },
    {
      "id": "link",
      "level": "ok",
      "message": "已软链 /tmp/demo-init/CLAUDE.md -> AGENTS.md",
      "file": "/tmp/demo-init/CLAUDE.md"
    },
    {
      "id": "no-findings",
      "level": "ok",
      "message": "agentsmd-lint 零命中",
      "file": "/tmp/demo-init/AGENTS.md"
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `tool` | 工具名，固定 `agents-init` |
| `target` | 目标仓库的绝对路径 |
| `summary` | `ok` / `warn` / `error` / `info` 四个计数，等于 `results` 里各 level 的条数 |
| `results[].id` | `write` 写 AGENTS.md（拒绝覆盖时 error）· `detect` 探测到的真实命令 · `never-dirs` 进 never 边界的生成物目录 · `detect-note` 探测到但不敢编命令的提示 · `link` 软链结果（仅 `--link`）· 其余是自检命中的 agentsmd-lint 规则 id，零命中给一条 `no-findings` |
| `results[].level` | 只有 `ok` / `warn` / `error` / `info` 四个取值 |
| `results[].message` | 结论，与人类输出同一句话 |
| `results[].advice` | 可选：怎么修。没有可给的建议时省略这个键，不会是 null |
| `results[].line` | 自检命中条目的行号（对应生成出来的 AGENTS.md） |
| `results[].file` | 该条涉及的文件绝对路径 |

跨工具口径：`level` 四个取值全工具一致；`advice` 可选，缺失时省略这个键而不是给 null；`stage` 只有 verify-doctor 有；`line` 只有 agentsmd-lint 与 agents-init 的自检条目有。

退出码（`--json` 与默认模式逐字一致）：

| 码 | 含义 |
|---|---|
| 0 | 已写入，且自检零 error |
| 1 | AGENTS.md 已存在且没加 `--force`（此时 `write` 条目是 error，文件没被动），或自检有 error 级命中 |
| 2 | 用法错误（给了多个位置参数）；此时 stderr 一行用法说明，不输出 JSON |

`--help` 列出全部 flag 与退出码含义，退出码恒为 0。

## 测试

```bash
node --test tools/agents-init/test/init.test.mjs
```
