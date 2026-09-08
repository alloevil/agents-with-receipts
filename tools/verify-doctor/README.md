# verify-doctor

仓库「验得动」体检器：**agent 能否自己验证工作成果**。零依赖，Node ≥ 20。

`agents-doctor` 查的是另一条轴——agent 能否读懂这个仓库（memory / rules / hooks / secrets / CI 门禁）。这条轴查的是验证回路本身：一条命令能不能起应用、能不能跑全量验证，验证结果确定不确定，失败时有没有 agent 吃得下的证据，团队规矩有没有下沉成机械红牌，逃逸口有没有被棘轮锁住。

9 项检查按**阶段门**排列（阶段 0 → 5）。前一阶段没达标，做下一阶段没有意义：在 flaky 率 5% 的仓库里给 PR 加自动合入，只是把运气自动化。

## 用法

```bash
node tools/verify-doctor/index.mjs           # 体检当前目录
node tools/verify-doctor/index.mjs ../repo   # 体检别的仓库
node tools/verify-doctor/index.mjs . --strict    # 阶段门缺口也算失败
node tools/verify-doctor/index.mjs . --baseline  # 立/更新棘轮基线
node tools/verify-doctor/index.mjs . --json      # 机器可读，见下
node tools/verify-doctor/index.mjs --help
```

只有 `error` 级导致退出码 1，阶段门缺口默认是 `warn`——文档仓库不该因为没有 e2e 就红。`--strict` 把 warn 全部提升为 error，适合已经走完阶段 3 的仓库钉死回归。

文件清单优先用 `git ls-files`（尊重 `.gitignore`、避开构建产物），不是 git 仓库时递归兜底并跳过 `node_modules` / `dist` / `build` / `vendor`。

## 检查项

| 检查 | 阶段 | 级别 | 内容 |
|---|---|---|---|
| `verify-command` | 0 | ok/info/warn | 任务运行器（justfile/Makefile/Taskfile）或 package.json 的 `dev`/`start` 与 `check`/`verify`/`ci`/`validate` 聚合入口；零测试文件 = 验证回路不存在 |
| `determinism` | 1 | ok/warn | 测试里的硬等待（`sleep(500)`/`waitForTimeout`）、真实时钟与随机（`Date.now`/`Math.random`）、未 mock 的网络调用（有 msw/nock/vcr/responses 视为已 mock）、验证命令是否固定 `TZ` |
| `failure-artifacts` | 2 | ok/warn | `.github/workflows/` 存在、是否 `upload-artifact`、是否带 `if: always()`（失败时才拿得到证据）、测试有没有 json/junit 机器可解析输出 |
| `module-boundary` | 3 | ok/warn | 按强度取命中的最强一档：workspaces 物理包边界 > Go `internal/` 编译器隔离 > dependency-cruiser > import-linter > ArchUnit > eslint `no-restricted-imports`；全无则 warn |
| `type-strict` | 3 | ok/info/warn | `tsconfig.json` 的 `strict` 与 `noUncheckedIndexedAccess`；无 tsconfig 且无 TS 源码则 info 跳过 |
| `lint-hardness` | 3 | ok/info/warn | eslint 配置里 `"warn"` 与 `"error"` 的档位计数（warn 等于不存在）、验证命令是否带 `--max-warnings=0`、有 codegen 时是否有 `git diff --exit-code` drift 门 |
| `escape-ratchet` | 3 | ok/warn/error | `eslint-disable` / `@ts-expect-error`·`@ts-ignore` / `: any`·`as any` 计数。已用 betterer → ok；否则比对 `.verify-baseline.json`，超基线 error；两者都无且计数 > 0 → warn |
| `evidence-template` | 4 | ok/warn | PR 模板存在，且模板里确实要求复现命令与证据 |
| `flaky-quarantine` | 5 | ok/info/warn/error | `.only` 一律 error（会静默跳过同文件其余测试，绿灯无信息量）；skip 需 `FLAKY: #issue @owner due YYYY-MM-DD` 标注、未过期、进清单、数量不超基线；retry 配置只是掩盖 flaky |

每条结果是 `{ id, stage, level, message, advice? }`，报告按 stage 分组输出，末尾一行总结：`verify-ready: ok X · warn Y · error Z`。

## 机器可读输出

`--json` 让 stdout 只剩一个 JSON 对象（没有人类输出混入，没有 ANSI）。四个 CLI 共用同一个 schema，agent 只需要学一次：

```bash
node tools/verify-doctor/index.mjs /tmp/demo-app --json
```

