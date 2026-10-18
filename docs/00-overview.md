# 00 · 概览

## 问题

DSH 的 run_code（PTC）在解析失败时，只把 error.message 返回给模型：

    code run failed (exception): Expected ',', got 'string literal'

解析器本来给出了行号与 ^^^ 代码框，但它们藏在 error.stack 里，被 messageOf() 丢掉了。
模型只能盲猜、整段重吐、重试，浪费轮次与 token。

## 目标

在 DSH NEXT 上，用一个 profile 级 Host 插件把位置补回：

- 解析失败时，追加形如 run_code.ts:12 的行号与有界代码框；
- 运行时异常、正常结果、其它工具的错误一律不动；
- 插件自身出错时返回原结果，绝不吞掉或改写失败原因；
- 升级 DSH Desktop 不丢（插件在 profile 里，不在 app.asar 里）。

## 实现状态

**0.2.0 已实现。** 形态是 Host-only bundle（`index.js` + `cordis.patch.yml`），
挂在 `tools/post-execute` 瀑布上；已通过 `plugin_manager install_bundle` 安装到
desktop profile。单元测试覆盖 docs/05 中的逻辑用例；端到端用例需要在 PTC preset
的会话里执行。

## 非目标

- 不修复语法错误本身，也不让工具"容错"错误代码；
- 不改变上游 dsh-ptc-runtime-node 的行为（那是 issue/PR 的事，见 docs/07）；
- 不为旧版 DSH Desktop 重新打包 app（旧版继续用既有的文件补丁）；
- 不引入新的 session 事件类型或改变会话日志格式。

## 成功标准

1. 在 DSH NEXT 下提交 const a = ["x" "y"];，错误文本包含 run_code.ts:1 与 ^^^；
2. 提交 throw new Error("boom")，错误文本与未装插件时完全一致；
3. 插件卸载后行为完全恢复；
4. DSH 升级后插件仍在（profile 未被覆盖）。
