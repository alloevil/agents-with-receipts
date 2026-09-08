# 09 — 可验证的仓库

> 适用工具：Claude Code · Codex · 所有读 AGENTS.md 的工具 · 验证于 2026-09

前八章解决的是第一条轴：agent 能否**读得懂**这个仓库。本章开始第二条轴：agent 能否自己**验得动**——跑一条命令、读到确定的结果、拿到能定位问题的失败输出。04 讲的是用 agent 时的验证工作流（agent-TDD、独立评审、diff 对账），本章讲的是仓库基建：单命令验证回路、确定性、结构化失败输出、flaky 治理、Feature Map。基建缺位时 04 的每个手段都会退化成你本人重跑一遍。本章的检查项可以用 `verify-doctor` 直接跑出来。

## 9.1 一条 dev、一条 check，本地与 CI 不许配置分叉

**场景**：新 agent（或新同事）进入仓库，要知道"怎么起环境""怎么证明改动没坏东西"。当前答案散在 README、CI workflow 和某人的 shell history 里。

**做法**：

1. 只暴露两个入口，用仓库既有的任务运行器（`package.json` scripts / Makefile / justfile），不新增第二套：

   ```make
   dev:                             # 幂等：重复执行不重起已在跑的依赖
       docker compose up -d --wait  # --wait 等健康检查通过，不写 sleep
       make migrate seed
       npm run dev

   check: typecheck lint test       # 本地与 CI 是同一条命令
   typecheck: ; tsc --noEmit
   lint:      ; eslint . --max-warnings=0
   test:      ; vitest run --reporter=json --outputFile=.artifacts/test.json
   ```

2. CI 里只写这一条，禁止在 workflow 里重新拼一遍命令：

   ```yaml
   - run: make check   # 与本地共用同一入口；分叉出来的就是 CI-only 失败
   ```

3. 每条子命令保持单独可跑（`make lint`、`make test`），agent 才能局部迭代，不必为一处类型错误等全量。
4. 把这两条写进 AGENTS.md 的 Testing instructions（写法见 4.5），agent 不需要猜 runner。

