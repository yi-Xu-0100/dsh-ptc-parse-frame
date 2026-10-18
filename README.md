# dsh-ptc-parse-frame

> 给 DSH 的 PTC（Programmatic Tool Calling）补上「解析失败时的行号 + 代码框」。

## 这是什么

在 DSH 里，run_code 的程序在执行前会先经过 TypeScript 类型剥离（stripTypeScriptTypes）。
语法出错时，DSH 只把 error.message 转发给模型，丢掉了错误栈里的行号和 ^^^ 代码框。
于是漏一个逗号只会得到：

    code run failed (exception): Expected ',', got 'string literal'

模型不知道是哪一行、哪个字符串列表漏了，只能整段重吐重试。

本仓库提供一个 Host 插件，把这段位置信息补回去：

    code run failed (exception): Expected ',', got 'string literal'
    run_code.ts:1
    const a = ["x" "y"];
                   ^^^

## 状态

**设计阶段。** 本仓库先沉淀问题、证据、兼容性分析与实现方案；
插件实现与发布在下一阶段（见 docs/04-implementation-plan.md）。

## 兼容性

| 版本 | 形态 | 本仓库是否适用 |
|---|---|---|
| DSH Desktop 2.0.17（PTC 0.2.0-rc.2） | resources/app 解包 | 旧方案：文件补丁（legacy，见 docs/02） |
| DSH NEXT 2.0.19-next（PTC 0.2.1-rc.2） | resources/app.asar + profile 插件 | **目标：Host 插件** |

## 文档

| 文档 | 内容 |
|---|---|
| docs/00-overview.md | 问题、目标、非目标 |
| docs/01-background.md | 根因与证据 |
| docs/02-compatibility.md | 两版本差异与旧方案为何失效 |
| docs/03-design.md | 插件设计 |
| docs/04-implementation-plan.md | 实施计划与验收标准 |
| docs/05-verification.md | 验证矩阵 |
| docs/06-publishing.md | 发布到 GitHub 的步骤 |
| docs/07-upstream.md | 上游 issue/discussion 现状与评论草稿 |
| docs/08-research-notes.md | 复现与源码取证记录 |

## 许可

MIT，见 LICENSE。
