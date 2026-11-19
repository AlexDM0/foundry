// Runs every probe in this folder, one after the other, and prints one JSON line per script. A script that dies or
// prints no verdict gets a line recording what it did, so the run always shows every script and always exits 0.
// Usage: bun .platform-probes/run-all.js [--claude-program <path>] [--gpgconf-program <path>] [--only <text>] [--results-folder <folder>]
import { appendFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { optionValue, resultsFolder } from './support/probe.js';

const SCRIPT_TIMEOUT_MILLISECONDS = 3_600_000;
const RECORDED_OUTPUT_CHARACTERS = 2000;

const probesFolder = dirname(fileURLToPath(import.meta.url));
const scriptPaths = readdirSync(probesFolder)
  .filter((fileName) => fileName.endsWith('.js') && fileName !== basename(fileURLToPath(import.meta.url)))
  .filter((fileName) => fileName.includes(optionValue('--only') ?? ''))
  .sort()
  .map((fileName) => join(probesFolder, fileName));

function verdictLineIn(stdout) {
  const lastLine = stdout.trim().split('\n').at(-1) ?? '';
  try {
    return JSON.stringify(JSON.parse(lastLine));
  } catch {
    return null;
  }
}

function lineForAScriptWithoutAVerdict(scriptPath, exitCode, signalCode, timedOut, stdout, stderr) {
  return JSON.stringify({
    unknown: basename(scriptPath, '.js').replace(/^os-/u, ''),
    os: process.platform,
    architecture: process.arch,
    bunVersion: Bun.version,
    applicable: true,
    observed: {
      scriptPrintedNoVerdict: true,
      exitCode,
      signalCode,
      timedOut,
      stdout: stdout.slice(-RECORDED_OUTPUT_CHARACTERS),
      stderr: stderr.slice(-RECORDED_OUTPUT_CHARACTERS),
    },
  });
}

async function verdictLineOfScript(scriptPath) {
  const child = Bun.spawn([process.execPath, scriptPath, ...process.argv.slice(2)], {
    stdin: 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, SCRIPT_TIMEOUT_MILLISECONDS);
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  await child.exited;
  clearTimeout(timer);
  return verdictLineIn(stdout) ?? lineForAScriptWithoutAVerdict(scriptPath, child.exitCode, child.signalCode ?? null, timedOut, stdout, stderr);
}

const verdictsPath = join(resultsFolder(), 'verdicts.jsonl');
rmSync(verdictsPath, { force: true });
for (const [scriptIndex, scriptPath] of scriptPaths.entries()) {
  console.error(`[${scriptIndex + 1}/${scriptPaths.length}] ${basename(scriptPath)}`);
  const verdictLine = await verdictLineOfScript(scriptPath);
  appendFileSync(verdictsPath, `${verdictLine}\n`);
  console.log(verdictLine);
}
