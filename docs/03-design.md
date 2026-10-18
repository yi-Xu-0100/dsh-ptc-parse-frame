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

package.json 关键字段：

    {
      "name": "dsh-ptc-parse-frame",
      "version": "0.1.0",
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
          config: {}

## 扩展点：优先 tools/post-execute

practices.md 把 tools/post-execute 列为 waterfall listener：允许改写工具结果，
不拥有决策时必须 return next()。这是最贴近需求、侵入最小的位置。

    export const inject = ['tools']

    export function apply(ctx, config) {
      ctx.on('tools/post-execute', async (exec, next) => {
        const result = await next()
        return appendFrameWhenParseFailed(exec, result, config)
      })
    }

备选：包住 ctx.ptcRuntime.run（inject: ['ptcRuntime']）。它直接拿到 spec.program，
对 retained / per-call 两条路径都成立；但需要确认服务实例方法可写，且要自己保持返回值形状。
**实现前必须用 cordis_inspect_query 确认 Event 名称与回调签名**；文档也要求以运行时为准。

## 判定条件

只有当以下条件同时成立时才改写：

1. 工具名是 run_code（PTC 的 code 工具）；
2. 结果是一个失败，且错误文本像解析错误（Expected / Expression expected / Unexpected 等）；
3. 错误文本里**还没有**位置（没有形如 run_code.ts:数字 的行）；
4. 能取到原始 code（工具参数或 spec.program）。

任一不满足就原样返回。运行时异常（throw new Error）不会被误判：它们的程序能正常解析。

## 位置计算

不要依赖运行时错误栈里的行号（两条路径偏移不同）。插件自己算：

1. 取原始 code；
2. 用与 per-call 路径相同的包装重新解析：

       const wrapped = 'async function __dsh_program__() {\n' + code + '\n}'
       try { stripTypeScriptTypes(wrapped) } catch (e) { ... }

3. 从 error.stack 取第一个空行之前的部分；
4. 把首行 :N 改成 run_code.ts:(N-1)；
5. 去掉包装函数那一行 async function __dsh_program__() {；
6. 最多保留 maxFrameLines 行（默认 10），超出截断。

这样无论失败来自 retained 还是 per-call 路径，行号都对齐用户程序。

## 配置

    interface Config {
      enabled: boolean          // 默认 true
      maxFrameLines: number     // 默认 10
      sourceName: string        // 默认 run_code.ts
    }

## 安全与幂等

- 整个改写包在 try/catch 里；任何异常都返回原 result，绝不改变失败原因；
- 已存在位置信息则跳过（上游修复或其它插件已处理时自然 no-op）；
- 不写 session 事件、不改会话日志格式；
- 卸载插件即恢复原行为（注册通过 ctx.effect / ctx.on 自动清理）。

## Token 预算

代码框上限 10 行，实测典型 5 行 / 140 字符 / 约 37 token；
绝不透传整段 stack（约 261 token）。
