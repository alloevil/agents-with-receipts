# 10 — 硬约束下沉

> 适用范围：任何有 CI 的仓库（TypeScript / Python / Java / Go / Rust 各给手段）· 验证于 2026-09

规矩写在文档里，只在 agent 恰好读到、并且恰好照做时才生效。同一条规矩写进包边界、类型检查器和 CI 之后，它在 agent 完全不知道这条规矩存在时也生效。本章做的是这一次搬迁：把「请不要这样写」变成「这样写通不过」。

**这不是 AI 时代的新发明。** 这套做法早就有名字：**architecture fitness function**——把架构特征变成可自动、持续评估的客观检查。它 2017 年 11 月就进了 Thoughtworks Technology Radar 的 Trial 环（[fitness function blip](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function)，官方标注 Published: Nov 30, 2017）；把它落成普通单元测试的 ArchUnit，仓库 2017 年 4 月创建（[TNG/ArchUnit](https://github.com/TNG/ArchUnit)），2018 年 5 月进 Radar 的 Assess 环、同年 11 月进 Trial 环（[ArchUnit blip](https://www.thoughtworks.com/radar/tools/archunit)）——都比 AI coding agent 早得多。变的不是方法，是收益率：agent 的产出速度上来之后，「靠人在 review 里记住二十条约定」这条路先崩。所以这章的做法半衰期很长，值得优先投入。

本章是 [09 可验证的仓库](09-verifiable-repo.md) 阶段 3 的展开；本仓库的 `verify-doctor` 用 `module-boundary` / `type-strict` / `lint-hardness` / `escape-ratchet` 四项检查体检这一层。

## 10.1 四层分层：能上溯就不下沉

**场景**：你有一条团队规矩（「UI 层不许直接读数据库」「日期不许用 `new Date()`」），现在只写在 AGENTS.md 或 review 习惯里。

**做法**：按拦截强度排四层，把规矩往上层推：

| 层 | 违反时发生什么 | 手段 |
|---|---|---|
| ① 结构 | **错误代码写不出来** | 目录隔离 / 包边界 / 语言级可见性 |
| ② 类型 | 写出来编译不过 | `strict` 系列开关、禁 `any` 逃逸 |
| ③ 机械 | 编译过但 CI 红牌 | lint error、架构检查、生成物 drift 检查 |
| ④ 提示 | 只能提醒 | rules / skills / 文档 |

① 最强的原因不是「更严」，而是**不需要 agent 知道规则存在**：`packages/ui/package.json` 里没有 `packages/db` 依赖时，那行 import 根本解析不了，agent 的最短路径本身就是合规路径。

判据一句话：*agent 在不知道这条规则存在的情况下，会不会自然写出合规代码？*

- 会 → 好约束（① 通常满足）
- 不会，但失败信息一眼能看出怎么改 → 可接受（②③）
- 不会，且失败信息只说「违规」→ 会制造绕过行为，先改设计再上规则

**停在 ④ 层 = 承认这条没管住。** 提示层不是"弱一点的约束"，它是另一个类别：没有强制力。

**依据**：ArchUnit 官方把这类规则明确定位成"用任何 Java 单元测试框架自动测试架构与编码规则"，而不是文档约定（[ArchUnit User Guide](https://www.archunit.org/userguide/html/000_Index.html)）；把架构特征做成自动、持续的客观评估这件事本身，见 [fitness function blip](https://www.thoughtworks.com/radar/techniques/architectural-fitness-function)。

**边界**：真正只能停在 ④ 层的规矩存在——命名品味、注释语气、"这个抽象是否值得"。这些别硬做成机械规则，机械化一个模糊标准只会生产假失败。

## 10.2 五步流程：一次只搬 3–5 条

**场景**：你决定开始下沉，但不知道从哪条开始，也不知道搬到一半会不会把主干堵死。

**做法**：固定五步，顺序不可换。

1. **列清单。** 来源按可靠度排序：① review 评论里重复出现的意见 ② 事故复盘的 action item ③ 文档与老人口述（最不可靠，常已过期）。挖第一类：

   ```bash
   gh pr list --state merged --limit 200 --json number --jq '.[].number' \
     | while read -r n; do gh pr view "$n" --json reviews --jq '.reviews[].body'; done \
     > /tmp/review-comments.txt
   ```

   每条候选问一句：**违反它时谁会发现？** 答案是「人」的全部进清单。排序 = 重复次数 × 出事严重度。

2. **选层。** 按 10.1 的判据给每条定层，能上溯就不下沉。

3. **落配置。** 写成可执行配置（10.3 / 10.4 给各语言的具体位置）。失败信息里必须有替代方案。

4. **清存量。** 新规则一开就是几百个错，这一步决定成败（10.5）。

5. **装门。** 进 required status checks，本地与 CI 同一条命令（10.6）。

第 4 步和第 5 步**不能颠倒**：先转 error + required、再清存量，会让主干一周合不进代码，团队的第一反应是关掉规则，从此再没人敢加约束。

**依据**：ESLint 官方对这个顺序问题的描述最直接——"把一条新规则设成 `error` 在存量违规多且规则不可自动修时会很困难……除非规则在项目早期就启用，否则随着代码库变大会越来越难启用"，官方给出的解法正是先批量抑制存量再开门（[Bulk Suppressions](https://eslint.org/docs/latest/use/suppressions)）。

**边界**：一次只搬 3–5 条。批量上二十条规则时，没人能分清哪次 CI 变红是因为哪条规则，团队会把整批一起回滚。

清单只能来自你们自己的仓库。**不要抄别人仓库的具体禁令**——别人博客里那条「禁 useEffect」是他们反复踩出来的坑，对你们可能纯属噪音。抄来的规则第一次挡住一个合理写法时就会被整条删掉，并且会顺手削弱团队对所有约束的信任。

## 10.3 边界：物理拆包强于 lint 规则

**场景**：模块之间该有边界（feature 之间只经 shared 通信、UI 不碰 infra），现在靠口头约定和 review。

**做法**：优先物理拆包，拆不动才退到检查器规则。

| 语言 | ① 结构层（不依赖检查器被执行） | ③ 机械层（依赖检查器被执行） |
|---|---|---|
| TypeScript | monorepo workspaces：包的 `package.json` 里没有那条依赖，import 解析失败 | `dependency-cruiser` forbidden 规则 > eslint [`no-restricted-imports`](https://eslint.org/docs/latest/rules/no-restricted-imports) |
| Python | 无语言级可见性可用（`_private` 只是约定） | `import-linter` 的 forbidden / layers / independence 合约 |
| Java / Kotlin | JPMS `module-info.java` | ArchUnit 测试（跑在普通单测里） |
| Go | `internal/` 目录，由 go 命令强制 | `go vet` 与自定义 analyzer |
| Rust | crate 拆分 + `pub(crate)` / `pub(super)` | clippy 规则 |

这张表的五个栈与本仓库 `verify-doctor` 的探测口径是同一套：JS/TS · Python · Go · Rust · Java/Kotlin（表里 TypeScript 那一行对纯 JavaScript 同样成立，只是少了 ② 类型层这一档）。栈之外的语言仍然适用 10.1 的分层判据，只是具体手段要你自己填。

**结构层强一个数量级的原因只有一个：它不依赖检查器被执行。** lint 规则要靠有人配好、有人跑、CI 步骤没被跳过、没人加白名单；包边界和可见性由编译器/包管理器在解析阶段执行，绕不过去。

拆不动时（单体仓库、循环依赖已成事实），退到 `dependency-cruiser`：

```jsonc
// .dependency-cruiser.json
{
  "forbidden": [
    { "name": "ui-not-to-db", "severity": "error",
      "comment": "UI 只能经 src/api 取数。见 docs/adr/007.md",
      "from": { "path": "^src/ui/" }, "to": { "path": "^src/(db|infra)/" } },
    { "name": "no-cycles", "severity": "error",
      "from": {}, "to": { "circular": true } }
  ],
  "options": { "doNotFollow": { "path": "node_modules" } }
}
```

最弱一档是 eslint 规则——它只在 lint 被跑到时存在，所以只用来挡「禁用某个 API」这类单点问题，且 `message` 必须写出替代方案：

```js
// eslint.config.js
rules: {
  "no-restricted-imports": ["error", { paths: [{
    name: "moment",
    message: "用 src/shared/date 的等价实现，避免包体积回归。见 docs/adr/011.md"
  }]}]
}
```

Python 侧等价物是 `.importlinter`：

```ini
[importlinter]
root_package = myproject

[importlinter:contract:layers]
name = 分层不可逆向
type = layers
layers =
    myproject.web
    myproject.service
    myproject.db
```

**依据**：workspaces 的符号链接与依赖声明语义见 [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)；规则语法见 [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 与 [Import Linter](https://import-linter.readthedocs.io/en/stable/)（官方合约类型：forbidden / protected / layers / independence / acyclic siblings）；Go 官方原文："Code in or below a directory named `internal` is importable only by code that shares the same import path above the internal directory"（[go command 文档](https://pkg.go.dev/cmd/go#hdr-Internal_packages)）；`pub(crate)` 语义见 [The Rust Reference](https://doc.rust-lang.org/reference/visibility-and-privacy.html)；Java 侧规则写法见 [ArchUnit User Guide](https://www.archunit.org/userguide/html/000_Index.html)。

**边界**：拆包有真实成本——版本联动、构建图变复杂、跨包重构变贵。三个人的项目拆成十二个包是把边界成本前置到还不需要边界的时候。判据是「这条边界被违反过几次」，不是「架构图上有几个框」。

还有一条更容易踩的反面：**约束的方向必须有唯一出口。** 每条禁令的失败信息里都得写清替代路径（上面 dependency-cruiser 配置里的 `comment` 和 eslint 规则的 `message` 就是放这个的地方：「用 `src/api` 取数，见 docs/adr/007.md」）。只说「禁止」不给替代方案的规则，不会让 agent 停下来问，它会挑一条你没堵的路绕过去——把类型改名再包一层、把 import 换成动态 `import()`、加一行 disable 注释。绕过之后 CI 是绿的，而边界已经破了，且这次破得更难发现。

## 10.4 逃逸口：必须计数，且只减不增

**场景**：规则全上了 error，CI 绿了。然后你在 diff 里看到一行 `// eslint-disable-next-line`。

**做法**：把逃逸口本身当成一项指标。

1. 先把口子收窄到"必须写理由才能用"：

   ```jsonc
   // tsconfig.json
   { "compilerOptions": {
     "strict": true,
     "noUncheckedIndexedAccess": true,
     "exactOptionalPropertyTypes": true,
     "noFallthroughCasesInSwitch": true
   }}
   ```

   ```js
   // eslint.config.js
   rules: {
     "@typescript-eslint/no-explicit-any": "error",
     "@typescript-eslint/no-non-null-assertion": "error",
     "@typescript-eslint/ban-ts-comment": ["error", {
       "ts-expect-error": "allow-with-description", minimumDescriptionLength: 10
     }]
   }
   ```

2. **逃逸口不只有 JS 那三种。** 上面两段配置堵的是 JS/TS 的口子；其他栈各有自己的一套写法，棘轮要数的是各自那一套：

   | 栈 | 常见逃逸口 | 收窄手段 |
   |---|---|---|
   | JS/TS | `eslint-disable` / `@ts-expect-error` / `as any` | 上面两段配置 |
   | Python | `# type: ignore` / `# noqa` | ignore 必须带 error code（`# type: ignore[attr-defined]`，见 [mypy error codes](https://mypy.readthedocs.io/en/stable/error_codes.html)），并开 [`warn_unused_ignores`](https://mypy.readthedocs.io/en/stable/config_file.html#confval-warn_unused_ignores) 让已经失效的 ignore 自己报出来；`noqa` 必须带规则号（`# noqa: F841`，见 [Ruff · Error suppression](https://docs.astral.sh/ruff/linter/#error-suppression)、[flake8 violations](https://flake8.pycqa.org/en/latest/user/violations.html)），裸 `# noqa` 按违规处理 |
   | Go | `//nolint` | 必须写明 linter 名、并在同一行写理由（官方支持 `//nolint:gocyclo // 理由` 这种写法）；`//nolint:all` 官方语义是"排除全部 linter"，等于对该行整体关掉检查（[Nolint Directive](https://golangci-lint.run/docs/linters/false-positives/#nolint-directive)） |
   | Rust | `unwrap()` / `expect()` / `unsafe` / `#[allow]` | `unwrap_used` / `expect_used` 在 clippy 的 [`restriction`](https://doc.rust-lang.org/clippy/lints.html#restriction) 组里，官方要求按需挑选开启而不是整组打开（[unwrap_used](https://rust-lang.github.io/rust-clippy/master/#unwrap_used)）；unsafe 用 `#![forbid(unsafe_code)]`——官方原文"same as deny(C), but also forbids changing the lint level afterwards"，即内层再写 `#[allow]` 也打不开；豁免一律写 `#[expect]` 而不是 `#[allow]`，豁免没被触发时编译器报 `unfulfilled_lint_expectations`，过期的豁免会自己冒出来（[Lint check attributes](https://doc.rust-lang.org/reference/attributes/diagnostics.html#lint-check-attributes)） |
   | Java/Kotlin | [`@SuppressWarnings`](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/SuppressWarnings.html) | 按注解计数进基线；架构规则那一档直接用 ArchUnit 的 `FreezingArchRule`（见下一条） |

   **顺带一条给检查器作者：绿灯必须有信息量。** 只数 `eslint-disable` 那三种，在一个满是 `unwrap()` 的 Rust 仓库上会报出"未发现逃逸口"——那不是干净，那是没看。某项检查在当前仓库无可检之物时，应当报「不适用」并说明原因，`ok` 只留给"查过了，确实干净"。这与 10.5 那条"warn 等于不存在"是同一个错误的两面：一个把真信号降到没人看，一个把没有信号包装成好消息。

3. 再把上表里适用于你这个栈的那几项的**总数**写进基线文件，CI 只允许它下降。本仓库 `verify-doctor` 的 `escape-ratchet` 检查就是这件事的最小实现：`node tools/verify-doctor/index.mjs . --baseline` 把当前计数写进 `.verify-baseline.json`，之后每次运行都与它比对。

4. **先查有没有成熟工具，再考虑自己写。** 棘轮这个概念已经有四个成熟实现：betterer（把任意指标的历史值存进 `.betterer.results`，只允许朝目标方向变化）、ESLint 内置 bulk suppressions（`eslint-suppressions.json`）、dependency-cruiser 的 known-violations 基线、ArchUnit 的 `FreezingArchRule`。仓库已经在用其中之一时，别再叠第二套。

**agent 最爱用一行 disable 注释让 CI 变绿。** 不数它，前面四层全部白做。

**依据**：betterer 官方描述："把一个值随时间的变化记录下来，并确保它按你希望的方向变化"，变好就更新结果文件、变坏就报错（[Betterer 介绍](https://phenomnomnominal.github.io/betterer/docs/introduction/)）；ESLint 官方的抑制文件机制与"存量抑制已修复却没清理就报错"（`--prune-suppressions`）见 [Bulk Suppressions](https://eslint.org/docs/latest/use/suppressions)；`allow-with-description` / `minimumDescriptionLength` 语义见 [ban-ts-comment](https://typescript-eslint.io/rules/ban-ts-comment/)；ArchUnit 官方原文："Consecutive runs will then only report new violations and ignore known violations. If violations are fixed, `FreezingArchRule` will automatically reduce the known stored violations to prevent any regression"，且可用 `freeze.store.default.allowStoreUpdate=false` 在 CI 里禁止写基线（[ArchUnit 8.6](https://www.archunit.org/userguide/html/000_Index.html#_freezing_arch_rules)）；`strict` 与 `noUncheckedIndexedAccess` 见 [TSConfig 参考](https://www.typescriptlang.org/tsconfig/#strict)。

**边界**：棘轮只保证不变坏，不保证变好。基线文件必须带归零责任人和期限，否则它就是一份被永久接受的技术债清单。ArchUnit 官方那个 `allowStoreUpdate=false` 开关值得抄：CI 里禁止写基线，只有人在本地显式操作才能改。

**反模式**：给某个目录整体加白名单来"解决"逃逸口过多——那等于把这些逃逸口从计数里删掉，棘轮从此不再测量任何东西。

## 10.5 清存量：三个选项，第三个永远不选

**场景**：新规则一开，CI 报 800 个错。

**做法**：按顺序选。

1. **机器改。** `eslint --fix` 或结构化 codemod（ast-grep 等）。这是 agent 最擅长的活：范围明确、正确性可机械验证、一个 PR 收口。改完人读一遍 diff——自动修复偶尔会改变语义。
2. **基线 + 棘轮。** 存量违规入基线，CI 只检查「新增 = 0」且「基线条目单调不增」（10.4 的工具直接可用）。
3. **绝不选：降成 `warn`。**

第三条要单独说明为什么是死路：**warn 等于不存在。** 人会忽略满屏黄字，agent 会把它当噪音过滤掉。这有硬证据——ESLint CLI 的 `--max-warnings` 默认值是 `-1`，即无论多少 warning 退出码都是 0。一条 warn 级规则对 CI 门禁的贡献严格等于零。要么 error + 基线，要么先别上这条规则。

**依据**：`--max-warnings Int  Number of warnings to trigger nonzero exit code - default: -1` 与退出码语义见 [ESLint CLI 参考](https://eslint.org/docs/latest/use/command-line-interface)；官方推荐的存量抑制姿势是先自动修再抑制（`eslint --fix --suppress-all`，"建议加 `--fix` 以免把可自动修的违规也抑制掉"，见 [Bulk Suppressions](https://eslint.org/docs/latest/use/suppressions)）；dependency-cruiser 自身仓库就用 `.dependency-cruiser-known-violations.json` 做同一件事（[仓库文件列表](https://github.com/sverweij/dependency-cruiser)）。

**边界**：如果那 800 个错里有相当比例其实是合理写法，问题不在存量，在规则本身——退回 10.1 重新选层或重写规则，别用基线把一条错规则冻起来。基线是给"确实该改、只是改不完"的存量用的。

**反模式**：把存量清理和规则启用放在同一个 PR 里。八百处修改混着一处配置变更，reviewer 只能通过，出问题也无法二分定位。

## 10.6 装门：CI 才是门

**场景**：规则配好了、存量清了，但它只在有人本地跑 lint 时才生效。

**做法**：

1. 所有检查进 **required status checks**，主干开分支保护，禁止 force push。GitHub 的分支保护默认就禁止 force push 与删除分支，不需要额外配置。
2. **本地与 CI 跑同一条命令**（`just check` / `make check` / 一个脚本），配置不允许分叉。两边命令一分叉，"本地是绿的"就会变成日常对话。
3. pre-commit hook 可选，但它**不是门**：`git commit --no-verify` 一个参数就绕过去了。它的价值只是把反馈提前几分钟。
4. 每条规则的失败输出必须含四要素：违规位置、为什么禁、怎么改、相关 ADR 链接。缺第三项的规则会诱发绕过行为——改个名字包一层、加个 disable 注释，然后 CI 变绿而问题还在。

**依据**："Required status checks must have a `successful`, `skipped`, or `neutral` status before collaborators can make changes to a protected branch"，以及"By default, each branch protection rule disables force pushes to the matching branches and prevents the matching branches from being deleted"，均见 [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)；同页官方提示：required check 的 job 名必须全仓库唯一，重名会导致状态检查结果歧义并卡住合并。`--no-verify` 跳过 pre-commit / commit-msg hook 见 [git-commit 文档](https://git-scm.com/docs/git-commit)。

**边界**：分支保护默认**不**约束 admin 与有 bypass 权限的角色——要真正封死得显式打开 "Do not allow bypassing the above settings"。另外 CI / 无人值守场景里没有人回答任何提示，门只能是退出码，不能是交互确认。

**反模式**：只装 pre-commit，不进 required check。这等于把门禁委托给每个人的本地环境和心情，也让 agent 得到一个「不跑就是绿」的合法姿势。

---

**位置**：轴二 · 验得动 — 上一章 [09 可验证的仓库](09-verifiable-repo.md) · 下一章 [11 验证技能](11-verification-skills.md)

**相关**：[09 可验证的仓库](09-verifiable-repo.md) · [11 验证技能](11-verification-skills.md)

**对应检查**：`verify-doctor` 的 `module-boundary` · `type-strict` · `lint-hardness` · `escape-ratchet`

