// P7: a kill of the CLI's group leaves the Bash tool's command or not, and a session whose reader dies mid-turn carries
// on: a relay process owns the session's pipes and exits abruptly, as a dying Watcher does.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { STREAM_ARGUMENTS, startSession, toolCallsOf, waitingCommandOf } from './support/claude-session.js';
import { claudeProgramOption, probe, settleBoundedMilliseconds, settleMilliseconds } from './support/probe.js';
import { attempt, killQuietly, processIsAlive, runPowershell, runProgram, sleepMilliseconds } from './support/programs.js';
import { scratchFolder } from './support/scratch.js';

const TOOL_START_WAIT_MILLISECONDS = 90_000;
const LONG_TOOL_SECONDS = 120;
const SHORT_TOOL_SECONDS = 5;
const TOOL_RUNNING_MILLISECONDS = settleBoundedMilliseconds(3000);
const KILL_SETTLE_MILLISECONDS = settleBoundedMilliseconds(1000);
const TURN_FINISH_WAIT_MILLISECONDS = 90_000;
const POLL_MILLISECONDS = 250;

const bashHasStartedOrTurnEnded = (lines) => toolCallsOf(lines).some((call) => call.name === 'Bash') || lines.some((line) => line.type === 'result');

async function processTableRows() {
  const listing = process.platform === 'win32'
    ? await runPowershell('Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) 0" }', { keepWholeOutput: true })
    : await runProgram(['ps', '-A', '-o', 'pid=,ppid=,pgid='], { keepWholeOutput: true });
  return listing.stdout.trim().split('\n').map((row) => row.trim().split(/\s+/u).map(Number));
}

async function descendantsOf(rootPid) {
  const rows = await processTableRows();
  const found = new Map();
  const frontier = [rootPid];
  while (frontier.length > 0) {
    const parent = frontier.pop();
    for (const [pid, parentPid, groupId] of rows) {
      if (parentPid === parent && !found.has(pid)) {
        found.set(pid, groupId);
        frontier.push(pid);
      }
    }
  }
  return [...found].map(([pid, groupId]) => ({ pid, groupId }));
}

async function killOfCliGroup() {
  const session = startSession({ cwd: scratchFolder(), detached: true, extraArguments: ['--permission-mode', 'auto'] });
  session.writeUserLine(`Run this exact command in the foreground with the Bash tool, once: ${waitingCommandOf(LONG_TOOL_SECONDS)}`);
  await session.waitUntil(bashHasStartedOrTurnEnded, TOOL_START_WAIT_MILLISECONDS);
  await sleepMilliseconds(TOOL_RUNNING_MILLISECONDS);
  const descendants = await descendantsOf(session.pid);
  const groupKill = await attempt(() => process.kill(-session.pid, 'SIGKILL'));
  await sleepMilliseconds(KILL_SETTLE_MILLISECONDS);
  const survivors = descendants.filter(({ pid }) => processIsAlive(pid));
  survivors.forEach(({ pid }) => killQuietly(pid));
  killQuietly(session.pid);
  session.closeInput();
  return { cliPid: session.pid, descendants, groupKill, survivors, ending: await session.finish() };
}

/** The relay spawns the session, feeds it one prompt, prints its pid, and exits once a Bash call started. */
function relaySourceOf(argv, cwd, prompt) {
  return `
    const session = Bun.spawn(${JSON.stringify(argv)}, { cwd: ${JSON.stringify(cwd)}, stdin: 'pipe', stdout: 'pipe', stderr: 'ignore', detached: true });
    console.log(session.pid);
    session.stdin.write(${JSON.stringify(`${JSON.stringify({ type: 'user', message: { role: 'user', content: prompt } })}\n`)});
    session.stdin.flush();
    const decoder = new TextDecoder();
    for await (const chunk of session.stdout) {
      const text = decoder.decode(chunk);
      if (text.includes('"name":"Bash"') || text.includes('"type":"result"')) process.exit(0);
    }
    process.exit(0);
  `;
}

async function sessionAfterReaderDeath(prompt, cwd, markerPath, waitMilliseconds) {
  const argv = [claudeProgramOption(), ...STREAM_ARGUMENTS, '--permission-mode', 'auto'];
  const relay = await runProgram([process.execPath, '-e', relaySourceOf(argv, cwd, prompt)], { timeoutMilliseconds: TOOL_START_WAIT_MILLISECONDS });
  const sessionPid = Number(relay.stdout?.trim());
  const deadline = Date.now() + waitMilliseconds;
  while (Date.now() < deadline && processIsAlive(sessionPid) && !existsSync(markerPath)) await sleepMilliseconds(POLL_MILLISECONDS);
  const observed = { sessionPid, relayExitCode: relay.exitCode ?? null, aliveAfterWait: processIsAlive(sessionPid), markerWritten: existsSync(markerPath) };
  killQuietly(sessionPid);
  return observed;
}

await probe({
  unknown: 'claude-p07-process-groups',
  needsClaudeProgram: true,
  observe: async () => {
    const shortToolFolder = scratchFolder();
    const markerPath = join(shortToolFolder, 'after-watcher-death.txt');
    return {
      killOfCliGroup: await killOfCliGroup(),
      readerDiesDuringLongTool: await sessionAfterReaderDeath(
        `Run this exact command in the foreground with the Bash tool, once: ${waitingCommandOf(LONG_TOOL_SECONDS)}`,
        scratchFolder(),
        join(scratchFolder(), 'never-written.txt'),
        settleMilliseconds(30),
      ),
      readerDiesDuringShortTool: await sessionAfterReaderDeath(
        `Run this exact command in the foreground with the Bash tool, once: ${waitingCommandOf(SHORT_TOOL_SECONDS)}. Then with the Write tool create ${markerPath} holding done. Then stop.`,
        shortToolFolder,
        markerPath,
        Math.min(settleMilliseconds(TURN_FINISH_WAIT_MILLISECONDS / 1000), TURN_FINISH_WAIT_MILLISECONDS),
      ),
    };
  },
});
