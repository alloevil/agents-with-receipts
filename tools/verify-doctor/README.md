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
