# 04 · 实施计划与验收标准

## Phase 0 · 确认 API（前置）

- 用 cordis_inspect_query 查 Event: tools/post-execute 的签名与 dispatch 模式；
- 查 run_code 在 Tool 列表里的确切名称；
- 若签名与本文假设不符，改读安装包 dsh-tools 的 lib/types/*.d.ts 对齐；
- 产出：一页 API 确认记录（补进 docs/08-research-notes.md）。

## Phase 1 · 脚手架

- 建 package.json / cordis.patch.yml / locale / icon；
- 确认 bundle 能被 install_bundle 识别（application: applied）；
- 不实现逻辑，先确认"空插件"可安装、可卸载、无副作用。

## Phase 2 · 实现

- index.js：apply(ctx, config) + tools/post-execute 监听；
- extractFrame(code, options)：包装解析、取帧、减 1、去包装行、限行；
- 判定与改写逻辑；
- 全部包 try/catch，失败回退原 result。

## Phase 3 · 单元测试

- 用普通 Node 跑 extractFrame：
  - 第 1 行 / 中间行 / 末尾行；
  - 无 stack 回退；
  - 超长程序只取附近行；
  - 含中文与反斜杠的源码；
  - 已带位置时 no-op；
  - 包装行被去掉、行号 -1。

## Phase 4 · 安装与端到端验证

- 通过 plugin_manager install_bundle 安装到 desktop profile；
- 在 NEXT 里提交 const a = ["x" "y"]; 验证位置出现；
- 提交 throw new Error("boom") 验证未被改写；
- 卸载插件验证恢复；
- 记录 DSH 版本与 PTC runtime 版本。

## Phase 5 · 发布

- git tag v0.1.0，写 release notes；
- README 补安装步骤与截图（如有）；
- 视情况提交到插件市场索引（可选）。

## 验收标准

1. NEXT 下漏逗号错误包含 run_code.ts:1 与 ^^^；
2. 运行时异常、正常结果、其它工具错误逐字节不变；
3. 插件异常时回退原结果；
4. 卸载后完全恢复；
5. DSH 升级后插件仍可用（profile 未被覆盖）。

## 风险

- tools/post-execute 的签名在 NEXT 版本间可能变化：以 cordis_inspect_query 为准；
- 若上游修复了位置透传，本插件应自动 no-op（检测已有位置），避免重复叠加；
- profile 手改有风险：优先用 install_bundle，改前备份 cordis.patch.yml。
