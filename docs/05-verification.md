# 05 · 验证矩阵

## 用例

| # | 输入 / 场景 | 期望 | 状态 |
|---|---|---|---|
| 1 | 第 1 行漏逗号：const a = ["x" "y"]; | 出现 run_code.ts:1 与 ^^^ | 单元 + 端到端已通过 |
| 2 | 第 N 行漏逗号（N>1） | 出现 run_code.ts:N（不是 N+1） | 单元 + 端到端已通过 |
| 3 | 运行时异常：throw new Error("boom") | 错误文本与未装插件时逐字一致 | 单元 + 端到端已通过 |
| 4 | 正常程序：return 1 | 结果不变 | 单元 + 端到端已通过 |
| 5 | 其它工具失败（如 pwsh 非零退出） | 不变 | 单元 + 端到端已通过 |
| 6 | 错误文本已带位置（上游已修复） | no-op，不重复追加 | 单元已覆盖 |
| 7 | error.stack 缺失 | 回退原 message | 单元已覆盖 |
| 8 | 超长程序（数百行） | 只取错误附近，最多 maxFrameLines 行 | 单元已覆盖 |
| 9 | 含中文 / 反斜杠的源码 | 代码框原样显示，不破坏 | 单元已覆盖 |
| 10 | 插件内部抛错 | 返回下游 decision，不改变失败原因 | 单元已覆盖 |
| 11 | 卸载插件 | 行为完全恢复 | 待做 |
| 12 | DSH 升级后 | 插件仍在，用例 1 继续通过 | 待做 |
| 13 | 真实错误带 `\nFile sandbox: ...` | 代码框插在 sandbox 行之前 | 单元 + 端到端已通过 |

## 执行方式

- 用例 1–6、7、8、9、13：`npm test`（`node test/plugin.test.mjs`）；
- 用例 10：测试里用带 throwing getter 的 exec 触发插件内部异常；
- 用例 11：通过 plugin_manager 卸载后重跑用例 1；
- 用例 12：记录升级前后的 DSH 版本与 PTC runtime 版本；
- 端到端用例 1–5、13：在带 run_code 的 PTC preset 会话里由 `run_code` 直接提交，
  记录见下方「2026-10-18 端到端记录（PTC 会话）」。

## 记录要求

每个用例记录：

- DSH 版本、PTC runtime 版本、profile；
- 工具返回的完整错误文本（逐字）；
- 若涉及 token，记录字符数与粗略 token 估算。

## 回归基线

未装插件时，用例 1 的返回应为（逐字）：

    Error: code run failed (exception): Expected ',', got 'string literal'
    File sandbox: workspace-write.

`File sandbox:` 行是否存在取决于运行时是否带 sandbox 状态；真实日志中解析失败
会带这一行。装插件后，用例 1 应在解析消息之后、`File sandbox:` 之前插入位置与
代码框；其余用例必须与基线逐字一致。

## 2026-10-18 单元测试记录

- 运行时：DSH NEXT 内置 Node 24.21.0
- DSH：2.0.19-next；PTC runtime：@deepseek-ai/dsh-ptc-runtime-node 0.2.1-rc.2
- 命令：`node test/plugin.test.mjs`
- 结果：23 pass / 0 fail
- 覆盖关键输出：

      Error: code run failed (exception): Expected ',', got 'string literal'
      run_code.ts:1
      const a = ["x" "y"];
                     ^^^
      File sandbox: workspace-write.

## 2026-10-18 安装与激活记录

- `plugin_manager install_bundle target: D:\Github\dsh-ptc-parse-frame`
  → `application: applied`，`warnings: []`；
- profile `package.json` 出现 `dsh-ptc-parse-frame: link:D:/Github/dsh-ptc-parse-frame`，
  `dsh.profile.bundles` 末尾加入 `dsh-ptc-parse-frame`；
- 修改 `index.js` 后，用 `set_bundle` 关闭再打开触发 profile recomposition；
- `plugin_manager list_plugins` 显示：

      { "entryId": "include:ptc-parse-frame", "moduleName": "dsh-ptc-parse-frame",
        "enabled": true, "fiberPhase": "active", "patchId": "ptc-parse-frame" }

  说明 bundle patch 已挂载、插件实例处于 active。

（端到端 run_code 用例已于同日补做并通过，见下方端到端记录。）

## 2026-10-18 端到端记录（PTC 会话）

- 版本同上节记录（DSH NEXT 2.0.19-next；PTC runtime
  `@deepseek-ai/dsh-ptc-runtime-node` 0.2.1-rc.2）；profile `desktop`；
  GUI `http://127.0.0.1:9397`；本会话自带 `run_code`。
- 插件在当前 Host 进程中已生效：提交后返回值即含行号与代码框。

**用例 1（第 1 行漏逗号）** — 提交：

```js
const a = ["x" "y"];
return a.length
```

实际返回（逐字）：

```text
Error: code run failed (exception): Expected ',', got 'string literal'
run_code.ts:1
const a = ["x" "y"];
               ^^^
return a.length
File sandbox: workspace-write.
```

**用例 2（第 3 行漏逗号，N>1）** — 提交：

```js
const data = [
  "alpha",
  "beta" "gamma",
]
return data.length
```

实际返回（逐字）：

```text
Error: code run failed (exception): Expected ',', got 'string literal'
run_code.ts:3
  "alpha",
  "beta" "gamma",
         ^^^^^^^
]
File sandbox: workspace-write.
```

位置是用户程序的第 3 行，不是加上包装后的第 4 行。

**用例 3（运行时异常）** — 提交 `throw new Error("boom-e2e")`，实际返回（逐字）：

```text
Error: code run failed (exception): Error: boom-e2e
    at eval (eval at runProgram (file:///C:/Program%20Files/DSH%20NEXT/resources/app.asar/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/process.js:1031:31), <anonymous>:5:7)
    at runProgram (file:///C:/Program%20Files/DSH%20NEXT/resources/app.asar/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/process.js:1031:172)
    at runNodeMain (file:///C:/Program%20Files/DSH%20NEXT/resources/app.asar/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/process.js:1121:9)
    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)
File sandbox: workspace-write; enforcement: partial.
```

没有 `run_code.ts:` 与代码框；运行时自己的后缀（本例是
`enforcement: partial`）原样保留。能正常解析的程序不会被改写。

**用例 4 / 5（正常程序、其它工具失败）** — 同一程序先调用
`tools.pwsh({ command: "exit 3" })`，再 `return "success-path-untouched"`：

```text
pwsh result: {"exitCode":3,"stdout":"","stderr":""}
success-path-untouched
```

内嵌 `pwsh` 的失败结果原样保留，成功的 `run_code` 返回值也逐字未变。

**用例 13（sandbox 后缀位置）** — 用例 1、2 中代码框都插在解析消息之后、
`File sandbox:` 之前，与预期一致。

**与仓库源码的一致性** — 用仓库当前 `index.js` 的 `decorate()` 对同一份
`code` + `message` 重放，输出与线上返回逐字节相等（比对结果
`MATCH_OBSERVED=true`），说明运行中的 Host 加载的行为与仓库源码一致。

**体积** — 用例 2：原消息 101 字符 → 163 字符，新增 62 字符（行号 + 代码框），
粗估 20–30 token。

**结论** — 用例 1–5、13 端到端通过；用例 11（卸载恢复）与 12（DSH 升级后）
仍待做。
