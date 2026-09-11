# 05 — 权限与沙箱

> 适用工具：Claude Code · Codex · Cursor · Copilot CLI · 验证于 2026-09

Agent 能执行 shell 命令，就意味着它能做你的账户能做的一切：装包、删文件、推代码、发网络请求。本章解决的问题是：如何用各工具自带的权限档位、allowlist 和 OS 级沙箱，把 agent 的行动半径限制在任务需要的最小范围内。核心原则只有一条：授权跟着隔离走——隔离越弱，授权越窄。

## 5.1 按渐进放权阶梯提升自主度

**场景**：新项目或新工具上手时不知道该给 agent 多大权限；一步到位开全自动会在真机上冒不必要的险。

**做法**：按「只读 → 自动编辑 → 全自动」三档逐级放开，全自动档只在容器/VM 等隔离环境使用。四个工具的档位与切换方式：

1. **Claude Code**：`default`（只读免批）→ `acceptEdits`（自动接受文件编辑）→ `auto`（分类器兜底的全自动）→ `bypassPermissions`（跳过所有检查，官方标注 "Isolated containers and VMs only"）。会话内 `Shift+Tab` 循环切换，启动时用 flag：

   ```bash
   claude --permission-mode acceptEdits
   ```

2. **Codex**：两个正交旋钮——`--sandbox`（`read-only` / `workspace-write` / `danger-full-access`）控制边界，`approval_policy`（`untrusted` / `on-request` / `never`）控制何时停下来问。官方推荐的低风险本地自动化组合：

   ```bash
   codex --sandbox workspace-write --ask-for-approval on-request
   ```

   全自动 = `danger-full-access` + `never`，两者同时开才是真正的 full access。

3. **Cursor**：**Settings > Agents > Approvals & Execution** 里三档 Run Modes——`Auto-review`（allowlist 直跑 + 沙箱 + 分类器审查）→ `Allowlist`（只有 allowlist 内动作免批）→ `Run Everything`（零提示，官方描述为 "You accept the risk"）。

4. **Copilot CLI**：默认逐条提示 → `--allow-tool` 按工具/子命令放行 → `--allow-all-tools`（或 `--allow-all` / `--yolo`）全放。全放档官方 CAUTION 原文要求 "only use these options in an isolated environment"：

   ```bash
   copilot --allow-tool='shell(git:*)' --deny-tool='shell(git push)'
   ```

