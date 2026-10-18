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

## Release Notes 模板

    ## v0.1.0 (design)

    - 记录 DSH PTC 解析失败丢位置的根因与两版本差异
    - 给出 Host 插件设计、实施计划与验证矩阵
    - 附上游 discussion 现状与评论草稿

    ## v0.2.0 (plugin)

    - 实现 tools/post-execute 位置的代码框追加
    - 兼容 DSH NEXT 2.0.19-next / PTC 0.2.1-rc.2
    - 运行时异常与其它工具结果保持不变

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
