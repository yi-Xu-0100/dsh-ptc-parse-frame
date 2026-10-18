# 03 · 插件设计

## 形态

Host-only bundle：

    dsh-ptc-parse-frame/
        package.json
        cordis.patch.yml
        index.js
        locale/en.json
        locale/zh.json
        icon.svg
        test/plugin.test.mjs

package.json 关键字段：

    {
      "name": "dsh-ptc-parse-frame",
      "version": "0.2.0",
      "private": true,
      "type": "module",
      "exports": {
        ".": "./index.js",
        "./locale/*.json": "./locale/*.json",
        "./icon": "./icon.svg"
      },
      "dsh": { "bundle": { "patch": "./cordis.patch.yml" } },
      "files": ["index.js", "cordis.patch.yml", "locale/*.json", "icon.svg"]
    }

cordis.patch.yml：

    - insert:
        - id: ptc-parse-frame
          name: dsh-ptc-parse-frame
          config:
            enabled: true
            maxFrameLines: 10
            sourceName: run_code.ts

## 扩展点：tools/post-execute

运行时实际的 Event 契约（`cordis_inspect_query`，DSH NEXT 2.0.19-next）：

    'tools/post-execute'(
      this: Scoped<ToolRuntime>,
      exec: ToolExecution,
      result: Readonly<ToolExecutionResult>,
      next: () => Promise<PostToolDecision>,
    ): Promise<PostToolDecision>

注意：**不是** `(exec, next)`，也不是 emit；`result` 是 waterfall 的输入参数，
下游的 decision 由 `next()` 返回。`PostToolDecision` 的 `accept` 分支可以带
`content` 替换结果文本（不能同时带 `value`）。

    export const inject = ['tools']

    export function apply(ctx, config) {
      const options = resolveOptions(config)
      ctx.on('tools/post-execute', async (exec, result, next) => {
        const decision = await next()
        try {
          return decorate(exec, result, decision, options)
        } catch {
          return decision
        }
      })
    }

先 await `next()` 再改写，保证不吞掉其它 listener 的 decision
（`additionalContexts`、`block`、`value` 都原样保留）。

备选是包住 `ctx.ptcRuntime.run`；它直接拿到 `spec.program`，但需要自己保持返回
值形状，且无法复用工具结果管线的 decision 语义，因此没有采用。

## 判定条件

只有当以下条件同时成立时才改写：

1. 工具名是 `run_code`；
2. `result.isError === true`；
3. `exec.arguments.code` 是非空字符串；
4. `result.error.message` 以 `code run failed (exception): ` 开头；
5. 用与 per-call 路径相同的包装重新解析原始 code 仍然失败；
6. 解析器消息与错误消息中 `code run failed (exception): ` 之后的部分一致
   （允许运行时再追加 `\nFile sandbox: ...` 等后缀）；
7. 结果文本里还没有 `sourceName:<数字>` 形式的位置。

任一不满足就原样返回。运行时异常（throw new Error）不会被误判：它们的程序能
正常解析，第 5 步直接返回 undefined。

## 位置计算

不要依赖运行时错误栈里的行号（两条路径偏移不同）。插件自己算：

1. 取原始 code；
2. 用与 per-call 路径相同的包装重新解析：

       const wrapped = 'async function __dsh_program__() {\n' + code + '\n}'
       try { stripTypeScriptTypes(wrapped) } catch (e) { ... }

3. 取 `error.stack` 第一个空行之前的部分：
   - 首行 `:N` 是包装后程序里的错误行；
   - 中间是错误行上下文，caret 行（`^\s*\^+\s*$`）给出列与宽度；
4. 按 SWC 的上下文规则还原每一行对应的包装行号，再减 1 得到用户行号；
5. 丢掉包装函数行（line 1）和 `\n}`（line > code 行数）；
6. 把首行改成 `run_code.ts:<用户行号>`，最多保留 `maxFrameLines` 行。

这样无论失败来自 retained 还是 per-call 路径，行号都对齐用户程序。

## 插入位置

真实错误文本可能带运行时后缀：

    code run failed (exception): Expected ',', got 'string literal'
    File sandbox: workspace-write.

插件把 frame 插在 anchor（`code run failed (exception): <parser message>`）之后：

    code run failed (exception): Expected ',', got 'string literal'
    run_code.ts:1
    const a = ["x" "y"];
                   ^^^
    File sandbox: workspace-write.

如果内容已被其它插件改写、找不到 anchor，则退化为追加到最后一个 text block 末尾
（仍然只在该 run_code 解析失败上发生）。

## 配置

    interface Config {
      enabled: boolean          // 默认 true
      maxFrameLines: number     // 默认 10，范围 1–40
      sourceName: string        // 默认 run_code.ts
    }

`resolveOptions` 对缺失/非法值回退默认值，不会因为配置错误让插件激活失败。

## 安全与幂等

- 整个改写包在 try/catch 里；任何异常都返回下游 decision，绝不改变失败原因；
- 已存在位置信息则跳过（上游修复或其它插件已处理时自然 no-op）；
- 只在解析失败上改写，运行时异常、正常结果、其它工具逐字不变；
- 不写 session 事件、不改会话日志格式；
- 卸载插件即恢复原行为（注册通过 ctx.on 自动清理）。

## Token 预算

代码框上限 10 行，实测典型 4 行 / 约 80 字符 / 约 21 token；
绝不透传整段 stack（约 261 token）。

## 已知限制

- 如果未来上游把位置直接放进 error.message，插件的 anchor 不再等于
  `<parser message>`，会自动 no-op（此时也不需要插件了）；
- `sourceName` 只用于显示与「已带位置」检测，不改变解析行为；
- 只在 `tools/post-execute` 可见的 `run_code` 失败上生效；通过其它入口直接调用
  PTC runtime 不经过这里。
