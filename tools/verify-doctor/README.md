# verify-doctor

仓库「验得动」体检器：**agent 能否自己验证工作成果**。零依赖，Node ≥ 20。

`agents-doctor` 查的是另一条轴——agent 能否读懂这个仓库（memory / rules / hooks / secrets / CI 门禁）。这条轴查的是验证回路本身：一条命令能不能起应用、能不能跑全量验证，验证结果确定不确定，失败时有没有 agent 吃得下的证据，团队规矩有没有下沉成机械红牌，逃逸口有没有被棘轮锁住。

10 项检查按**阶段门**排列（阶段 0 → 5）。前一阶段没达标，做下一阶段没有意义：在 flaky 率 5% 的仓库里给 PR 加自动合入，只是把运气自动化。

每一项都对 5 个技术栈分别探测：**JS/TS · Python · Go · Rust · Java/Kotlin**（覆盖到什么程度见下面的技术栈覆盖表）。

**绿灯必须有信息量**：某个检查项在当前仓库**无可检之物**时，一律报 `info` 并写明「不适用：<原因>」，**绝不报 `ok`**。`ok` 只能表示「检查过了，确实干净」。对一个根本没有 JS 的 Rust 仓库报「无 eslint-disable / ts-ignore / any 逃逸口」，是绿灯零信息量——和「warn 等于不存在」是同一种失效模式，只是镜像过来的那一面。


**方法论出处**：[04 验证闭环](../../practices/04-verification.md) · [09 可验证的仓库](../../practices/09-verifiable-repo.md) · [10 硬约束下沉](../../practices/10-hard-constraints.md) · [11 验证技能](../../practices/11-verification-skills.md)（评审证据 / 验证回路 / 硬约束下沉 / UI 证据）——每项检查要解决的问题写在那里。

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

文件清单优先用 `git ls-files`（尊重 `.gitignore`、避开构建产物），不是 git 仓库时递归兜底并跳过 `node_modules` / `dist` / `build` / `vendor` / `target` / `.venv` / `venv` / `__pycache__` / `.tox` / `.gradle` 等依赖与构建目录（否则非 git 仓库会把依赖里的逃逸口算在用户头上）。

测试文件按**路径 + 内容**双路识别：路径规则（`tests/` `spec/` `__tests__/` `e2e/` 目录、`*.test.*`、`*_test.go`、`test_*.py`，Maven/Gradle 的 `src/test/java/`、`src/test/kotlin/` 由 `tests?/` 这一分支覆盖）之外，还探测内容——`.rs` 文件含 `#[test]` / `#[cfg(test)]`，`.java`·`.kt` 文件含 `@Test` / `@ParameterizedTest`。Rust 的主流约定是测试内联在源文件里，只看路径会把这类仓库判成「零测试」。同一个文件既是源又是测试时（Rust 常态）**同时进两个集合**，否则逃逸口统计会漏掉整个仓库。

## 检查项

