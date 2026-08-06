# 005 — 构建脚本"缺失才编译"，桌面应用长期运行旧代码

- 日期：2026-08
- 适用范围：任何 agent 工具；一切有缓存型构建产物的项目（sidecar、二进制、生成代码、Docker 层）
- 证据：[run-desktop.sh 的条件编译](https://github.com/alloevil/weibo-chat-auto/blob/main/run-desktop.sh)、沉淀的条件规则 [alloevil/weibo-chat-auto@51d0940](https://github.com/alloevil/weibo-chat-auto/commit/51d0940)

## 症状

服务端代码修完 bug、测试全绿、提交推送——但桌面应用行为纹丝不动。排查发现它跑的是**四天前编译的 sidecar 二进制**，期间的所有修复对桌面用户从未生效。同机还发现一个更早的孤儿 sidecar 进程，监听所有网卡跑着带安全漏洞的旧代码。

## 根因

桌面应用把 web 服务编译成 sidecar 二进制打包。启动脚本的编译条件是：

```bash
if [ ! -f "$SIDECAR" ]; then   # 只在二进制缺失时编译
    node sidecar/build.mjs
fi
```

「缺失才编译」对首次安装是对的，对日常开发是错的：源码改一百次，二进制永远是第一次的。没有任何机制提示"你改的代码在这个产物里不存在"。

## 修复

改源码后手动 `node sidecar/build.mjs` 重建。真正的修复是让这件事**不可能被忘掉**（见沉淀）。

## 沉淀

这条教训的沉淀方式值得单独说：写成了 agent 的**条件触发规则**（omp 的 TTSR / Cursor 的 glob rule 同理）——

```yaml
# .omp/rules/sidecar-rebuild.md
---
description: 改动 viewer-server.js 或 lib/ 后的 sidecar 重建与验证流程
condition: ["viewer-server.js", "lib/*.js"]
---
你正在改 viewer-server.js 或 lib/ —— 这些代码会被打进桌面应用的 sidecar：
1. 改完并通过 lint/test 后运行 node sidecar/build.mjs 重建
2. run-desktop.sh 只在二进制缺失时才编译，不重建则桌面 App 一直跑旧代码
```

agent 一编辑相关文件，规则自动注入。比写进 README 强一个数量级：README 靠人记得去读，条件规则在**动作发生的瞬间**出现。

## 通用教训

缓存型构建的失效条件是项目里最容易失传的知识。写文档不够——把"改了 X 必须重建 Y"做成 agent 的条件规则（按文件路径触发），或者干脆做成 CI 检查（比较源码与产物的 mtime/hash）。另外：长驻进程 + 旧产物 = 安全修复永不生效，排查任何"修了没效果"先查**正在运行的到底是哪个构建**。
