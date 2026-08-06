# agentsmd-lint

AGENTS.md / CLAUDE.md 质量检查器。零依赖，Node ≥ 20。

「Treat your agent memory file like code」说了两年，一直没有工具支撑——这就是那个工具。

## 用法

```bash
node tools/agentsmd-lint/index.mjs AGENTS.md
node tools/agentsmd-lint/index.mjs --max-lines 150 AGENTS.md CLAUDE.md
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

## 测试

```bash
npm test
```
