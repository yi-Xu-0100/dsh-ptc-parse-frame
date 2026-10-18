# 01 · 背景与根因

## 最小复现

DSH NEXT 2.0.19-next，在 run_code 里写：

    const a = ["x" "y"];
    return a.length;

得到：

    Error: code run failed (exception): Expected ',', got 'string literal'

没有任何行号或代码框。

## 调用链

1. run_code 的程序是一个 async 函数体；
2. dsh-ptc-runtime-node 在启动子进程之前，先调用 Node 的 stripTypeScriptTypes 解析整段程序；
3. 解析抛出的 SyntaxError 带 .stack，里面是 SWC 风格的代码框：

    :2
    async function __dsh_program__() {
    const a = ["x" "y"];
                   ^^^
    ...

4. 失败出口只取 error.message：

    function messageOf(error) {
        return error instanceof Error ? error.message : String(error);
    }

5. 上层把它拼成 code run failed (exception): <message>。

所以问题不在 TypeScript 类型检查，也不在引号转义，而是**诊断信息在失败出口被截断**。
消息里的 "string literal" 只是报错点那个 token 的类型名。

## 为什么反复出现

- 程序逐 token 生成，长串同构字符串列表（queries、file_sources、command、路径）最容易漏逗号；
- run_code 没有编辑器/linter 的即时反馈，整段一次性解析，第一个语法错就整体失败；
- 没有行号时，模型不知道是哪一个列表漏了，只能整段重吐再试。

## Token 账（ASCII 粗略估算，约 3.8 字符/token）

| 形态 | 体积 | 约 token |
|---|---|---|
| 现状：只有 message | 34 字符 | 9 |
| 只给位置 run_code.ts:32 | 14 字符 | 4 |
| 代码框（到第一个空行） | 140 字符 | 37 |
| 原始 error.stack 全文 | 989 字符 | 261 |

结论：**只透传有界代码框**（约 37 token），不要整段 stack（约 261 token，多出来的是
at parseTypeScript / at runNodeMain 这类无用调用帧）。
