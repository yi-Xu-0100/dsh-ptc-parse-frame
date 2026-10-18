# 04 · 实施计划与验收标准

## Phase 0 · 确认 API（已完成）

- 用 cordis_inspect_query 查 `tools/post-execute`：实际签名是
  `(exec, result, next)`，waterfall，decision 由 `next()` 返回；
- 查 Tool 列表：PTC 的工具名是 `run_code`（`RUN_CODE_NAME`）；
- 读安装包 `dsh-tools/lib/types/ptc.js` 与 `dsh-tools/lib/index.js`：
  - `postExecute` 用 `decision.content` 替换结果文本；
  - `run_code` 失败时 `error.message` 形如
    `code run failed (exception): <parser message>`，并可能追加
    `\nFile sandbox: ...`；
  - `exec.arguments.code` 保留原始程序。
- 产出：docs/08 的「API 确认」一节。

## Phase 1 · 脚手架（已完成）

- package.json / cordis.patch.yml / locale / icon；
- `plugin_manager install_bundle` 返回 `application: applied`；
- 空逻辑阶段已跳过：安装时直接带上实现，避免多轮重装。

## Phase 2 · 实现（已完成）

- `index.js`：`apply(ctx, config)` + `tools/post-execute` 监听；
- `parseFrame(code, options)`：包装解析、取帧、行号 -1、去包装行、限行；
- `decorate(exec, result, decision, options)`：判定与改写；
- `insertFrame`：anchor 之后插入，保留 `File sandbox:` 等运行时后缀；
- 全部包 try/catch，失败回退下游 decision。

## Phase 3 · 单元测试（已完成）

`test/plugin.test.mjs`，23 个用例，`npm test` 或
`node test/plugin.test.mjs`：

- 第 1 行 / 中间行 / 超长程序；
- `throw new Error("boom")` 与正常程序不被改写；
- 无 stack 回退；
- 中文与反斜杠原样保留；
- CRLF 行号；
- 已带位置时 no-op；
- 包装行被去掉、行号 -1；
- 运行时 `File sandbox:` 后缀前插入；
- 下游 decision 的 `additionalContexts` / `block` / `value` 保留；
- 插件内部抛错回退原 decision；
- 配置边界。

## Phase 4 · 安装与端到端验证（安装与端到端已完成，卸载恢复待做）

- 已通过 `plugin_manager install_bundle` 安装到 desktop profile：
  `application: applied`，bundle 出现在 `dsh.profile.bundles`；
- `plugin_manager list_plugins` 显示 `include:ptc-parse-frame` 为
  `enabled: true, fiberPhase: active`；
- 已完成：在 PTC preset 会话里提交 `const a = ["x" "y"];`，确认位置出现；
- 已完成：提交 `throw new Error("boom-e2e")` 确认未改写；
- 待做：卸载插件确认恢复；
- 版本与逐字输出见 docs/05 的「2026-10-18 端到端记录」。

> 改完 `index.js` 后需要一次 profile recomposition 或重启，运行中的进程才会
> 加载新模块；安装动作本身已经加载了当时的文件。

## Phase 5 · 发布（待做）

- git tag v0.2.0，写 release notes；
- README 补安装步骤与截图（如有）；
- 视情况提交到插件市场索引（可选）。

## 验收标准

1. NEXT 下漏逗号错误包含 run_code.ts:1 与 ^^^；
2. 运行时异常、正常结果、其它工具错误逐字节不变；
3. 插件异常时回退原结果；
4. 卸载后完全恢复；
5. DSH 升级后插件仍可用（profile 未被覆盖）。

## 风险

- `tools/post-execute` 的签名在 NEXT 版本间可能变化：以 cordis_inspect_query 为准；
- 若上游修复了位置透传，本插件应自动 no-op（检测已有位置），避免重复叠加；
- profile 手改有风险：优先用 install_bundle，改前备份 cordis.patch.yml。
