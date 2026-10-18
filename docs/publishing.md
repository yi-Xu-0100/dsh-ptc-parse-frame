# 06 · 发布到 GitHub

## 仓库元数据（已设置）

- 名称：dsh-ptc-parse-frame
- 描述：DSH PTC run_code parse-error position plugin (line + code frame)
- Homepage：仓库 README
- Topics（2026-10-18 通过 API 设置）：dsh-plugin, deepseek-harness, deepseek, dsh,
  cordis, ptc, plugin, developer-tools, nodejs
- 许可证：MIT
- 默认分支：main，Issues 已开启

`dsh-plugin` 是插件发现入口：DSH 没有内置插件市场，生态目录（如
awesome-dsh-plugins）按 GitHub 的 [`dsh-plugin`](https://github.com/topics/dsh-plugin)
topic 抓取插件仓库。它是 **GitHub topic，不是 issue label，也不是 package.json 字段**；
只写进 `keywords` 不会被发现，改动 topics 后也不会进 git 历史（只能通过 API 或网页设置）。

## 首次发布

    git remote add origin git@github.com:<your-account>/dsh-ptc-parse-frame.git
    git push -u origin main
    git tag -a v0.1.0 -m "v0.1.0: design docs"
    git push origin v0.1.0

> v0.1.0 只有文档；v0.2.0 起包含插件实现。两个 tag 均已推送到远端。

## 发布流程（GitHub Actions）

推送 `v<version>` tag 就会触发 `.github/workflows/release.yml`，不需要手动建 Release：

1. 校验 tag 去掉 `v` 后与 `package.json` 的 `version` 一致，不一致直接失败；
2. 跑 `npm test`；
3. `npm pack` 出 `dsh-ptc-parse-frame-<version>.tgz`（内容由 `files` 白名单决定）作为 Release 资产；
4. 用 `scripts/release-notes.mjs` 从 conventional commits 生成正文，按
   新增 / 修复 / 文档 / 构建与杂项 分组，末尾附完整变更对比链接；
5. 创建 Release；同名 Release 已存在时改为补传资产并刷新正文（幂等，重跑不会报错）。

    git tag -a v0.2.1 -m "v0.2.1: ..."
    git push origin v0.2.1

本地预览某一版的正文，不必等 CI：

    node scripts/release-notes.mjs --from v0.2.0 --to HEAD

> 为什么不用 GitHub 自带的 `--generate-notes`：它只统计 PR（What's Changed），
> 本仓库的提交是直接进 main 的，实测生成出来只剩一行 "Full Changelog"，
> 所以正文改为按提交类型自己生成。

## 安装方式

当前版本（0.2.0）已按下面的官方入口安装到本机 desktop profile：

    plugin_manager  action: install_bundle  target: <bundle 绝对目录>

手动兜底（仅在无法使用 install_bundle 时，先备份）：

1. 把 bundle 目录放到 profile 的 node_modules；
2. 在 ~/.dsh/profiles/desktop/cordis.patch.yml 追加一行 insert；
3. 确认 patchReload 生效，再验证用例 1。

## 安全

- 仓库不包含任何 key、cookie、token；
- .gitignore 已排除 node_modules、dist、*.tgz、*.log；
- 发布前跑一次密钥扫描（如 gitleaks）可选。
