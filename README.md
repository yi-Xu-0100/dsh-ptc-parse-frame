# dsh-ptc-parse-frame

> 给 DSH 的 PTC（Programmatic Tool Calling）补上「解析失败时的行号 + 代码框」。

## 这是什么

在 DSH 里，`run_code` 的程序在执行前会先经过 TypeScript 类型剥离
（`stripTypeScriptTypes`）。语法出错时，DSH 只把 `error.message` 转发给模型，
丢掉了错误栈里的行号和 `^^^` 代码框。于是漏一个逗号只会得到：

    code run failed (exception): Expected ',', got 'string literal'

模型不知道是哪一行、哪个字符串列表漏了，只能整段重吐重试。

本仓库提供一个 Host 插件，把这段位置信息补回去（真实结果还会带运行时自己的
`File sandbox:` 行，插件把代码框插在解析消息之后、这些后缀之前）：

    Error: code run failed (exception): Expected ',', got 'string literal'
    run_code.ts:1
    const a = ["x" "y"];
                   ^^^
    File sandbox: workspace-write.

## 状态

**0.2.0 已实现并安装。** 这是一个 Host-only 的 profile bundle：

- 监听 `tools/post-execute`，只在 `run_code` 的解析失败上改写结果；
- 自带 23 个单元测试，覆盖行号、代码框、运行时异常、幂等、配置与回退；
- 已通过 `plugin_manager install_bundle` 安装到 `desktop` profile；
- 端到端用例已在 PTC 会话中通过（用例 1–5、13，见 docs/05-verification.md）。

## 安装

仓库目录本身就是 bundle 根目录（`package.json` 声明了
`dsh.bundle.patch`）。首选官方入口：

    plugin_manager  action: install_bundle  target: <本仓库绝对路径>

安装会：

1. 把本目录作为 `link:` 依赖加入 profile；
2. 把 `dsh-ptc-parse-frame` 加入 `dsh.profile.bundles`；
3. 立即应用 bundle patch（`patchReload: live`）。

卸载：

    plugin_manager  action: remove_bundle  target: dsh-ptc-parse-frame

> 修改 `index.js` 之后，需要让 Host 做一次 profile recomposition（例如
> 开关一次 bundle）或重启 DSH NEXT，运行中的进程才会加载新的模块版本。

## 配置

`cordis.patch.yml` 的默认行：

    - insert:
        - id: ptc-parse-frame
          name: dsh-ptc-parse-frame
          config:
            enabled: true
            maxFrameLines: 10
            sourceName: run_code.ts

| 配置 | 默认值 | 说明 |
|---|---|---|
| `enabled` | `true` | 设为 `false` 时插件完全 no-op（但保持已安装）。 |
| `maxFrameLines` | `10` | 代码框正文的最大行数（1–40），优先保留 caret 附近的行。 |
| `sourceName` | `run_code.ts` | 行号前缀，也是「已经带位置」检测用的名字。 |

## 行为边界

插件只在以下条件**同时**成立时改写结果：

1. 工具名是 `run_code`；
2. 结果 `isError: true`；
3. 工具参数里有原始 `code`；
4. 错误消息以 `code run failed (exception): <parser message>` 开头；
5. 用与运行时相同的包装重新解析原始 `code` 仍然失败，且解析器消息与第 4 步一致；
6. 结果文本里还没有 `run_code.ts:<数字>` 形式的位置。

任一条件不满足就原样返回。运行时异常（例如 `throw new Error("boom")`）的程序
能正常解析，因此不会被误判；其它工具的结果完全不经过改写。

插件自身抛错时返回下游 listener 的原始 decision，绝不改变失败原因。

## 兼容性

| 版本 | 形态 | 本仓库是否适用 |
|---|---|---|
| DSH Desktop 2.0.17（PTC 0.2.0-rc.2） | resources/app 解包 | 旧方案：文件补丁（legacy，见 docs/02） |
| DSH NEXT 2.0.19-next（PTC 0.2.1-rc.2） | resources/app.asar + profile 插件 | **本插件** |

## 开发与测试

无运行时依赖，测试直接使用 Node 24 的 `node:module.stripTypeScriptTypes`：

    npm test

等价于：

    node test/plugin.test.mjs

`node --test` 在 DSH 沙箱里会因为测试运行器需要 spawn 子进程而报 `EPERM`，
所以脚本直接运行测试文件（`node:test` 在单文件模式下进程内执行）。

## 文档

| 文档 | 内容 |
|---|---|
| docs/00-overview.md | 问题、目标、非目标 |
| docs/01-background.md | 根因与证据 |
| docs/02-compatibility.md | 两版本差异与旧方案为何失效 |
| docs/03-design.md | 插件设计 |
| docs/04-implementation-plan.md | 实施计划与验收标准 |
| docs/05-verification.md | 验证矩阵与记录 |
| docs/06-publishing.md | 发布到 GitHub 的步骤 |
| docs/07-upstream.md | 上游 issue/discussion 现状与评论草稿 |
| docs/08-research-notes.md | 复现、源码取证与 API 确认 |
| docs/upstream-comment.md | 可直接粘贴到 #7618 的评论草稿 |

## 许可

MIT，见 LICENSE。
