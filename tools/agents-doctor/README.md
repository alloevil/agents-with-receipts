# agents-doctor

仓库 agent-ready 体检器。零依赖，Node ≥ 20。

一条命令回答「这个仓库对 AI agent 友好吗」——memory 文件、软链、hooks、敏感文件、CI 门禁，7 项一次查完。路径清单与 rosetta/README.md 的跨工具对照一致。

## 用法

```bash
node tools/agents-doctor/index.mjs          # 体检当前目录
node tools/agents-doctor/index.mjs ../repo  # 体检别的仓库
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
| `secrets` | error/ok | `.env` / `.env.local` / `credentials.json` / `cookies.json` 存在时必须被 `.gitignore` 覆盖，否则 error |
| `ci-gate` | ok/info | `.github/workflows/*.y*ml` 里有 `agentsmd-lint` 门禁 ok；有 CI 无门禁 info（见 practices/00 Step 5） |

末尾输出一行总结：`agent-ready: ok X · warn Y · error Z`。

## 测试

```bash
node --test tools/agents-doctor/test/doctor.test.mjs
```