```json
{
  "tool": "verify-doctor",
  "target": "/tmp/demo-app",
  "summary": {
    "ok": 8,
    "warn": 0,
    "error": 0,
    "info": 1
  },
  "results": [
    {
      "id": "verify-command",
      "level": "ok",
      "message": "有任务运行器：just；有启动脚本（dev/start/serve）；有聚合验证入口（check/verify/ci/validate）；源文件 1 个 · 测试文件 1 个",
      "stage": 0
    },
    {
      "id": "determinism",
      "level": "ok",
      "message": "测试无硬等待；测试无真实时间/随机源；测试无直接网络调用；验证命令固定了 TZ",
      "stage": 1
    },
    {
      "id": "failure-artifacts",
      "level": "ok",
      "message": "有 CI workflow；CI 上传 artifact；artifact 失败时也上传（if: always()）；测试有机器可解析输出（json/junit）",
      "stage": 2
    },
    {
      "id": "module-boundary",
      "level": "ok",
      "message": "模块边界最强一档：monorepo workspaces（物理包边界，最强一档）",
      "stage": 3
    },
    {
      "id": "type-strict",
      "level": "ok",
      "message": "tsconfig strict: true；noUncheckedIndexedAccess: true",
      "stage": 3
    },
    {
      "id": "lint-hardness",
      "level": "info",
      "message": "无 eslint 配置，跳过 lint 硬度检查；未发现 codegen 入口，跳过生成物 drift 检查",
      "stage": 3
    },
    {
      "id": "escape-ratchet",
      "level": "ok",
      "message": "无 eslint-disable / ts-ignore / any 逃逸口",
      "stage": 3
    },
    {
      "id": "evidence-template",
      "level": "ok",
      "message": "PR 模板要求复现命令与证据",
      "stage": 4
    },
    {
      "id": "flaky-quarantine",
      "level": "ok",
      "message": "无 .only；无 skip 测试；无 retry 配置",
      "stage": 5
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `tool` | 工具名，固定 `verify-doctor` |
| `target` | 被体检仓库的绝对路径 |
| `summary` | `ok` / `warn` / `error` / `info` 四个计数，等于 `results` 里各 level 的条数 |
| `results[].id` | 上表 9 个检查 id，按 stage 升序排列，一次体检各出现一次 |
| `results[].level` | 只有 `ok` / `warn` / `error` / `info` 四个取值；`--strict` 下 warn 就地变成 error（不只是退出码变红） |
| `results[].message` | 结论，与人类输出同一句话；一个检查的多条子结论用 `；` 拼接 |
| `results[].advice` | 可选：怎么修，含官方文档链接。没有可给的建议时省略这个键，不会是 null |
| `results[].stage` | 阶段门 0–5 的整数（只有 verify-doctor 有这个字段） |

跨工具口径：`level` 四个取值全工具一致；`advice` 可选，缺失时省略这个键而不是给 null；`stage` 只有 verify-doctor 有；`line` 只有 agentsmd-lint 与 agents-init 的自检条目有。

`--baseline --json` 输出的是**基线写入结果**而不是体检报告：`results` 里每个棘轮指标一条（`id` 是指标 key，额外带 `current` 与 `baseline` 两个数字，无旧基线时省略 `baseline`，超基线的判 error），末尾一条 `baseline-write` 说明写入还是拒绝；这些条目的 `stage` 都是 3（棘轮属于阶段 3）。

退出码（`--json` 与默认模式逐字一致）：

| 码 | 含义 |
|---|---|
| 0 | 没有 error 级检查（`--baseline` 时表示基线已写入） |
| 1 | 有 error 级检查（`--strict` 下阶段门缺口也算；`--baseline` 时表示拒绝写入） |
| 2 | 用法错误（给的路径不是目录）；此时 stderr 一行用法说明，不输出 JSON |

`--help` 列出全部 flag 与退出码含义，退出码恒为 0。

## 棘轮

`--baseline` 把「agent 会用来刷绿的手段」写进 `.verify-baseline.json`，之后默认模式只校验、不写文件：

```jsonc
{
  "_note": "verify-doctor 棘轮基线：逃逸口与隔离测试只允许下降。CI 跑 verify-doctor 校验。",
  "_updated": "2026-09-08",
  "eslint_disable": 12,
  "ts_ignore": 3,
  "any_type": 41,
  "test_skip": 2,
  "test_only": 0
}
```

任一指标高于旧基线，或存在 `.only`，`--baseline` 拒绝写入并退出 1——基线只允许下降。存量改不动就立基线，**绝不把规则降成 `warn`**：人会忽略，agent 会当噪音过滤。

仓库已经在用 [betterer](https://phenomnomnominal.github.io/betterer/) 时，`escape-ratchet` 直接判 ok，不重复造棘轮。

## 依据

每条 advice 都带官方文档链接，例如：

- `--max-warnings=0` 与 suppressions 机制：[ESLint CLI](https://eslint.org/docs/latest/use/command-line-interface#--max-warnings) · [ESLint Suppressions](https://eslint.org/docs/latest/use/suppressions)
- 失败也要上传证据：[actions/upload-artifact](https://github.com/actions/upload-artifact) · [`always()` 表达式](https://docs.github.com/en/actions/reference/evaluate-expressions-in-workflows-and-actions)
- 类型逃逸口：[`strict`](https://www.typescriptlang.org/tsconfig/#strict) · [`noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)
- 结构层边界：[npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces) · [Go internal 目录](https://pkg.go.dev/cmd/go#hdr-Internal_Directories) · [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [import-linter](https://import-linter.readthedocs.io/en/stable/) · [ArchUnit](https://www.archunit.org/)
- 确定性与证据：[Playwright `waitForTimeout`](https://playwright.dev/docs/api/class-page#page-wait-for-timeout) · [Vitest `vi`](https://vitest.dev/api/vi.html) · [msw](https://mswjs.io/docs/) · [PR 模板](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)

方法论展开见 `practices/09-verifiable-repo.md`（可验证的仓库）与 `practices/10-hard-constraints.md`（硬约束下沉）。

## 测试

```bash
node --test tools/verify-doctor/test/verify-doctor.test.mjs
```
