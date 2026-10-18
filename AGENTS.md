# AGENTS.md

本文件只是 agent 在本仓库工作的入口索引：说明在什么情况下读哪个文档。
项目事实一律写在 `docs/` 里，本文件不复述。

## 这是什么

DSH 的 Host-only 插件，给 `run_code`（PTC）的解析失败补回行号与 `^^^` 代码框。
无运行时依赖、无构建步骤，Node >= 24；仓库目录本身就是 bundle 根目录
（`package.json` 声明 `dsh.bundle.patch`）。

## 按任务找文档

| 要做的事 | 读 |
| --- | --- |
| 了解问题、目标与非目标 | [docs/overview.md](docs/overview.md) |
| 查解析器为什么丢掉位置 | [docs/background.md](docs/background.md) |
| 改判定条件或代码框逻辑 | [docs/design.md](docs/design.md) 与 README 的「行为边界」 |
| 在旧版 DSH Desktop 上排查 | [docs/compatibility.md](docs/compatibility.md) |
| 看做到哪一步、还剩什么 | [docs/implementation-plan.md](docs/implementation-plan.md) |
| 复核验收用例、补验证记录 | [docs/verification.md](docs/verification.md) |
| 安装、发布、打 tag | [docs/publishing.md](docs/publishing.md) |
| 动上游 issue / PR | [docs/upstream.md](docs/upstream.md)、[docs/upstream-comment.md](docs/upstream-comment.md) |
| 复现、取源码证据、确认 API 签名 | [docs/research-notes.md](docs/research-notes.md) |

## 本仓特有的约束

- 改完 `index.js` 必须让 Host 重新组合 profile（开关一次 bundle，或重启 DSH NEXT）；
  运行中的进程不会热加载新模块。
- 测试只跑 `npm test`（即 `node test/plugin.test.mjs`）。`node --test` 在 DSH 沙箱里
  要 spawn 子进程，会报 `EPERM`。
- 改写条件见 README「行为边界」的 6 条，必须同时成立；放宽任一条件前先补对应单元测试。
- 仓库统一 LF（`.gitattributes` 的 `* text=auto eol=lf`），不要提交 CRLF。
- 发布只能靠推 `v<version>` tag 触发 CI（同时校验 tag 与 `package.json` 版本一致）；
  不要在网页手动建 Release，正文由 `scripts/release-notes.mjs` 自动生成。
- 本机沙箱下 `git` 可能打印 `fsmonitor_ipc__send_query` 报错，属噪音，不影响结果。
- 文档用中文书写，一条事实只写一处；交叉引用使用完整文件名；新增文档文件名不带序号前缀，
  阅读顺序写在 README 的文档索引表里（现有正文标题保留章号）。