| 检查 | 阶段 | 级别 | 内容 |
|---|---|---|---|
| `verify-command` | 0 | ok/info/warn | 任务运行器（justfile/Makefile/Taskfile）；没有时认生态约定入口（`Cargo.toml` → `cargo test`·`cargo clippy`、`go.mod` → `go test ./...`、`pyproject.toml`·`tox.ini`·`noxfile.py` → pytest 系、`pom.xml` → `mvn test`、`build.gradle(.kts)` → `gradle test`）并报「识别到 X，但没有一条命令跑完全部检查」；package.json 另查 `dev`/`start` 与 `check`/`verify`/`ci`/`validate`；零测试文件 = 验证回路不存在 |
| `determinism` | 1 | ok/warn | 按栈查硬等待（`waitForTimeout(500)` / `time.sleep` / `time.Sleep` / `thread::sleep` / `Thread.sleep`）、真实时钟与随机（`Date.now`·`Math.random` / `time.time()` / `time.Now`·`math/rand` / `SystemTime::now`·`Instant::now`·`rand::` / `new Date()`·`new Random(`）、未 mock 的网络调用（有 msw/nock/vcr/responses/httpmock/wiremock 视为已 mock）、验证命令是否固定 `TZ` |
| `failure-artifacts` | 2 | ok/warn | `.github/workflows/` 存在、是否 `upload-artifact`、是否带 `if: always()`（失败时才拿得到证据）、测试有没有 json/junit 机器可解析输出 |
| `ui-evidence` | 2 | ok/info/warn | 浏览器测试框架失败时是否保留视觉证据：Playwright 的 `trace`·`screenshot`·`video`（config 文件或依赖，全默认关）、Cypress 的 `screenshotOnRunFailure`（默认开）与 `video`；Selenium / Puppeteer 的截图靠测试代码显式调用，没有配置级探针 → info「不适用」，一个框架都没识别到同样 info |
| `module-boundary` | 3 | ok/warn | 按强度取命中的最强一档：npm workspaces / Cargo workspace / Maven `<modules>` / Gradle `include(` 物理包边界 > Go `internal/` 与 Rust `pub(crate)` 编译器级隔离 > dependency-cruiser > import-linter > ArchUnit > eslint `no-restricted-imports`；全无则 warn |
| `type-strict` | 3 | ok/info/warn | `tsconfig.json` 的 `strict` 与 `noUncheckedIndexedAccess`；Python 的 mypy `strict` / pyright `typeCheckingMode: strict`。Go·Rust·Java 的类型由编译器强制、没有独立的严格度配置层 → info「不适用」 |
| `lint-hardness` | 3 | ok/info/warn | 判的是硬度不是「有没有配」：eslint 的 `"warn"`·`"error"` 档位计数与 `--max-warnings=0`、ruff/flake8/pylint 是否存在、clippy 是否 `-D warnings`·`deny(warnings)`（只 `-W` 等于建议）、golangci-lint 是否存在、javac 是否 `-Werror`；外加有 codegen 时的 `git diff --exit-code` drift 门 |
| `escape-ratchet` | 3 | ok/info/warn/error | 各栈逃逸口计数：`eslint-disable`·`@ts-ignore`·`: any` / `# type: ignore`·`# noqa` / `//nolint` / `unwrap()`·`expect(`·`unsafe `·`#[allow(` / `@SuppressWarnings`。已用 betterer（且非 JS 栈计数为 0）→ ok；否则比对 `.verify-baseline.json`，超基线 error；无基线且计数 > 0 → warn；**一个已识别语言都没有 → info「不适用」** |
| `evidence-template` | 4 | ok/warn | PR 模板存在，且模板里确实要求复现命令与证据 |
| `flaky-quarantine` | 5 | ok/info/warn/error | `.only` 一律 error（会静默跳过同文件其余测试，绿灯无信息量），该概念只有 JS/TS 有，其余栈标 info「不适用」；skip（`.skip(` / `@pytest.mark.skip` / `t.Skip(` / `#[ignore]` / `@Disabled`·`@Ignore`）需 `FLAKY: #issue @owner due YYYY-MM-DD` 标注、未过期、进清单、数量不超基线；retry 配置只是掩盖 flaky |

每条结果是 `{ id, stage, level, message, advice? }`，报告按 stage 分组输出，末尾一行总结：`verify-ready: ok X · warn Y · error Z`。

## 技术栈覆盖

10 个检查项 × 5 个技术栈，外加一行「测试文件识别」（它是 `verify-command` / `determinism` / `flaky-quarantine` 三项的共同前提，认错了后面全错）。每格写清**探测什么**；写「不适用」的格子会在报告里如实输出 `info` 加一句原因，不会假装检查过：

