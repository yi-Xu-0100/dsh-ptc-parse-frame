# 07 · 上游 issue / discussion 现状

## 结论

截至 2026-10-18：

- 上游 master（2026-10-09 最后 push）未透传位置；
- npm 最新 @deepseek-ai/dsh-ptc-runtime-node 0.2.1-alpha.2 未透传；
- DSH NEXT 2.0.19-next（PTC 0.2.1-rc.2）未透传，且新增了 retained 路径的第二处失败出口；
- 现有 discussion #3925 / #7618 讨论的是**转义提示**（JSON 传输 + JS 源码字面量双重处理），
  不是解析失败丢位置；两者落在同一处代码出口，但诉求不同。

## 相关讨论

- #3925：run_code 的 code 参数按 JS 转义处理，写正则/路径/heredoc 经常报错，建议描述里加提示。
  lws2004 的评论已把根因定位到 stripTypeScriptTypes 的解析失败出口。
- #7618：把 #3925 收敛成两处最小改动（codeDescription + 解析失败出口提示），0 评论。
- 两帖均写明 CONTRIBUTING 暂不接受外部 PR，故走 Discussions。

## 建议的补充评论

见 docs/upstream-comment.md（可直接粘贴到 #7618）。

核心诉求：解析失败时透传**位置**（line/column + 有界代码框），而不仅是转义提示；
位置对所有语法错都有用，提示只对转义类错误有用。

## 上游修复后的处理

若未来 DSH 自己带上了位置，本插件应自动 no-op：
检测错误文本里是否已有 run_code.ts:数字，已有则不追加。
这样插件与上游修复可以共存，也可以直接卸载。
