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

## 测试

```bash
node --test tools/agents-init/test/init.test.mjs
```