| 检查 | JS/TS | Python | Go | Rust | Java/Kotlin |
|---|---|---|---|---|---|
| `verify-command` | `package.json` 的 `dev`/`start`、`check`/`verify`/`ci`/`validate` | `pyproject.toml` · `tox.ini` · `noxfile.py` → pytest 系 | `go.mod` → `go test ./...` | `Cargo.toml` → `cargo test` · `cargo clippy` | `pom.xml` → `mvn test`；`build.gradle(.kts)` → `gradle test` |
| 测试文件识别 | 路径：`*.test.*` · `*.spec.*` · `tests/` · `__tests__/` · `e2e/` | 路径：`test_*.py` · `*_test.py` · `tests/` | 路径：`*_test.go` | **内容**：`#[test]` · `#[cfg(test)]`（测试内联在源文件里，同时进源与测试集合） | 路径：`src/test/java/` · `src/test/kotlin/`；**内容**：`@Test` · `@ParameterizedTest` |
| `determinism` | `waitForTimeout(500)` · `sleep(500)` · `Date.now` · `Math.random` · `new Date()` | `time.sleep(n)` · `time.time()` · `uuid4()` | `time.Sleep` · `time.Now` · `math/rand` | `thread::sleep` · `SystemTime::now` · `Instant::now` · `rand::` | `Thread.sleep` · `new Date()` · `new Random(` |
| `failure-artifacts` | 与语言无关：`.github/workflows/` 的 `upload-artifact` + `if: always()`、json/junit reporter | 同左 | 同左 | 同左 | 同左 |
| `ui-evidence` | `playwright.config.*` / `cypress.config.*` 的失败证据字段；`@playwright/test`·`playwright`·`cypress` 依赖 | `playwright` / `selenium` 依赖 → info（无配置级探针） | 不适用：无浏览器测试框架探针 | 不适用：同左 | `pom.xml`·`build.gradle` 里的 selenium → info（无配置级探针） |
| `module-boundary` | npm `workspaces`、dependency-cruiser、eslint `no-restricted-imports` | import-linter contracts | `internal/` 编译器隔离 | `[workspace]` + `members`、`pub(crate)`（≥3 处） | Maven `<modules>`、Gradle `include(`、ArchUnit |
| `type-strict` | `tsconfig.json` 的 `strict`、`noUncheckedIndexedAccess` | mypy `strict = true`、pyright `typeCheckingMode: strict` | 不适用：类型由编译器强制，无独立严格度配置层 | 不适用：同左 | 不适用：同左 |
| `lint-hardness` | eslint 档位计数 + `--max-warnings=0` | ruff · flake8 · pylint 配置是否存在 | `.golangci.*` 或 CI 里的 `golangci-lint` | clippy 是否 `-D warnings` / `deny(warnings)`（只 `-W` 等于建议） | 构建里的 `-Werror` |
| `escape-ratchet` | `eslint-disable` · `@ts-expect-error`·`@ts-ignore` · `: any`·`as any` | `# type: ignore` · `# noqa` | `//nolint` | `unwrap()` · `expect(` · `unsafe ` · `#[allow(` | `@SuppressWarnings` |
| `evidence-template` | 与语言无关：PR 模板要求复现命令与证据 | 同左 | 同左 | 同左 | 同左 |
| `flaky-quarantine` | `.only`·`fit(`·`fdescribe(` 零容忍；`.skip(`·`xit(` | `@pytest.mark.skip` | `t.Skip(` | `#[ignore]` | `@Disabled` · `@Ignore` |

`.only` 那一档只有 JS/TS 有：`cargo test` / `pytest` / `go test` 没有「独占执行」这个概念，对这些仓库报告会写明「`.only` 不适用」，而不是拿一句「无 `.only`」冒充绿灯。

