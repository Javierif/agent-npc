// PreToolUse hook (Bash): blocks `git push` until the doc-keeper agent has reviewed
// the docs for the current HEAD. The agent records the reviewed commit in .claude/.doc-review-ok.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let input = "";
for await (const chunk of process.stdin) input += chunk;

let event;
try {
  event = JSON.parse(input);
} catch {
  process.exit(0);
}

const command = event?.tool_input?.command ?? "";
if (!/(^|[\s;&|(])git\s+(-\S+\s+)*push\b/.test(command)) process.exit(0);

const root = event.cwd || process.cwd();
const git = (args) => execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();

let head;
try {
  head = git("rev-parse HEAD");
} catch {
  process.exit(0);
}

let reviewed = "";
try {
  reviewed = readFileSync(join(root, ".claude", ".doc-review-ok"), "utf8").trim();
} catch {}

if (reviewed === head) process.exit(0);

console.error(
  "Push blocked: the documentation has not been reviewed for this commit. " +
    "First invoke the `doc-keeper` agent (Agent with subagent_type \"doc-keeper\") to review CLAUDE.md/README/MVP; " +
    "if it changes documentation, commit it and invoke it again. Then repeat the push."
);
process.exit(2);
