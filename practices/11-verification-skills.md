# 11 — 验证技能：让 agent 产出看得见的证据

> 适用工具：Claude Code · Codex · Cursor · Copilot · Playwright · Cypress · 验证于 2026-09

09 章把验证回路建在「跑一条命令、读退出码」上，但有一类工作的失败断言文本说不清：UI 改动挂掉时，「按钮被遮挡了 8 像素」「hover 态颜色不对」「提交后页面没转圈」——这些只有图和录屏能说清。断言输出说不清的失败，agent 只能猜着修，或者把你拉回来当人肉验证器。本章给出三件让 agent 自证 UI 工作的手段：失败时自动留下视觉证据、让 agent 驱动真实应用截图、把视觉证据接进 CI 与 PR 流程。本章与 verify-doctor 的 `ui-evidence` 检查（阶段 2）一一对应——实践变成可执行检查的位置就在那里。

## 11.1 浏览器测试默认保留失败证据（trace / 截图 / 录屏）

**场景**：仓库有 Playwright / Cypress 的 e2e 测试，agent 改完 UI 后测试红了，但 CI 只留下一行 `expect(locator).toBeVisible()` 的断言文本，看不出页面当时长什么样。

**做法**：

1. Playwright 在 config 的 `use` 里把三件套开到「失败才留」，失败现场（DOM 快照、控制台、网络、截图）随 trace 一起进 artifact：

   ```ts
   // playwright.config.ts
   export default defineConfig({
     use: {
       trace: 'retain-on-failure',      // 失败留完整追踪，可在 trace viewer 里逐帧回放
       screenshot: 'only-on-failure',   // 失败留截图
       video: 'retain-on-failure',      // 需要复盘动效时再开，成功用例不留
     },
   });
   ```

2. Cypress 的失败截图（`screenshotOnRunFailure`）**默认就是开的**——要复盘交互过程再加 `video: true`。注意别把默认的失败截图关掉：

   ```js
   // cypress.config.js
   module.exports = { e2e: { video: true } }; // 失败截图保持默认开启
   ```

3. CI 里用 `upload-artifact` + `if: always()` 把这些证据带出失败现场——失败时恰好拿不到证据的 artifact 等于没有（与 09 章 failure-artifacts 同一条要求）：

   ```yaml
   - uses: actions/upload-artifact@v4
     if: always()
     with:
       name: playwright-evidence
       path: playwright-report/   # trace + 截图 + 录屏的默认落盘处
   ```

4. 用 verify-doctor 核实配置是否真的开了，而不是靠记忆：

   ```bash
   node tools/verify-doctor/index.mjs .   # 阶段 2 的 ui-evidence 一项
   ```