棘轮基线也按栈裁剪：Rust 仓库的 `.verify-baseline.json` 只写 `rust_unwrap` / `rust_unsafe` / `rust_allow` / `test_skip`，不会塞进一堆恒为 0 的 JS 指标。

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
    "info": 2
  },
  "results": [
    {
      "id": "verify-command",
      "level": "ok",
      "message": "有任务运行器：just；有启动脚本（dev/start/serve）；有聚合验证入口（check/verify/ci/validate）；技术栈 JS/TS · 源文件 1 个 · 测试文件 1 个",
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
      "id": "ui-evidence",
      "level": "info",
      "message": "不适用：未发现浏览器/UI 测试框架（Playwright / Cypress / Selenium / Puppeteer），没有截图/录屏证据可查",
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
      "message": "已扫 JS/TS 源码，无逃逸口（eslint-disable=0 ts-ignore/expect-error=0 any=0）",
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
| `results[].id` | 上表 10 个检查 id，按 stage 升序排列，一次体检各出现一次 |
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
// JS/TS + Rust 混合仓库的基线：只列仓库里真的存在的技术栈的指标
{
  "_note": "verify-doctor 棘轮基线：逃逸口与隔离测试只允许下降。CI 跑 verify-doctor 校验。",
  "_updated": "2026-09-08",
  "eslint_disable": 12,
  "ts_ignore": 3,
  "any_type": 41,
  "rust_unwrap": 3,
  "rust_unsafe": 0,
  "rust_allow": 7,
  "test_skip": 2,
  "test_only": 0
}
```

全部指标 key：`eslint_disable` · `ts_ignore` · `any_type`（JS/TS）、`py_type_ignore`（Python）、`go_nolint`（Go）、`rust_unwrap` · `rust_unsafe` · `rust_allow`（Rust）、`java_suppress`（Java/Kotlin）、`test_skip`（全部 5 栈）、`test_only`（仅 JS/TS）。写入时按仓库实际存在的栈裁剪。

任一指标高于旧基线，或存在 `.only`，`--baseline` 拒绝写入并退出 1——基线只允许下降。存量改不动就立基线，**绝不把规则降成 `warn`**：人会忽略，agent 会当噪音过滤。

旧基线文件缺新指标（比如给 JS 仓库立的基线后来混进了 Rust 代码）时，缺的那些指标**视为无基线**：不报错崩掉，也不会拿一句「未超过基线」替没进基线的逃逸口开绿灯，而是 warn 点名「还没进基线」，让你重跑 `--baseline` 补齐。

仓库已经在用 [betterer](https://phenomnomnominal.github.io/betterer/) 时，`escape-ratchet` 直接判 ok，不重复造棘轮——但 betterer 只管 JS/TS，非 JS 栈的逃逸口计数不为 0 时仍然照常走棘轮判定。

## 依据

每条 advice 都带官方文档链接，例如：

- `--max-warnings=0` 与 suppressions 机制：[ESLint CLI](https://eslint.org/docs/latest/use/command-line-interface#--max-warnings) · [ESLint Suppressions](https://eslint.org/docs/latest/use/suppressions)
- 失败也要上传证据：[actions/upload-artifact](https://github.com/actions/upload-artifact) · [`always()` 表达式](https://docs.github.com/en/actions/reference/evaluate-expressions-in-workflows-and-actions)
- 类型逃逸口：[`strict`](https://www.typescriptlang.org/tsconfig/#strict) · [`noUncheckedIndexedAccess`](https://www.typescriptlang.org/tsconfig/#noUncheckedIndexedAccess)
- 结构层边界：[npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces) · [Go internal 目录](https://pkg.go.dev/cmd/go#hdr-Internal_Directories) · [Cargo workspace](https://doc.rust-lang.org/cargo/reference/workspaces.html) · [Rust 可见性](https://doc.rust-lang.org/reference/visibility-and-privacy.html) · [Maven POM](https://maven.apache.org/guides/introduction/introduction-to-the-pom.html) · [Gradle 多项目](https://docs.gradle.org/current/userguide/multi_project_builds.html) · [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) · [import-linter](https://import-linter.readthedocs.io/en/stable/) · [ArchUnit](https://www.archunit.org/)
- 各生态约定入口与 lint 硬度：[`cargo test`](https://doc.rust-lang.org/cargo/commands/cargo-test.html) · [clippy 用法](https://doc.rust-lang.org/clippy/usage.html) · [rustc lint 档位](https://doc.rust-lang.org/rustc/lints/levels.html) · [`go test`](https://pkg.go.dev/cmd/go#hdr-Test_packages) · [golangci-lint](https://golangci-lint.run/) · [tox](https://tox.wiki/en/stable/) · [ruff 配置](https://docs.astral.sh/ruff/configuration/) · [mypy 命令行](https://mypy.readthedocs.io/en/stable/command_line.html) · [pyright 配置](https://microsoft.github.io/pyright/#/configuration) · [javac `-Werror`](https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html)
- 隔离与错误处理：[pytest 跳过](https://docs.pytest.org/en/stable/how-to/skipping.html) · [`testing.T.Skip`](https://pkg.go.dev/testing#T.Skip) · [Rust `Result` 与 `?`](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html) · [`thread::sleep`](https://doc.rust-lang.org/std/thread/fn.sleep.html)
- 确定性与证据：[Playwright `waitForTimeout`](https://playwright.dev/docs/api/class-page#page-wait-for-timeout) · [Playwright trace viewer](https://playwright.dev/docs/trace-viewer) · [Playwright 截图与录屏](https://playwright.dev/docs/videos) · [Playwright test options](https://playwright.dev/docs/api/class-testoptions) · [Cypress 截图与录屏](https://docs.cypress.io/app/guides/screenshots-and-videos) · [Vitest `vi`](https://vitest.dev/api/vi.html) · [msw](https://mswjs.io/docs/) · [PR 模板](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)

方法论展开见 `practices/09-verifiable-repo.md`（可验证的仓库）、`practices/10-hard-constraints.md`（硬约束下沉）与 `practices/11-verification-skills.md`（验证技能，`ui-evidence` 一节的出处）。

## 边界

诚实说清没覆盖的部分——**这是一个启发式检测器，不是编译器**：结论建立在文件名规则与正则匹配上，会有误报也会有漏报，任何一条都需要人工核对再动手。

- **只认 5 个技术栈**：JS/TS · Python · Go · Rust · Java/Kotlin。C/C++、C#、Ruby、PHP、Swift、Elixir、Zig 等一概不认——这些仓库的 `escape-ratchet` / `type-strict` / `lint-hardness` 报 `info`「不适用」，`determinism` 与 `flaky-quarantine` 里依赖语言探针的那几条子结论同样报 `info`（一条 sleep 探针都没有就说「测试无硬等待」，正是本工具要消灭的假绿灯）。`.rb` / `.swift` 仍计入源文件与测试文件总数，但没有任何针对性探测。
- **monorepo 多栈混合只做加法**：识别到的栈会各自跑各自的探测，但报告是仓库级的一份，不按子目录分组。「后端 Go 已经上了 golangci-lint、前端 TS 没配 eslint」这种局部差异会被压成同一条结论。子包各自跑一次 verify-doctor 更准。
- **自建构体系看不见**：只认 justfile / Makefile / Taskfile 与 5 个生态的标准清单文件。Bazel、Buck、Pants、Nx、Turborepo、CMake，以及仓库自己写的 `scripts/ci.sh`、`checkall.sh`，都不算「聚合入口」——会被判成缺口，实际可能已经有一条命令跑完全部检查。
- **Rust 内联测试按启发式括号扫分区**：Rust 的测试与实现同在一个文件，本工具用花括号配平把 `#[cfg(test)]` / `#[test]` 块切出来——`escape-ratchet` 只数生产区的 `unwrap()`，`determinism` 只看测试区的时钟与随机，测试里惯用的 `unwrap()` 不再被算成生产逃逸口。但配平是启发式的：字符串或注释里的花括号可能让切分偏几行，不是真正的语法分析。其余语言测试与源码分属不同文件，不涉及这个切分。
- **正则会误判**：注释与字符串里的 `unwrap()`、宏生成的测试、条件编译掉的代码，都照样计数；`retries: 3` 这种配置字段会被当成测试 retry。数字用来看趋势（棘轮只允许下降），不要当精确统计。
- **不执行任何东西**：不跑 `cargo test`、不跑 `pytest`、不装依赖。「验证命令存在」不等于「验证命令能跑通」，更不等于「测试真的在断言什么」。
- **`type-strict` 对编译型语言不下结论**：Go / Rust / Java 的类型由编译器强制，本工具不去判断 `unsafe` 之外的类型宽松度，也不看 `#[allow]` 关掉了哪些类型相关 lint。

**给消费方的口径**：`info` 不是通过。要判断某一项真的核实过且干净，必须测 `level === 'ok'`，不能测「不是 error」或「不是 warn」——`info` 恰恰表示这一项没能力查。跨语言无关的四项（`verify-command` 的运行器与文件计数、`failure-artifacts`、`module-boundary`、`evidence-template`）是唯一能在不受支持的语言上给出 `ok` 的检查，因为它们查的是 CI 配置与仓库文件，与语言无关；其余五项在无探针时一律 `info`；`ui-evidence` 介于两者之间——它认的是 Playwright/Cypress 配置而不是语言探针，无浏览器测试框架时报 `info`。这条契约有回归测试钉着（见「不受支持的技术栈（Ruby）」用例）。

## 测试

```bash
node --test tools/verify-doctor/test/verify-doctor.test.mjs
```
