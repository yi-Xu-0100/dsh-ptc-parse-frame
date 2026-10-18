# 可直接粘贴到 #7618 的评论

> 说明：本文件保留完整的 Markdown 原文，复制到 GitHub 即可。
> 下方用 ⟨BT⟩ 代替反引号只是本仓库的书写占位，发布时请替换为真正的反引号；
> 或者直接使用仓库内的渲染版本。

## 补充：同一出口还丢了一样东西——位置（可作为第三条最小改动）

先说结论：我这条**不是转义问题**，而是解析失败时**位置被丢掉了**。想把它作为 #7618 建议 2 之后的一个互补改动提出来。

### 我这边的场景

PTC（Code Mode）下用 run_code 写脚本时，程序里大量是"一串字符串"：queries: [...]、file_sources: [...]、pwsh 的 command 数组、批量路径列表、对象里的字符串键值。每隔几轮就会撞一次：

    code run failed (exception): Expected ',', got 'string literal'

一次翻车要重试 1~3 轮，而每轮都得把整个程序重新输出一遍——和 #7618 说的"实打实的 token 和轮次浪费"是同一笔账。

### 直接原因：漏了一个逗号（跟转义无关）

解析器处在"该有逗号"的位置（数组元素 / 函数实参 / 对象属性），下一个 token 是双引号字符串，于是报 Expected ',', got 'string literal。

最关键的一点：**string literal 只是报错点那个 token 的类型名，不代表字符串里的转义有问题。** 这也是为什么 #7618/#3925 那条"转义被处理两次"的提示对这类错误无效——它会把模型引去查转义，而真正该看的是漏逗号那一行。

同一个根因的不同外形（在 Node v24 下用 stripTypeScriptTypes 逐条复现过）：

| 代码 | 报错 |
|---|---|
| const a = ["x" "y"]; / foo("a" "b") / { a: "x" "b": "y" } | Expected ',', got 'string literal' |
| const a = [1 2]; | Expected ',', got 'numeric literal' |
| const a = [x y]; | Expected ',', got 'ident' |
| const a = [{p:1} {p:2}]; | Expected ',', got '{' |
| const s = "a" "b";（语句位置） | Expected a semicolon |
| const a = ["x"，"y"];（全角逗号） | Expected ',', got '<lexing error>' |
| const o = { a: “x” };（全角引号） | Unexpected character '“' |

### 为什么反复出现，而且难自查

1. 程序是逐 token 生成的，长串同构字符串列表最容易漏一个逗号；而 run_code 没有编辑器/linter 的即时反馈——整段一次性交给剥离器解析，第一个语法错就让整个程序不执行。
2. 错误文本是模型唯一能看到的诊断，偏偏它没有位置。于是模型不知道是众多字符串列表里的哪一个漏了，只能整段重吐再试一次——这正是浪费的来源。

需要说明的是，我不是要工具去"容错"语法错误（#4699 已经论证：内容坏在模型构造字符串那一刻，工具侧更鲁棒解决不了），而是把**本来就存在、却被丢掉的诊断信息还回来**。

### 但位置其实就在 error.stack 里

stripTypeScriptTypes 抛出的 SyntaxError 自带行号和光标，只是被 messageOf() 丢掉了：

    :2
    async function __dsh_program__() {
    const a = ["x" "y"];
                   ^^^

期望（示意）：

    code run failed (exception): Expected ',', got 'string literal'
    run_code.ts:1
    const a = ["x" "y"];
                   ^^^

### 现状：两种 exception 不一致

- **程序运行期**抛的异常：**带** stack。src/bootstrap.ts:221 的 prepareException 用的是 error.stack ?? error.message。
- **解析/剥离失败**：**不带**。src/index.ts:355 的 catch 只传 message: messageOf(error)，而 messageOf（src/index.ts:51）是 error.message；最终在 packages/core/tools/src/ptc.ts:726 拼成 code run failed (kind): error.message。

同样是 exception，有的有栈有的没栈。建议把这条不一致拉平：解析失败时也把 stack 里的代码框带出来。

### 三条约束（避免这个改动本身变成 token 浪费）

1. **只要有界代码框，不要整段 stack。** 取 error.stack 第一个空行之前的部分即可。实测（40 行程序、第 31 行出错）：
   - 只给位置 run_code.ts:32：14 字符，约 4 token
   - 代码框（含 ^^^）：140 字符，约 37 token
   - 整段 stack：989 字符，约 261 token，多出来的是 7 行无用的 at parseTypeScript ... / at runNodeMain ...
2. **只改 parsing === true 这一支**，不要动通用 messageOf()，否则 spawn 失败等其它错误也会跟着变胖。
3. **行号要对齐用户程序。** 剥离前会前置一行 STRIP_PREFIX（async function __dsh_program__() { 加换行），所以剥离层报的行号比用户视角大 1（实测报 :32，用户实际是第 31 行）。要么减掉，要么给 stripTypeScriptTypes 传 sourceUrl 并做 source map。

补一句成本账：代码框那行源码本来就在模型上一条消息里（它刚写出来），所以**新增信息实际上只是"行号"**，增量可忽略；而没有行号时，模型只能整段重吐再试一次，那才是几百到上千 output token 的浪费。

### 与建议 2 的关系

不冲突，可以落在同一个出口：

- **提示（建议 2）** 是对转义类报错的启发式引导，适合放进 codeDescription（犯错前就能看到），或按错误文本有条件追加；
- **位置** 是所有解析失败都该有的事实，应无条件带上，并且有界。

两处都是纯诊断/文案改动，无行为风险。

### 版本

复核于 @deepseek-ai/dsh-ptc-runtime-node 0.2.1-alpha.2 与 master（最后 push 2026-10-09）：messageOf（src/index.ts:51）、解析 catch（src/index.ts:355）、code run failed（packages/core/tools/src/ptc.ts:726）都还是原样；codeDescription（ptc.ts:61）也仍是 'The program: the body of an async TypeScript function.'。即 #7618 的两条与这一条目前都未落地。

### 一处小事实修正

lws2004 写的"V8 的 TS 剥离"不准确：实际是 Node 内置的 stripTypeScriptTypes（node:module，解析用 amaro/SWC），错误码 ERR_INVALID_TYPESCRIPT_SYNTAX，栈里能看到 at parseTypeScript (node:internal/modules/typescript:...)。

CONTRIBUTING 暂不接受外部 PR，故仍放在讨论区，供维护者取舍。
