# 05 · 验证矩阵

## 用例

| # | 输入 / 场景 | 期望 |
|---|---|---|
| 1 | 第 1 行漏逗号：const a = ["x" "y"]; | 出现 run_code.ts:1 与 ^^^ |
| 2 | 第 N 行漏逗号（N>1） | 出现 run_code.ts:N（不是 N+1） |
| 3 | 运行时异常：throw new Error("boom") | 错误文本与未装插件时逐字一致 |
| 4 | 正常程序：return 1 | 结果不变 |
| 5 | 其它工具失败（如 pwsh 非零退出） | 不变 |
| 6 | 错误文本已带位置（上游已修复） | no-op，不重复追加 |
| 7 | error.stack 缺失 | 回退原 message |
| 8 | 超长程序（数百行） | 只取错误附近，最多 maxFrameLines 行 |
| 9 | 含中文 / 反斜杠的源码 | 代码框原样显示，不破坏 |
| 10 | 插件内部抛错 | 返回原 result，不改变失败原因 |
| 11 | 卸载插件 | 行为完全恢复 |
| 12 | DSH 升级后 | 插件仍在，用例 1 继续通过 |

## 执行方式

- 在 DSH NEXT 的 run_code 里逐条提交用例 1-5、6、7、8、9；
- 用例 10 用注入故障的方式（临时让 extractFrame 抛错）验证回退；
- 用例 11 通过 plugin_manager 卸载后重跑用例 1；
- 用例 12 记录升级前后的 DSH 版本与 PTC runtime 版本。

## 记录要求

每个用例记录：

- DSH 版本、PTC runtime 版本、profile；
- 工具返回的完整错误文本（逐字）；
- 若涉及 token，记录字符数与粗略 token 估算。

## 回归基线

未装插件时，用例 1 的返回应为且仅为：

    Error: code run failed (exception): Expected ',', got 'string literal'

装插件后，用例 1 应在该行之后追加位置与代码框；其余用例必须与基线逐字一致。
