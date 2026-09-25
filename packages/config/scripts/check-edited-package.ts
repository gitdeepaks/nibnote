// Claude Code PostToolUse hook: typecheck + lint the workspace package that owns the edited file.
// Exit code 2 feeds the failure output back to Claude so it fixes the violation in-session.
import { dirname, join, relative } from "node:path";
import { z } from "zod";

const HookInput = z.object({
  tool_input: z.object({ file_path: z.string() }),
});

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const packageDirPattern = /^(apps|packages)\/[^/]+$/;

function findPackageDir(filePath: string): string | undefined {
  let dir = dirname(filePath);
  while (dir.startsWith(repoRoot) && dir !== repoRoot) {
    if (packageDirPattern.test(relative(repoRoot, dir))) return dir;
    dir = dirname(dir);
  }
  return undefined;
}

async function runScript(cwd: string, script: "typecheck" | "lint") {
  const proc = Bun.spawn(["bun", "run", script], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { script, exitCode, output: `${stdout}${stderr}` };
}

const input = HookInput.safeParse(await Bun.stdin.json());
if (!input.success) process.exit(0);

const filePath = input.data.tool_input.file_path;
if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);

const packageDir = findPackageDir(filePath);
if (packageDir === undefined) process.exit(0);

const results = await Promise.all([runScript(packageDir, "typecheck"), runScript(packageDir, "lint")]);
const failures = results.filter((r) => r.exitCode !== 0);
if (failures.length === 0) process.exit(0);

const name = relative(repoRoot, packageDir);
for (const failure of failures) {
  console.error(`✗ ${failure.script} failed in ${name}\n${failure.output}`);
}
process.exit(2);
