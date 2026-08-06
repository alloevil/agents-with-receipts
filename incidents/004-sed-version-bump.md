# 004 — sed 全局替换版本号，误伤 lockfile 里的同版本无关依赖

- 日期：2026-08
- 适用范围：任何 agent 工具；一切"批量文本替换"操作
- 证据：[alloevil/weibo-chat-auto@fc76e6e](https://github.com/alloevil/weibo-chat-auto/commit/fc76e6e)（最终正确的 bump 提交；误伤在推送前的 diff 审计中截获并 amend 修正）

## 症状

版本发布例行操作：把 4 个文件里的 `1.11.0` 批量替换成 `1.12.0`。提交统计显示 **+5 −5**——预期是 +4 −4。多出来的一行是：

```diff
 [[package]]
 name = "tinyvec"
-version = "1.11.0"
+version = "1.12.0"
```

Rust lockfile 里一个无关依赖 `tinyvec` 恰好也是 1.11.0，被 `sed 's/^version = "1.11.0"/.../'` 一起改了。校验和与版本号从此不匹配——如果推送出去，下一次 `cargo build` 直接损坏。

## 根因

替换锚点是"整行 `version = "1.11.0"`"，看似精确，实际在 4600 行、几百个 `[[package]]` 块的 lockfile 里毫无区分度。巧合条件（无关包同版本号）平时不满足，满足的那天就是事故日。

**捕获它的不是运气，是一个廉价习惯**：每次提交后看一眼 `git show --stat`，行数和预期对不上就立刻追查。

## 修复

恢复 `tinyvec` 版本，`--amend` 修正提交；之后的版本 bump 改为定位到 lockfile 中**具体包条目**（按 `name = "..."` 锚定）再改它的 version 行。

## 沉淀

- `AGENTS.md` 发布流程一条：「sed 批量替换 Cargo.lock 会误伤同版本号的其它 crate，改指定条目」
- 操作纪律一条：批量替换后 `git diff --stat` 的行数必须与预期逐文件核对

## 通用教训

批量文本替换的风险与锚点宽度成正比、与文件规模成正比。lockfile / 生成物 / 数据文件里做替换，要么用结构感知工具（按包名/键路径定位），要么替换后**用行数对账**。agent 特别容易犯这个错——它对"顺手 sed 一把"毫无心理负担，必须用规则和 diff 审计兜住。
