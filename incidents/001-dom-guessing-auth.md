# 001 — 猜 DOM 判断登录态，带失效凭据静默空跑 3 天

- 日期：2026-07
- 适用范围：任何 agent 工具（教训在于契约选择，不在于某家工具）
- 证据：[alloevil/weibo-chat-auto@faec611](https://github.com/alloevil/weibo-chat-auto/commit/faec611)

## 症状

微博群聊归档器由定时任务驱动，连续 3 天"成功"运行：日志正常、退出码 0、归档 0 条消息。没有任何告警。用户数天后翻页面才发现数据断档。

## 根因

登录态检测靠猜 DOM，三处实现三种猜法，全部错误：

1. `waitForLogin` 用 `querySelector('#app')` 判"已登录"——但登录页**同样有** `#app`。Cookie 过期后 3 秒即误报"检测到已登录"，归档器带着失效 Cookie 跑完全程。
2. `save-cookies` 的 `alreadyLoggedIn` 写成 `innerText.substring(0, 200)` 再判 `length > 200`——**恒为 false**，已登录也会进入等扫码分支。
3. 等待条件 `text.length > 500` 是对页面渲染的猜测，渲染慢就白等满 10 分钟超时。

深层原因：带失效 Cookie 打开该站点时，URL、标题、`#app`、`[class*=chat]` 与登录态**完全一致**。UI 表象根本不构成可判定的信号。

## 修复

改用协议级信号：该站 API 未鉴权时返回 `error_code: 21301`，其它业务错误码（如"群不存在"）反而证明鉴权已通过。抽成唯一实现 `lib/weibo-auth.js`，三处调用方全部切换；DOM 启发式只降级为探测请求本身失败时的兜底。

同一提交里配套：失效时打印明确指引并以**退出码 1** 收场——调度器从此看得见失败。

## 沉淀

- 项目 `AGENTS.md` 硬契约一条：「登录判据只认接口 `error_code`，绝不猜 DOM/URL/标题」
- 粘性规则（`.omp/RULES.md`）一条：「任何失败路径必须以非零退出码收场」
- 单测锁死判据语义：21301 → 未鉴权；其它业务码 → 已鉴权；探测失败 → null 交调用方（[141bf53](https://github.com/alloevil/weibo-chat-auto/commit/141bf53)）

## 通用教训

对外部服务的状态判断，只认协议级信号（状态码、错误码、schema 字段）。UI 表象不是契约——它既会随改版漂移，也可能在关键状态之间**根本无差异**。agent 写的"看起来能跑"的 DOM 判断，是这类静默失败的高发源。