**依据**：Playwright 官方把 trace 定位为「失败现场的完整记录，可在 viewer 中逐帧回放」，`trace` / `screenshot` / `video` 三个 test options 均支持按失败保留（[Trace viewer](https://playwright.dev/docs/trace-viewer) · [Test options](https://playwright.dev/docs/api/class-testoptions) · [Screenshots and videos](https://playwright.dev/docs/videos)）；Cypress 官方文档确认失败截图默认开启、录像默认关闭，可由 `screenshotOnRunFailure` / `video` 控制（[Screenshots and videos](https://docs.cypress.io/app/guides/screenshots-and-videos)）；失败时也要上传证据由 `if: always()` 机械保证（[actions/upload-artifact](https://github.com/actions/upload-artifact)）。

**边界**：trace 与录屏拖慢 CI 且占 artifact 空间，「失败才留」是收益/成本的平衡点，全量录制留给本地排查；截图只记录「当时长什么样」，不断言「应该长什么样」——像素级对比是另一套体系（视觉回归测试），门槛和 flaky 成本都更高，不在本节范围内。

**反模式**：为了让 CI「快一点」关掉 `screenshotOnRunFailure` 或不配 trace——省下的是几十秒，换来的是每个 UI 失败都要人打开浏览器复现一次。

## 11.2 让 agent 驱动真实应用截图，而不是读代码猜

**场景**：改完一个页面，agent 声称「布局正常」，依据是它读过相关组件代码——它根本没看见页面。

**做法**：

1. 给 agent 浏览器驱动能力。Playwright 官方提供 MCP server，把浏览器操作（导航、点击、截图）暴露成 agent 可调用的工具：

   ```json
   {
     "mcpServers": {
       "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] }
     }
   }
   ```

2. 指令里把「自证」写成显式步骤，要求截图作为交付物，而不是允许口头声称：

   ```text
   改完 [src/pages/Checkout.tsx] 后：起 dev server，用浏览器工具打开
   /checkout，截一张全页图和一张移动端宽度的图贴出来，然后对照
   [设计稿链接] 说明差异。没有截图不算完成。
   ```

3. Claude Code 官方最佳实践把「给 agent 可运行的闭环检查」列为工作核心，对 UI 类工作明确认可截图作为检查形式之一——断言、构建退出码、lint、截图是同一类东西：pass/fail 或可对照的证据，而不是「我觉得改好了」（[Claude Code 最佳实践](https://code.claude.com/docs/en/best-practices)）。

**依据**：Playwright MCP 由 Microsoft 官方维护，README 明确其定位是「为 agent 提供可访问的浏览器自动化，把 UI 证据作为上下文的一部分」（[microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp)）；闭环检查的合法形式清单见上条 Claude Code 官方文档。

**边界**：agent 贴出的截图仍需人眼对照设计稿——「截图」是把「看起来对不对」的判断从想象移到证据上，判断标准本身（设计稿、产品预期）目前仍由人给定。无头浏览器与真实用户环境存在字体、渲染差异，像素级结论不要当精确事实。

**反模式**：只要求 agent「检查一下 UI」而不给浏览器工具、不要求贴图——它会读代码然后给你一个自信的「应该没问题」，这正是验证回路要消灭的东西。

## 11.3 把视觉证据接进 PR 流程

**场景**：团队接受「PR 必须带证据」（09 章 evidence-template），但 UI 改动的 PR 证据只有测试日志，评审的人和 agent 都看不出界面变化。

**做法**：

1. PR 模板的证据小节明说接受哪几类视觉证据，让「贴图」成为流程的一部分而不是个人习惯：

   ```markdown
   ## 证据
   - 测试输出（命令 + 结果）
   - UI 改动：失败/改动现场的截图、录屏或 trace artifact 链接
   ```

2. 评审先看图再看代码：`if: always()` 上传的 artifact 在 PR 的 Actions 运行页可直接下载，评审者与 agent 都不用重跑本地环境。

3. 用 verify-doctor 钉住这条链：`ui-evidence` 检查识别 Playwright / Cypress 是否在失败时保留截图/录屏/trace，Selenium / Puppeteer 因为截图靠测试代码显式调用、没有配置级探针，如实报 `info`「不适用」而不是假装检查过（绿灯必须有信息量，见 10 章）。

**依据**：PR 模板强制证据小节的做法与 GitHub 官方模板机制一致（[创建 PR 模板](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)）；artifact 下载入口由 [actions/upload-artifact](https://github.com/actions/upload-artifact) 提供；`ui-evidence` 检查的探测口径与「不适用」语义见 [verify-doctor](https://github.com/alloevil/agents-with-receipts/blob/main/tools/verify-doctor/README.md)。

**边界**：视觉证据解决「发生了什么」，不解决「是否符合预期」——预期要靠设计稿或文字验收标准给出；要求所有 PR 都贴截图会让纯逻辑改动变噪音，只对触碰 UI 层的改动强制。

**反模式**：把截图贴进 PR 正文而不是用 artifact——图会占 Markdown 空间、在 diff 里变成二进制文件，几周后没人分得清哪张图对应哪个版本；artifact 随 CI 运行记录存档，链接永不过期。

---

**位置**：轴二 · 验得动 — 上一章 [10 硬约束下沉](10-hard-constraints.md) · 下一章 —（轴二到此结束，回到 [章节索引](README.md)）

**相关**：[04 验证闭环](04-verification.md) · [09 可验证的仓库](09-verifiable-repo.md)

**对应检查**：`verify-doctor` 的 `ui-evidence`

