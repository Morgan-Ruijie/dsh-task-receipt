# dsh-task-receipt

**实验性 / 预览版。** 一个小型、纯本地的 DeepSeek Harness 插件：为一个显式圈定的任务生成简短的 Markdown 执行收据。

[English](README.md) · [验收](docs/ACCEPTANCE.md) · [安全](SECURITY.md) · [贡献](CONTRIBUTING.md)

## 它是什么

任务开始前调用 `task_receipt`，任务中可取快照，结束时关闭：

```json
{ "action": "begin" }
{ "action": "render" }
{ "action": "end" }
```

收据列出观察到的工具调用、状态和证据依据：

- **成功**：工具完成；受支持的 shell 还要有完整前台结果和整数退出码 0；
- **失败**：工具错误，或非零的结构化进程退出码；
- **未知**：缺最终结果、后台/转后台、超时/取消、缺调用起点、形状不完整或沙箱拒绝。

文件证据严格分开：

| `write` / `edit` canonical 形状 | 收据结论 |
|---|---|
| `write` + `operation="create"` + `before=null` | 新建文件；**不**声称内容变化 |
| `write` + `operation="update"` + before/after 均为字符串 | 内容变化 / 未变 |
| `write` + `operation="update"` + `before=null` | **未知**：旧内容可能超限、二进制、非 UTF-8 或不可读 |
| operation 缺失/未知、path 或 after 缺失 | **未知** |
| 未观察到已确认变化 | 只是“未观察到”；Shell/apply_patch/子 Session 仍未知 |

收据**不是**测试实际运行、断言充分、业务正确或防篡改的证明。退出码 0 只代表进程正常结束；Agent 自述和输出中的 “passed” 不会被升级为证据。

## 安装

要求 **DeepSeek Harness 0.2.2-rc.1**、**Node.js >= 22.19**。其他 DSH 版本未测试；包内声明的 `engines.dsh` 为 `0.2.2-rc.1`。

预览版通过 GitHub Release 的 `.tgz` 分发，不发布 npm。下载 `dsh-task-receipt-0.1.2.tgz`，或使用本地构建的包。

### 已有 web profile

```sh
dsh plugin --profile web add /absolute/path/dsh-task-receipt-0.1.2.tgz
dsh --profile web --dump-config   # 应出现 task-receipt 节点
```

重启或重载 Web 应用后，在会话中调用 `task_receipt`。

### 一次性测试 profile

自定义 profile 必须先用官方 **Web** 模板初始化。直接对全新自定义 profile 安装插件只会得到 base-backed profile；在启动命令末尾加 `web` 不会切换模板。

```sh
export DSH_HOME=/absolute/path/to/disposable-dsh-home
export PNPM_HOME=/absolute/path/to/disposable-pnpm-home

dsh --version   # 必须精确为 0.2.2-rc.1
dsh --profile receipt-test --from-default-profile web --dump-config
dsh plugin --profile receipt-test add /absolute/path/dsh-task-receipt-0.1.2.tgz
dsh --profile receipt-test --host 127.0.0.1 --port 0 --no-open
```

`--from-default-profile` 会**替换**同名 profile。只在首次初始化时使用，安装插件后绝不能再执行。完整步骤见[隔离验收方案](docs/ISOLATED-PROFILE-PLAN.md)。

### 卸载

```sh
dsh plugin --profile web remove dsh-task-receipt
```

确认 `dsh.profile.bundles` 中不再有 `dsh-task-receipt`；0.2.2-rc.1 的插件管理器会自动移除。重启/重载后确认 `task_receipt` 消失。

## 使用

```text
先调用 task_receipt(action="begin")，再开始工作。
结束时调用 task_receipt(action="end")，展示原始 Markdown 收据。
```

`begin` 与 `end` 可跨多个 turn。一个 live Session 同时只有一个任务；第二次 `begin` 会被拒绝，不覆盖旧任务。`begin` 之前的工作不会回填。`render` 取快照，`end` 返回收据并释放状态。

工具通过 `ctx.tools.register` 注册；模型是否主动选择它由模型决定，插件不做保证。

## 证据与隐私

- 只保留允许清单工具名、固定标签、计数、事件 `seq`、整数退出码和任务内文件代号（F1、F2…）。
- 原始命令、参数、输出、错误详情、文件内容、绝对路径和 Session ID 不进入收据。
- 路径与 call id 只在内存中做哈希配对，哈希不输出。
- 插件不联网、不启动子进程、不写文件、无运行时依赖、无安装脚本。
- 返回的收据仍是正常的 DSH 工具结果，宿主的持久化、模型路由或遥测可能继续处理它；本插件不能把宿主原始会话变成匿名版本。
- 每个任务最多保留 500 次调用；超限明确报未知，不静默宣称完整。

完整边界见 [SECURITY.md](SECURITY.md)。

## 兼容性与验证

- 在 Windows、Node 26.3.1、DSH **0.2.2-rc.1**、Cordis 4.1.0 上验证。
- 单元测试：Node 26.3.1 下 **20/20**；独立复核者在 Node 22.16.0/Linux 也跑出 20/20。
- 真实 `dsh-tool-fs` + `dsh-fs-local` 覆盖 create、update-same、update-different、edit，以及超限 update 必须保持未知。
- 隔离 0.2.2-rc.1 profile 验收：安装、Web 冷启动（`127.0.0.1`，HTTP 200）、宿主内 `task_receipt` 注册与 `begin/end` 调用、卸载、重复安装/卸载均通过。
- **Agent 是否会自主选择该工具，尚未测试。**

详见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)、[docs/AUDIT-FIX.md](docs/AUDIT-FIX.md)、[docs/RESEARCH.md](docs/RESEARCH.md)。

## 开发

单元测试不需要安装依赖：

```sh
npm test                  # 默认多进程 Node 测试
npm run test:sandbox      # Windows DSH sandbox 用单进程
npm run test:host -- /path/to/unpacked-dsh-runtime
npm run test:real-fs -- /path/to/unpacked-dsh-runtime /tmp/receipt-fixture /tmp/receipt-out
```

`test:host` 用真实 Cordis/Session/native 工具管线组装插件；`test:real-fs` 挂载真实文件工具检查 canonical 证据。两者都不安装 profile、不调用模型。

## 状态

- **实验性 / 预览版**，版本 0.1.2。
- 核心插件逻辑（`src/`）与已验收的 v0.1.1 完全一致；0.1.2 只更新文档、打包与 CI。
- 无 UI、无网络、无签名/认证、无全工作树追踪、无跨子 Agent 汇总。
- 如果只需要查看会话过程，请优先使用 DSH Trajectory 或已有 session-audit 插件；本项目刻意保持更窄。

## 许可证

MIT，见 [LICENSE](LICENSE)。
