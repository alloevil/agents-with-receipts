# agentsmd-lint

AGENTS.md / CLAUDE.md 质量检查器。零依赖，Node ≥ 20。

「Treat your agent memory file like code」说了两年，一直没有工具支撑——这就是那个工具。

## 用法

```bash
node tools/agentsmd-lint/index.mjs AGENTS.md
node tools/agentsmd-lint/index.mjs --max-lines 150 AGENTS.md CLAUDE.md
node tools/agentsmd-lint/index.mjs --json AGENTS.md   # 机器可读，见下
node tools/agentsmd-lint/index.mjs --help
```

发现 error 时退出码 1，适合直接进 CI。

## 规则

| 规则 | 级别 | 依据 |
|---|---|---|
| `max-lines` | warn | 每行在每次会话都消耗上下文预算；社区共识上限 ~200 非空行 |
| `placeholder` | error | `TODO` / `TBD` / `<项目名>` 之类的模板占位符没填完就上岗 |
| `vague` | warn | "酌情 / 适当 / properly / as needed"——agent 无法执行的措辞，换成具体条件 |
| `dead-script` | error | 引用了同目录 package.json 里不存在的 npm 脚本——memory 文件里的命令必须真实可跑 |
| `empty-section` | warn | 空标题节：写了骨架没填肉 |

## 机器可读输出

`--json` 让 stdout 只剩一个 JSON 对象（没有人类输出混入，没有 ANSI）。四个 CLI 共用同一个 schema，agent 只需要学一次：

```bash
node tools/agentsmd-lint/index.mjs --json /tmp/demo-app/AGENTS.md /tmp/demo-app/CLAUDE.md
```

```json
{
  "tool": "agentsmd-lint",
  "target": [
    "/tmp/demo-app/AGENTS.md",
    "/tmp/demo-app/CLAUDE.md"
  ],
  "summary": {
    "ok": 1,
    "warn": 1,
    "error": 2,
    "info": 0
  },
  "results": [
    {
      "id": "placeholder",
      "level": "error",
      "message": "占位符未替换: \"TODO\"",
      "line": 5,
      "file": "/tmp/demo-app/AGENTS.md"
    },
    {
      "id": "vague",
      "level": "warn",
      "message": "不可执行的措辞: \"酌情\"——换成具体条件或具体命令",
      "line": 7,
      "file": "/tmp/demo-app/AGENTS.md"
    },
    {
      "id": "dead-script",
      "level": "error",
      "message": "引用了不存在的 npm 脚本 \"deploy\"（package.json scripts 里没有）",
      "line": 9,
      "file": "/tmp/demo-app/AGENTS.md"
    },
    {
      "id": "no-findings",
      "level": "ok",
      "message": "无问题",
      "file": "/tmp/demo-app/CLAUDE.md"
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `tool` | 工具名，固定 `agentsmd-lint` |
| `target` | 被检文件的绝对路径**数组**——只传一个文件时也是数组，agent 不用分情况处理 |
| `summary` | `ok` / `warn` / `error` / `info` 四个计数，等于 `results` 里各 level 的条数 |
| `results[].id` | 规则 id（上表 5 个之一），或干净文件的 `no-findings` |
| `results[].level` | 只有 `ok` / `warn` / `error` / `info` 四个取值 |
| `results[].message` | 结论，与人类输出同一句话 |
| `results[].line` | 命中行号；`no-findings` 条目没有这个键 |
| `results[].file` | 该条属于哪个文件（绝对路径），多文件入参时靠它归组 |

跨工具口径：`level` 四个取值全工具一致；`advice`（怎么修）可选，缺失时省略这个键而不是给 null；`stage` 只有 verify-doctor 有；`line` 只有 agentsmd-lint 与 agents-init 的自检条目有。

退出码（`--json` 与默认模式逐字一致）：

| 码 | 含义 |
|---|---|
| 0 | 没有 error 级条目 |
| 1 | 有 error 级条目 |
| 2 | 用法错误（没给文件、`--max-lines` 不是数字）；此时 stderr 一行用法说明，不输出 JSON |

`--help` 列出全部 flag 与退出码含义，退出码恒为 0。

## 测试

```bash
npm test
```