**依据**：Claude 官方将 `bypassPermissions` 的适用场景明确限定为隔离容器与 VM（[Permission modes](https://code.claude.com/docs/en/permission-modes)）；Codex 官方定义 full access 为 `danger-full-access` + `never` 的组合并给出 `workspace-write` + `on-request` 作为低风险预设（[Sandbox](https://developers.openai.com/codex/concepts/sandboxing)）；Cursor Run Modes 三档见 [Run Modes](https://cursor.com/docs/agent/security/run-modes.md)；Copilot 的 `--allow-all` 隔离环境警告见 [Allowing tools](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)。

**边界**：不要把档位当成一次性设置后不再回头的配置。接触生产凭据、处理不可信输入（如网页内容、第三方 issue）的会话应降回低档，即使你平时用高档工作。

**反模式**：用 shell alias 把 `--yolo` / `--dangerously-skip-permissions` 固化成默认启动参数——Copilot 文档明确点名禁止这种用法。

## 5.2 写窄授权，不写宽授权

**场景**：某条命令反复被提示批准，想一次放行；直觉是允许整个工具（`Bash`、`shell`），但这等于放弃了权限系统。

**做法**：按「命令前缀 + deny 兜底」写规则，只放行任务需要的动词：

1. Claude Code 在 `.claude/settings.json` 中写 allow/deny 规则，deny 永远先于 allow 求值：

   ```json
   {
     "permissions": {
       "allow": [
         "Bash(npm run *)",
         "Bash(git commit *)"
       ],
       "deny": [
         "Bash(git push *)",
         "Read(./.env)"
       ]
     }
   }
   ```

   注意通配符的词边界：`Bash(ls *)` 匹配 `ls -la` 但不匹配 `lsof`；`Bash(ls*)` 两者都匹配。

2. Copilot CLI 用同样思路组合两层控制——先用 `--available-tools` 缩小模型可见的工具集，再用 allow/deny 精调（官方给出的受限会话示例）：

   ```bash
   copilot --available-tools='bash,edit,view,grep,glob' \
     --allow-tool='shell(git:*)' --deny-tool='shell(git push)'
   ```

3. Codex 用 permission profile 把文件系统和网络写成命名策略，workspace 可写但 `.env` 一律 deny：

   ```toml
   default_permissions = "project-edit"

   [permissions.project-edit]
   extends = ":workspace"

   [permissions.project-edit.filesystem.":workspace_roots"]
   "**/*.env" = "deny"
   ```

**依据**：Claude 的规则求值顺序为 deny → ask → allow，宽 deny 无法被窄 allow 打洞（[Configure permissions](https://code.claude.com/docs/en/permissions)）；Copilot 的 deny 规则优先于 allow、甚至优先于 `--allow-all`（[Allowing tools](https://docs.github.com/en/copilot/how-tos/copilot-cli/use-copilot-cli/allowing-tools)）；Codex profile 中更具体的 deny 覆盖更宽的 write（[Permissions](https://developers.openai.com/codex/permissions)）。

**边界**：不要用 Bash 前缀规则约束命令参数（如 `Bash(curl http://github.com/ *)` 试图限制 curl 的目标域）。Claude 官方明确指出这类模式对选项顺序、协议变体、重定向和变量展开都是脆弱的——URL 过滤应改用 `WebFetch(domain:…)` 加上对 `curl`/`wget` 的 deny。

**反模式**：给环境运行器写前缀规则，如 `Bash(devbox run *)`——它匹配 `devbox run rm -rf .`，因为 runner 会把后面的参数当命令执行。

## 5.3 网络默认禁，按域名点名放行

**场景**：agent 需要 `npm install` 或拉取文档，但一条被注入的指令同样能用这条网络通道执行 `curl | bash` 或外传源码与凭据。

**做法**：

1. 保持各工具的沙箱网络默认值——三家的默认都是拒绝：Claude 沙箱首次访问新域名时提示批准；Cursor 沙箱网络 "Blocked by default"；Codex permission profile 的 `network.enabled` 默认 `false`，且没有 allow 条目时所有域名请求被拦。
2. 放行时写域名 allowlist 而不是全开。Claude 的写法：

   ```json
   {
     "sandbox": {
       "enabled": true,
       "network": {
         "allowedDomains": ["github.com", "*.npmjs.org"]
       }
     }
   }
   ```

3. Codex 在 profile 里同样按域名点名，deny 覆盖 allow：

   ```toml
   [permissions.project-edit.network]
   enabled = true

   [permissions.project-edit.network.domains]
   "*.github.com" = "allow"
   "registry.npmjs.org" = "allow"
   "tracking.example.com" = "deny"
   ```

4. Cursor 在 `sandbox.json` 里维护 allowlist，并在网络模式里选 **sandbox.json Only**（不叠加内置默认域名）或 **sandbox.json + Defaults**（叠加包管理器等常用域）。Copilot 本地沙箱可对公网访问与局域网访问独立开关——Linux 上例外：bubblewrap 无法把局域网访问与出网访问分开控制，该设置在那里不单独生效。

**依据**：Claude 沙箱网络隔离与 `allowedDomains` 见 [Sandboxing](https://code.claude.com/docs/en/sandboxing)；Codex 的 `network.enabled` 默认值与「无 allow 即全拒」语义见 [Permissions](https://developers.openai.com/codex/permissions)；Cursor 网络默认拒绝与三种网络模式见 [Run Modes](https://cursor.com/docs/agent/security/run-modes.md)；Copilot 网络维度配置见 [About cloud and local sandboxes](https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes)。

**边界**：放行了包管理器域名不等于消除了供应链风险——`npm install` 的 lifecycle hook 仍在你放行的边界内执行任意代码。真正需要装未知依赖时，把整个会话放进容器（见 5.4），而不是继续加宽域名表。

## 5.4 CI 里的全自动必须配隔离与最小 token

**场景**：CI/定时任务里没有人守着批准提示，只能开全自动档；但 CI runner 上往往同时躺着仓库写权限和各种 secret。

**做法**：

1. 全自动档只跑在一次性容器/VM/云沙箱里。Codex 官方对 `danger-full-access` 的限定是 "only in a controlled environment (for example, an isolated CI runner or container)"；Claude 对 `bypassPermissions` 的限定同样是容器与 VM。Copilot 提供托管的一次性 Linux 环境：

   ```bash
   copilot --cloud --experimental
   ```

2. 非交互调用显式声明档位，不继承本地配置。Codex：`codex exec --sandbox workspace-write "<task>"`（默认即 read-only 沙箱）；Claude：`claude -p "<task>" --permission-mode dontAsk`（未预批准的工具一律拒绝，官方定位 "Locked-down CI and scripts"）；Cursor：`agent -p --force "<task>"`。
3. 给 agent 的 job 只发最小 token。Codex 官方 GitHub Actions 示例把跑 agent 的 job 限定为 `permissions: contents: read`，agent 产出 patch artifact，由另一个不持有 API key 的 job 负责开 PR：

   ```yaml
   jobs:
     generate_fix:
       permissions:
         contents: read   # agent job 无仓库写权限
   ```

4. 不要把 `OPENAI_API_KEY` / `CODEX_API_KEY` 设成 job 级环境变量——同 job 内 checkout 出来的构建脚本、测试和依赖 hook 都读得到它。只在单条 `codex exec` 调用上内联传入。

**依据**：`codex exec` 的默认 read-only 沙箱、`danger-full-access` 隔离限定、job 级 API key 警告与 `contents: read` 工作流示例均来自 [Non-interactive mode](https://developers.openai.com/codex/noninteractive)；Claude `dontAsk`/`bypassPermissions` 的定位见 [Permission modes](https://code.claude.com/docs/en/permission-modes)；Cursor `-p --force` 见 [Headless CLI](https://cursor.com/docs/cli/headless.md)。

**边界**：隔离环境不豁免数据出口控制。容器里跑 `--dangerously-skip-permissions` 保护的是你的机器，不保护挂载进容器的 secret 和源码——网络 allowlist（5.3）在 CI 里同样要收紧。

## 5.5 把 OS 级沙箱当底线，不当保险箱

**场景**：开了沙箱之后想直接跳到全自动档，理由是「反正有 OS 隔离兜底」。

**做法**：

1. 了解你所用工具的沙箱实现和它自己声明的覆盖面，再决定授权档位：
   - **Claude Code**：macOS 用系统内置 Seatbelt；Linux/WSL2 用 `bubblewrap` + `socat`（可选 seccomp filter 阻断 Unix socket）；不支持原生 Windows。
   - **Codex**：macOS Seatbelt；Linux/WSL2 bubblewrap；原生 Windows 用 Windows sandbox。
   - **Cursor**：macOS 经 `sandbox-exec` 用 Seatbelt；Linux 用 Landlock（需内核 6.2+ 且 Landlock v3）+ seccomp，不满足时回退到逐条批准。
   - **Copilot CLI**：经 MXC 抽象层，macOS Seatbelt、Linux bubblewrap、Windows ProcessContainer；实验特性，默认关闭，需 `/sandbox enable`。
2. 逐条核对官方自陈的缺口，据此保留人工批准点：
   - Copilot 官方自陈本地沙箱位于隔离谱系的轻量端——"it does not run your commands inside a separate virtual machine or container"；CLI 内置文件工具在 CLI 进程内运行，OS 沙箱看不到这些操作，只能 "on a best-effort basis" 自律遵守策略；Windows 后端无法拦截单个路径，官方因此直接要求不要在 Windows 上使用 deny 路径设置——CLI 无法强制它，带该设置的沙箱命令会以报错失败，而不是静默忽略。
   - Claude 默认在沙箱依赖缺失时**降级为不沙箱运行**，托管部署应设 `"sandbox": {"failIfUnavailable": true}` 改为硬失败；沙箱还有 `dangerouslyDisableSandbox` 逃生舱，可加 ask 规则强制每次逃逸都提示。
   - Cursor 官方声明 Auto-review 分类器 "is not a security boundary"，且需要完整系统访问的命令会绕过沙箱执行（绕过时要求你批准）。
3. 结论落到配置上：沙箱 + 窄授权（5.2/5.3）叠加使用；真正的不可信工作负载用容器/VM/云沙箱这一级隔离（5.4），OS 级沙箱只作为其内层。

**依据**：Claude 的 Seatbelt/bubblewrap 依赖与降级行为见 [Sandboxing](https://code.claude.com/docs/en/sandboxing)；Codex 各平台实现见 [Sandbox](https://developers.openai.com/codex/concepts/sandboxing)；Cursor 的 Seatbelt/Landlock 实现与分类器边界声明见 [Run Modes](https://cursor.com/docs/agent/security/run-modes.md)；Copilot 的 MXC 后端、轻量隔离自陈与 Windows 路径限制见 [About cloud and local sandboxes](https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes)。

**边界**：反过来也不要因为沙箱有缺口就弃用它。OS 级沙箱把「一条被注入的命令读走 `~/.ssh`」从默认可能变成需要额外突破的事件，这一层收益与上层授权档位无关，任何档位下都应保持开启。

**反模式**：在沙箱开启的前提下把 `filesystem.disabled` 或 "Allow All" 网络模式当成排障捷径——排障应加具体的 `allowWrite` 路径或域名条目，而不是整层关掉。

---

**位置**：轴一 · 读得懂 — 上一章 [04 验证闭环](04-verification.md) · 下一章 [06 上下文管理](06-context-management.md)

**相关**：[02 机制选型](02-mechanism-selection.md) · [08 安全与治理](08-security-governance.md)

**对应检查**：无 —— 档位由工具自身强制，不在仓库里（规矩停在提示层，见 [10 硬约束下沉](10-hard-constraints.md)）

