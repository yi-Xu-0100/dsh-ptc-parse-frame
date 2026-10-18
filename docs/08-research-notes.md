# 08 · 复现与源码取证

## 环境

- Windows，DSH NEXT 2.0.19-next
- profile：desktop（C:\Users\<user>\.dsh\profiles\desktop）
- PTC runtime：@deepseek-ai/dsh-ptc-runtime-node 0.2.1-rc.2
- 运行时 Node：24.21.0（resources/runtime/x64/primary-runtime/runtime.json）

## 复现

在 run_code 里提交：

    const a = ["x" "y"];
    return a.length;

得到（逐字）：

    Error: code run failed (exception): Expected ',', got 'string literal'

## Phase 0 · API 确认（2026-10-18）

用 `cordis_inspect_query` 与安装包源码核对，结果如下：

| 项 | 实际值 | 来源 |
|---|---|---|
| Event | `tools/post-execute`，waterfall | Host Event catalog |
| 签名 | `(this: Scoped<ToolRuntime>, exec: ToolExecution, result: Readonly<ToolExecutionResult>, next: () => Promise<PostToolDecision>)` | 同上 |
| decision | `{ kind: 'accept', content?: ContentBlock[] }` 替换结果文本；不能同时带 `value` | dsh-tools `postExecute` |
| 工具名 | `run_code`（`RUN_CODE_NAME`） | dsh-tools `lib/types/ptc.js` |
| 参数 | `exec.arguments.code` 是原始程序；另有 `description` | 同上 |
| 失败消息 | `code run failed (${kind}): ${message}${logsText}${sandboxText}...` | `ptc.js` 626–629 |
| 解析失败 kind | `exception`；message 是 `stripTypeScriptTypes` 的 message | ptc-runtime `lib/index.js` 1354–1359、1591、1816–1820 |

> 原设计文档假设 listener 是 `(exec, next)`，与运行时不符；实现按
> `(exec, result, next)` 编写。

### 真实错误文本（日志证据）

`~/.dsh/logs/desktop-next.log`，2026-10-18T02:27:07Z：

    code run failed (exception): Expected ',', got 'string literal'
    File sandbox: workspace-write.

说明 `sandboxText` 在未拒绝操作时也会追加；插件必须把代码框插在它之前，
不能假设 parser message 是整条 error.message。

## app.asar 结构（实测）

- 文件大小：180,923,876 字节
- 头 4 字节：uint32 = 4
- uint32@4 = 5,302,180
- uint32@8 = 5,302,176
- uint32@12 = 5,302,170（JSON 长度）
- JSON 起始：偏移 16，长度 5,302,170
- 数据区起始：偏移 5,302,188（16 + JSON 长度后按 4 字节对齐）

目标文件条目：

    /node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/index.js
    size=71557  offset=78483619  unpacked=false

## 关键行号（NEXT，lib/index.js）

| 行 | 内容 |
|---|---|
| 936 | const messageOf$1 = (error) => ... error.message ... |
| 1345 | async run(spec)（retained 路径） |
| 1354 | code = stripTypeScriptTypes(spec.program)（未包装） |
| 1356-1359 | catch → message: messageOf$1(error) |
| 1401 | function messageOf(error)（per-call 路径） |
| 1482 | async run(spec)（per-call 路径） |
| 1591 | stripTypeScriptTypes(STRIP_PREFIX + spec.program + STRIP_SUFFIX) |
| 1816-1820 | catch → message: messageOf(error) |

## 旧版 DSH Desktop（2.0.17，PTC 0.2.0-rc.2）

- 路径：resources/app/node_modules/@deepseek-ai/dsh-ptc-runtime-node/lib/index.js
- messageOf：757
- 解析 catch：1174
- 旧文件补丁在 D:\Github\DSHWorkspace\_tools\dsh-ptc-parse-frame\（仓库外，legacy）

## 上游未修复的证据（2026-10）

- npm dist-tags：latest=0.1.6-alpha.1，next=0.2.0-rc.2，alpha=0.2.1-alpha.2
- 0.2.1-alpha.2：messageOf 仍只取 error.message；解析 catch 仍 messageOf(error)
- GitHub master（2026-10-09）：
  - packages/ptc-runtime/ptc-runtime-node/src/index.ts:51 messageOf
  - :355 解析 catch messageOf(error)
  - packages/core/tools/src/ptc.ts:726 code run failed 只拼 error.message

## 重新提取 asar 的方法

1. 用普通 Node（非 Electron）读取 app.asar；
2. 读 uint32@12 作为 JSON 长度，从偏移 16 读 JSON；
3. 在 JSON 的 files 树里找目标条目（offset 是字符串，需 Number()）；
4. 数据区起始 = align4(16 + JSON 长度)；
5. 读取 offset + size 即得文件内容。

注意：在 DSH 的 PTC 子进程里 fs 被 Electron 的 asar 层接管，
直接 fs.openSync(app.asar) 会报 ENOENT；必须用系统 Node 或 original-fs。