**依据**：`--max-warnings` 是 ESLint 官方定义的"告警数触发非零退出码"开关，`0` 即告警等于失败（[ESLint CLI](https://eslint.org/docs/latest/use/command-line-interface#--max-warnings)）；`docker compose up --wait` 的官方语义是"等到服务 running/healthy 才返回"，可替掉固定睡眠（[docker compose up](https://docs.docker.com/reference/cli/docker/compose/up/)）；Vitest 官方指定用 `--reporter=json --outputFile=` 产出可编程消费的报告（[Reporters](https://vitest.dev/guide/reporters)）。

**边界**：monorepo 用运行器自带的过滤参数收窄范围（`make check PKG=web`），而不是给每个包各造一套入口。已有成熟运行器的仓库直接沿用；为了"统一"再套一层 wrapper 只会多一个分叉点。

**反模式**：README 写"跑测试前先 export 这几个变量、起 docker、再执行三条命令"——这三步里任何一步 agent 猜错，后面所有验证结论都无效。

## 9.2 六类不确定源逐个封死

**场景**：同一 commit 跑两次结果不同。此时 agent 无法区分"我改坏了"和"环境抖了"。

**做法**：

1. 按来源逐类改，不靠加重试掩盖：

   | 不确定源 | 修法 |
   |---|---|
   | 硬等待 `sleep(500)` | 换条件等待：`vi.waitFor(() => cond)`、Playwright 的自动等待断言 |
   | 共享状态、DB 残留 | 每个测试独立事务并回滚，或独立 schema / 独立临时目录 |
   | 真实时钟、时区 | 注入固定时钟 `vi.setSystemTime(...)`，命令里写 `TZ=UTC` |
   | 随机数、随机顺序 | 固定 seed，并显式开随机顺序跑一次以暴露顺序依赖 |
   | 外部网络 | 全量 mock 或 record/replay，CI 断网跑一次证明没漏 |
   | 端口冲突 | 监听端口 0 让内核分配，或按 worker id 派发 |

2. 自检命令挂 nightly，不挂 PR 门（慢且噪音大）：

   ```bash
   TZ=UTC make check                                       # 时区固定后仍应全绿
   npx vitest run --sequence.shuffle --sequence.seed=1000   # 暴露顺序依赖
   docker run --network=none $IMAGE make test               # 断网证明无外网访问
   ```

3. 随机顺序要固定并打印 seed，失败才能原样重放；否则"偶尔红一次"没有下一步。

**依据**：`vi.setSystemTime` 与 `vi.waitFor` 是 Vitest 官方 API（[Vi](https://vitest.dev/api/vi)）；`sequence.shuffle` / `sequence.seed` 的官方用途正是"追查意外依赖前一个测试执行结果的测试"（[sequence](https://vitest.dev/config/sequence)）；`TZ` 环境变量对 Node 进程时区的作用见 [Node.js CLI](https://nodejs.org/api/cli.html#tz)；Playwright 在每个动作前执行 visible / stable / enabled 等 actionability 检查并自动等待，官方以此取代固定睡眠（[Auto-waiting](https://playwright.dev/docs/actionability)）；把网络行为收敛成一层独立 mock 见 [Mock Service Worker](https://mswjs.io/docs/)；pytest 官方也把"依赖测试顺序""上一个测试没清理干净"列为 flaky 的首要根因（[Flaky tests](https://docs.pytest.org/en/stable/explanation/flaky.html)）。

**边界**：封死不确定源会牺牲一部分真实性——全 mock 的网络测不到真实契约漂移，固定时钟测不到夏令时。补法是另开一档真实环境的慢速测试跑 nightly，而不是让 PR 门上的测试自己去连外网。

**反模式**：给抖动的测试加 `retries: 3` 当修复。绿灯从此意味着"三次里蒙对一次"，agent 再也拿不到可信信号。

## 9.3 失败输出四件套：断言、定位、复现命令、artifact

**场景**：agent 修一个 CI 失败。它唯一的输入是失败输出，不是你脑子里的上下文——修复质量约等于失败信息质量。

**做法**：

1. 每个失败给齐四件：

   - **失败断言**：期望值 vs 实际值（写出值本身，不是"不匹配"）
   - **定位**：文件 + 行 + 测试名
   - **复现命令**：可原样粘贴的单测命令
   - **artifact 路径**：截图 / trace / HAR / JSON 报告，统一落到 `.artifacts/`

2. 让 runner 直接产出机器可读报告和 trace，而不是靠人转述：

   ```bash
   vitest run --reporter=json --outputFile=.artifacts/test.json
   playwright test --trace=on-first-retry --output=.artifacts/e2e
   ```

3. CI 无论成败都上传证据，否则 agent 只能看日志尾巴猜：

   ```yaml
   - uses: actions/upload-artifact@v4
     if: ${{ !cancelled() }}
     with:
       name: evidence
       path: .artifacts/
   ```

4. 在 AGENTS.md 里写明 artifact 落在哪、怎么读，agent 才会去看 trace 而不是重跑一遍复现。

**依据**：Vitest 的 `json` reporter 配 `outputFile` 是官方指定的程序化消费方式（[Reporters](https://vitest.dev/guide/reporters)）；Playwright 官方推荐 CI 上设 `trace: 'on-first-retry'`，为重试的失败测试留下可逐动作回放的 `trace.zip`（[Trace viewer](https://playwright.dev/docs/trace-viewer)）；上传用 `actions/upload-artifact`（[README](https://github.com/actions/upload-artifact)），GitHub 官方文档说明 `always()` 连 job 被取消时也会执行、可能把流水线挂到超时，推荐用 `if: ${{ !cancelled() }}` 表达"无论成败都跑"（[Evaluate expressions](https://docs.github.com/en/actions/reference/workflows-and-actions/expressions)）；产物的下载入口见 [Downloading workflow artifacts](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts)。

**边界**：artifact 有保留期与体积成本（GitHub 默认存 90 天、可按仓库改），trace 常开会显著拖慢 e2e——官方明确 `trace: 'on'` 不推荐。只给失败和首次重试留证据。

**反模式**：把 2000 行原始日志整段贴给 agent。它会挑一个看起来相关的报错去改，改到日志变短为止。

## 9.4 flaky 清零或隔离，因为 agent 不会重跑

**场景**：主干上有几个"偶尔红"的测试，团队习惯重跑一次就过。

**做法**：

1. 先认清人与 agent 的行为差异——这是 flaky 从卫生问题升级为 P0 的原因：

   | | 人遇到 flaky | agent 遇到 flaky |
   |---|---|---|
   | 判断 | "又抖了" | 认为是自己的改动破坏了它 |
   | 行为 | 重跑 | 改代码或改测试让它绿 |
   | 结果 | 浪费两分钟 | 引入真 bug 或删掉有效断言，PR 全绿 |

2. 先要数据再谈治理。同一 commit 重复跑，20 次里出现过一次红就入名单：

   ```bash
   for i in $(seq 1 20); do npx vitest run --reporter=json \
       --outputFile=".artifacts/run-$i.json" || true; done
   npx playwright test --repeat-each=20   # e2e 侧
   pytest --count=20                      # pytest-repeat
   go test -count=20 -race ./...
   ```

3. 修不了的先关笼子，不是删掉。标记格式做成机械可校验的 `FLAKY: #<issue> @<owner> due <YYYY-MM-DD>`：

   ```ts
   // FLAKY: #4213 @alice due 2026-09-30 — websocket 重连时序，等 infra 升级
   test.skip('checkout retries on 502', async () => { /* ... */ });
   ```

   配套三条硬规则，否则隔离区会变垃圾场：隔离测试**不参与合并门**但每天单独跑一次并出报表；隔离清单条目数**只允许下降**，新增需显式批准；每条**有到期时间**，过期未修则删测试并同时收回该功能路径的自动合入权限——那条路径已无可信验证。

4. CI 扫描跳过标记与 `.only`：缺格式或已过期直接失败，`.only` 计数必须为 0（它会静默跳过同文件其余测试）。Playwright 自带开关：

   ```bash
   npx playwright test --forbid-only --fail-on-flaky-tests
   ```

5. 验收标准写成一句可核对的话：同一 commit 连续 20 次运行，非隔离测试集 100% 绿；隔离清单条目数单调不增；`.only` 计数为 0。

**依据**：pytest 官方 Flaky tests 一页指出"测试结果不再是可信信号时，开发者会开始不信任测试结果，从而漏掉真实失败"，并把 xfail 式手工隔离称为长期使用相当危险（[Flaky tests](https://docs.pytest.org/en/stable/explanation/flaky.html)）；重复跑与门禁开关都有官方出处：Playwright 的 `--repeat-each`、`--forbid-only`、`--fail-on-flaky-tests`（[Command line](https://playwright.dev/docs/test-cli)）、pytest-repeat 的 `--count`（[pytest-repeat](https://github.com/pytest-dev/pytest-repeat)）、Go 的 `-count n`（[go command](https://pkg.go.dev/cmd/go#hdr-Testing_flags)）；随机顺序暴露顺序依赖用 pytest-randomly，需要关掉时官方给出 `-p no:randomly`（[pytest-randomly](https://github.com/pytest-dev/pytest-randomly)、[How to install and use plugins](https://docs.pytest.org/en/stable/how-to/plugins.html)）；Playwright 把"首跑失败、重试通过"单独归类为 flaky，可直接用于统计（[Retries](https://playwright.dev/docs/test-retries)）。

**边界**：20 次是起步阈值不是定理——秒级单测可以跑 100 次，十分钟的 e2e 只在 nightly 跑一轮，再按测试名聚合历史通过率补足样本。存量 flaky 很多的仓库先冻结增量（新测试不许进隔离区）再逐条清，不要停下功能开发做一次性大扫除。

**反模式**：把 flaky 测试直接删掉。它覆盖的行为随之失去保护，而且没有任何记录说明它曾经存在。

## 9.5 Feature Map：唯一值得写进 skill 的知识

**场景**：agent 要验证一个 UI 行为，但不知道功能入口在哪、用哪个选择器、什么算通过。

**做法**：

1. 每个关键功能只写四行，放进对应的 skill 或 AGENTS.md：

   ```markdown
   ## 消息列表
   路径：登录 → 侧栏「消息」→ `/inbox`
   选择器：`[data-testid="inbox-list"]`，行 `[data-testid="inbox-row"]`
   夹具：`make seed SCENARIO=inbox-unread-3`
   判定通过：列表出现 3 条未读，控制台无 error，请求命中 `/api/inbox?unread=1`
   ```

2. 机械保护：写进 Feature Map 的每个 `data-testid` 必须被至少一条冒烟测试引用。用一条测试遍历 Feature Map 断言选择器存在，文档一漂移就红：

   ```ts
   for (const id of featureMapTestIds()) {
       await expect(page.getByTestId(id)).toBeAttached();
   }
   ```

3. 定位统一走测试专用属性，不用 CSS 类名或界面文案——前者会被重构改掉，后者会被文案改掉，两者都不会让测试红，只会让 agent 的坐标失效。

**依据**：Playwright 官方称按 test id 定位是"最有韧性的测试方式"，`getByTestId()` 默认读 `data-testid`，属性名可用 `testIdAttribute` 配置（[Locators](https://playwright.dev/docs/locators)）。

**边界**：Feature Map 只写"入口 + 选择器 + 夹具 + 判定通过"这四行，写成功能说明书就没人维护了。没有冒烟测试覆盖的条目立刻删——一个失效的坐标比没有坐标更贵，agent 会拿它当事实反复尝试。

**反模式**：在 skill 里粘贴整页 UI 描述，且没有任何测试引用其中的选择器。半年后它变成一份自信的幻觉地图。

## 9.6 只在四个条件同时成立时才敢"不逐行读代码"

**场景**：验证基建齐了，团队开始讨论"人只审证据"甚至自动合入。

**做法**：

1. PR 模板做成三段，缺失即 CI 失败（用 body 检查脚本或 label 门）：

   ```markdown
   ## 复现命令
   <!-- 可原样粘贴，验证者不需要额外上下文 -->

   ## 证据
   <!-- 前后对比截图或 trace 链接，CI artifact 链接亦可 -->

   ## 影响面
   <!-- 涉及模块 / 是否带 flag / 回滚方式 -->
   ```

2. 只在这四条同时成立时，把"逐行读代码"降级成"审证据"：PR 小、改动带 feature flag、revert 路径是秒级、线上有真实可观测性。缺任意一条就回到逐行审。
3. 自动合入的门槛更高：它把合并决策整体交给检查结果，前置是 9.4 的验收标准已经达成。

**依据**：GitHub 官方 auto-merge 的语义是"所有必需评审与状态检查通过后自动合并"——合并决策整体委托给检查结果，因此检查的可信度就是合并的可信度（[Automatically merging a pull request](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/automatically-merging-a-pull-request)）；而检查一旦不可信，pytest 官方对 flaky 的判断是开发者会转而忽略真实失败（[Flaky tests](https://docs.pytest.org/en/stable/explanation/flaky.html)）。

**边界**：证据是 review 的输入，不是替代。缺了上面四条中的任何一条，"只看证据"等于看 agent 自己拍的照片——它选了拍什么，也选了不拍什么。安全相关改动、数据迁移、权限边界一律逐行读，无论证据多漂亮（见 08 章）。

**反模式**：先上自动合入，再说"回头把 flaky 清一清"。顺序反了：验证不可信时，自动化只是把错误合并得更快。
