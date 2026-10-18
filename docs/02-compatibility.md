# 02 · 两个版本的差异与旧方案为何失效

## 版本对照

| 维度 | DSH Desktop（旧） | DSH NEXT |
|---|---|---|
| 应用版本 | 2.0.17 | 2.0.19-next |
| PTC runtime | @deepseek-ai/dsh-ptc-runtime-node 0.2.0-rc.2 | 0.2.1-rc.2 |
| 打包形态 | resources/app/**，解包目录 | resources/app.asar + app.asar.unpacked |
| PTC 的 JS 位置 | resources/app/node_modules/@deepseek-ai/... | app.asar 内（unpacked: false） |
| 解析失败出口 | 1 处 | 2 处 |
| 扩展机制 | 无（只能改文件） | profile 级 cordis 插件（cordis.patch.yml + bundles） |

## 旧方案：文件补丁

旧版可直接改：

    C:\Program Files\DSH Desktop\resources\app\node_modules\@deepseek-ai\
      dsh-ptc-runtime-node\lib\index.js

在 messageOf 后插入 describeParseFailure()，并把解析 catch 的 message 改成
parsing ? describeParseFailure(error) : messageOf(error)。补丁脚本在
D:\Github\DSHWorkspace\_tools\dsh-ptc-parse-frame\（仓库外，legacy）。

**这个方案对 NEXT 完全失效：**

1. NEXT 没有 resources/app/node_modules，PTC 的 JS 在 app.asar 里；
2. 即使解包改文件，也要重打包 180MB 的 asar（需管理员、更新即失效）；
3. NEXT 有 2 处解析失败出口，且行号偏移不同。

## NEXT 的两处解析失败出口

### 常驻 / retained 路径

    async run(spec) { ... }            // lib/index.js:1345
    code = stripTypeScriptTypes(spec.program);   // 1354，未包装
    catch -> messageOf$1(error)        // 1356-1359

这里剥离的是**未包装**的 spec.program，所以报错里的行号就是用户程序的行号（偏移 0）。

### 每次新进程 / per-call 路径

    const stripped = stripTypeScriptTypes(STRIP_PREFIX + spec.program + STRIP_SUFFIX); // 1591
    catch -> message: messageOf(error) // 1816-1820

这里前面多包了一行 async function __dsh_program__() {，所以行号比用户视角大 1（偏移 -1）。

两个 messageOf（936 的 messageOf$1 与 1401 的 messageOf）都只取 error.message。

## NEXT 的插件体系

profile 目录：

    C:\Users\<user>\.dsh\profiles\desktop\
        cordis.patch.yml      # 用户 patch 层，可 insert/覆盖插件行
        package.json          # dsh.profile.bundles + dependencies
        node_modules\         # profile 安装的 bundle

要点：

- patch 层在每次启动时应用，且 patchReload: live；
- 插件以 bundle 形式安装（package.json 声明 dsh.bundle.patch）；
- 官方安装入口是 plugin_manager 的 install_bundle，不建议手改 package.json / cordis.patch.yml；
- 插件位于用户 profile，**DSH 升级不会覆盖**。

因此 NEXT 的正确修法是 Host 插件，而不是改 app.asar。
