#!/usr/bin/env node
// 从 conventional commits 生成 release note。
// GitHub 自带的 generate-notes 只会收录 PR（What's Changed），本仓库的提交直接进 main，
// 生成的正文只剩一个 "Full Changelog" 链接，所以这里按提交类型自己分组。
//
// 用法：node scripts/release-notes.mjs [--from <tag>] [--to <tag|ref>]
// 不传 --from 时用 git describe 找 to 的父提交上最近的 tag；找不到就覆盖全部历史。

import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 用临时文件而不是管道接 git 的输出：受限环境（例如 DSH 沙箱）禁止创建命名管道，
// stdio: "pipe" 会让 spawn 直接 EPERM。
function runGit(gitArgs, { quiet = false } = {}) {
  const capture = join(tmpdir(), `release-notes-${process.pid}-${Date.now()}.txt`);
  const fd = openSync(capture, "w");
  try {
    const result = spawnSync("git", gitArgs, { stdio: ["ignore", fd, quiet ? "ignore" : "inherit"] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${gitArgs.join(" ")} 退出码 ${result.status}`);
  } finally {
    closeSync(fd);
  }
  const text = readFileSync(capture, "utf8");
  unlinkSync(capture);
  return text;
}

const args = process.argv.slice(2);

function option(name, fallback = "") {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const to = option("to", "HEAD");
let from = option("from");

if (!from) {
  try {
    // 仓库还没有任何 tag 时 git describe 会失败，属于预期情况，不要往日志里喷 stderr
    from = runGit(["describe", "--tags", "--abbrev=0", `${to}^`], { quiet: true }).trim();
  } catch {
    from = "";
  }
}

const range = from ? `${from}..${to}` : to;
const SEP = "\x1f";
const REC = "\x1e";

const commits = runGit(["log", "--no-merges", `--pretty=format:%h${SEP}%s${SEP}%b${REC}`, range])
  .split(REC)
  .map((chunk) => chunk.trim())
  .filter(Boolean)
  .map((chunk) => {
    const [sha, subject, body] = chunk.split(SEP);
    return { sha, subject: (subject ?? "").trim(), body: (body ?? "").trim() };
  });

const LABEL = new Map([
  ["feat", "新增"],
  ["fix", "修复"],
  ["perf", "性能"],
  ["refactor", "重构"],
  ["docs", "文档"],
  ["test", "测试"],
  ["style", "样式"],
  ["chore", "构建与杂项"],
]);
const ORDER = [...LABEL.keys(), "other"];

const parsed = commits.map((commit) => {
  const match = /^(?<type>[a-z]+)(?<breaking>!)?(\((?<scope>[^)]+)\))?:\s*(?<text>.+)$/.exec(commit.subject);
  if (!match?.groups) return { ...commit, type: "other", text: commit.subject, scope: "" };
  return {
    ...commit,
    type: LABEL.has(match.groups.type) ? match.groups.type : "other",
    text: match.groups.text.trim(),
    scope: match.groups.scope ?? "",
    breaking: match.groups.breaking === "!" || /BREAKING CHANGE/.test(commit.body),
  };
});

const buckets = new Map();
for (const commit of parsed) {
  if (!buckets.has(commit.type)) buckets.set(commit.type, []);
  buckets.get(commit.type).push(commit);
}

function baseUrl() {
  if (process.env.GITHUB_REPOSITORY) return `https://github.com/${process.env.GITHUB_REPOSITORY}`;
  try {
    const url = runGit(["remote", "get-url", "origin"]).trim();
    const match = /github\.com[:/](?<owner>[^/]+)\/(?<repo>[^/.]+?)(\.git)?$/.exec(url);
    if (match?.groups) return `https://github.com/${match.groups.owner}/${match.groups.repo}`;
  } catch {
    // 没有 origin 时不输出对比链接
  }
  return "";
}

const lines = [];

if (parsed.length === 0) {
  lines.push("本次发布没有代码提交。", "");
} else {
  for (const type of ORDER) {
    const items = buckets.get(type);
    if (!items?.length) continue;
    lines.push(`### ${type === "other" ? "其他" : LABEL.get(type)}`, "");
    for (const item of items) {
      const scope = item.scope ? `**${item.scope}**：` : "";
      const breaking = item.breaking ? "**破坏性变更** " : "";
      lines.push(`- ${breaking}${scope}${item.text}（${item.sha}）`);
    }
    lines.push("");
  }
}

const base = baseUrl();
if (base) {
  lines.push(
    from
      ? `**完整变更**：${base}/compare/${from}...${to}`
      : `**完整变更**：${base}/commits/${to}`,
    "",
  );
}

process.stdout.write(lines.join("\n"));
