/**
 * Holds `.platform-probes/` run the one way it is run, under `process.execPath` with scratch stubs as the Claude and gpgconf programs, so no
 * session starts and no probe reaches the host GnuPG: every script yields one line of the agreed shape, and a line records but never judges.
 * `architecture/PlatformProbes.spec.ts` holds what the folder holds as files.
 */
import {
  chmodSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test,
} from 'bun:test';

import { takeTrappedProgramAttempts }                      from '../src/testing/ProgramTraps.ts';
import { createCanonicalScratchDirectory, runScratchRoot } from '../src/testing/ScratchWorkspace.ts';

const PROBES_FOLDER = join(import.meta.dir, '..', '.platform-probes');
const WHOLE_RUN_TIMEOUT_MILLISECONDS = 180_000;
const EXECUTABLE_FILE_MODE = 0o755;
const DYING_SCRIPT_EXIT_CODE = 3;
/** Cuts every fixed settle wait of a probe to this; the spec reads only each line's shape, never how long a probe waited. */
const SHORT_SETTLE_SECONDS = '0.05';

const STUB_SOURCE = `
import { appendFileSync } from 'node:fs';
const [, , callsFile, ...stubArguments] = process.argv;
appendFileSync(callsFile, JSON.stringify(stubArguments) + '\\n');
const printLine = (line) => console.log(JSON.stringify(line));
printLine({ type: 'system', subtype: 'init', session_id: 'stub-session', claude_code_version: 'stub', tools: [] });
let pendingText = '';
for await (const chunk of Bun.stdin.stream()) {
  pendingText += new TextDecoder().decode(chunk);
  const completeLines = pendingText.split('\\n');
  pendingText = completeLines.pop();
  for (const text of completeLines) {
    const line = JSON.parse(text);
    if (line.type !== 'user') {
      printLine({ type: 'result', subtype: 'success', is_error: false, session_id: 'stub-session', result: JSON.stringify(line) });
    } else if (line.message.content.includes('AskUserQuestion')) {
      const input = { questions: [{ question: 'Which colour?', options: [{ label: 'Red' }, { label: 'Blue' }] }] };
      printLine({ type: 'control_request', request_id: 'stub-request', request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input } });
    } else {
      printLine({ type: 'result', subtype: 'success', is_error: false, session_id: 'stub-session', result: 'stub' });
    }
  }
}
`;

type VerdictLine = {
  unknown:      string;
  os:           string;
  architecture: string;
  bunVersion:   string;
  applicable:   boolean;
  observed:     Record<string, unknown>;
};

let scratchFolder = '';
let stubCallsFile = '';
let resultsFolder = '';

/** Names a socket in the scratch folder for each directory asked, as gpgconf names the host's; the trap on `PATH` stays untouched. */
function writeGpgconfStub(folder: string): string {
  const stubPath = join(folder, 'gpgconf-stub');
  writeFileSync(stubPath, `#!/bin/sh\necho '${join(folder, 'gnupg')}/'"$2"\n`);
  chmodSync(stubPath, EXECUTABLE_FILE_MODE);
  return stubPath;
}

function writeClaudeStub(folder: string, callsFile: string): string {
  const sourcePath = join(folder, 'claude-stub-source.mjs');
  const stubPath = join(folder, 'claude-stub');
  writeFileSync(sourcePath, STUB_SOURCE);
  writeFileSync(stubPath, `#!/bin/sh\nexec '${process.execPath}' '${sourcePath}' '${callsFile}' "$@"\n`);
  chmodSync(stubPath, EXECUTABLE_FILE_MODE);
  return stubPath;
}

async function runAll(claudeProgramArguments: readonly string[], only: readonly string[] = [], runAllPath = join(PROBES_FOLDER, 'run-all.js')) {
  const child = Bun.spawn(
    [
      process.execPath,
      runAllPath,
      '--settle-seconds',
      SHORT_SETTLE_SECONDS,
      '--results-folder',
      resultsFolder,
      '--scratch-root',
      runScratchRoot(),
      ...claudeProgramArguments,
      ...only,
    ],
    {
      cwd: scratchFolder, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore'
    },
  );
  const stdout = await new Response(child.stdout).text();
  const exitCode = await child.exited;
  return { exitCode, verdicts: stdout.trim().split('\n').map((line) => JSON.parse(line) as VerdictLine) };
}

function probeScriptNames(): string[] {
  return readdirSync(PROBES_FOLDER).filter((fileName) => fileName.endsWith('.js') && fileName !== 'run-all.js').map((fileName) => fileName.slice(0, -'.js'.length));
}

describe('the platform probes', () => {
  let stubRun: Awaited<ReturnType<typeof runAll>>;

  beforeAll(async () => {
    scratchFolder = createCanonicalScratchDirectory('platform-probes');
    stubCallsFile = join(scratchFolder, 'stub-calls.jsonl');
    resultsFolder = join(scratchFolder, 'results');
    stubRun = await runAll(['--claude-program', writeClaudeStub(scratchFolder, stubCallsFile), '--gpgconf-program', writeGpgconfStub(scratchFolder)]);
  }, WHOLE_RUN_TIMEOUT_MILLISECONDS);

  afterAll(() => {
    rmSync(scratchFolder, { recursive: true, force: true });
  });

  test('a whole run exits 0 with one parseable line per script', () => {
    expect(stubRun.exitCode).toBe(0);
    expect(stubRun.verdicts.map((verdict) => verdict.unknown).sort()).toEqual(probeScriptNames().map((name) => name.replace(/^os-/u, '')).sort());
  });

  test('every line carries the shared fields, and an applicable line and an inapplicable line both occur', () => {
    for (const verdict of stubRun.verdicts) {
      expect(verdict.os).toBe(process.platform);
      expect(verdict.architecture).toBe(process.arch);
      expect(verdict.bunVersion).toBe(Bun.version);
      expect(typeof verdict.applicable).toBe('boolean');
      expect(typeof verdict.observed).toBe('object');
    }
    expect(stubRun.verdicts.filter((verdict) => verdict.applicable).length).toBeGreaterThan(0);
    const inapplicable = stubRun.verdicts.filter((verdict) => !verdict.applicable);
    expect(inapplicable.length).toBeGreaterThan(0);
    for (const verdict of inapplicable) expect(typeof verdict.observed['whyNotApplicable']).toBe('string');
  });

  test('no script died, threw or printed nothing under the stub', () => {
    const faulted = stubRun.verdicts
      .filter((verdict) => 'probeThrew' in verdict.observed || 'scriptPrintedNoVerdict' in verdict.observed)
      .map((verdict) => ({ unknown: verdict.unknown, observed: verdict.observed }));
    expect(faulted).toEqual([]);
  });

  test('a line records and never judges: no judgement key at any depth', () => {
    const judgementKey = /"(?:passed|failed|pass|fail|ok|success)":/u;
    for (const verdict of stubRun.verdicts) expect(JSON.stringify(verdict.observed)).not.toMatch(judgementKey);
  });

  test('every session went to the stub through the flag, no trap on PATH saw a call, and the numbered probes used stream-json', () => {
    expect(takeTrappedProgramAttempts()).toEqual([]);
    const calls = readFileSync(stubCallsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
    expect(calls.length).toBeGreaterThanOrEqual(probeScriptNames().filter((name) => name.startsWith('claude-p')).length);
    const streamCalls = calls.filter((stubArguments) => stubArguments.includes('stream-json'));
    expect(streamCalls.length).toBe(calls.filter((stubArguments) => stubArguments[0] === '-p').length);
    for (const stubArguments of streamCalls) expect(stubArguments[0]).toBe('-p');
  });

  test('the live-answer probe wrote its answer back on the session', () => {
    const liveAnswer = stubRun.verdicts.find((verdict) => verdict.unknown === 'claude-p01-live-answer');
    const results = liveAnswer?.observed['results'] as { result: string }[];
    expect(results[0]?.result).toContain('"answers":{"Which colour?":"Blue"}');
  });

  test('the stream fixture lies beside the verdicts', () => {
    const fixtureStem = join(resultsFolder, `stream-fixture-${process.platform}-${process.arch}`);
    expect(existsSync(`${fixtureStem}.stdout.jsonl`)).toBe(true);
    expect(existsSync(`${fixtureStem}.stdin.jsonl`)).toBe(true);
    expect(readFileSync(join(resultsFolder, 'verdicts.jsonl'), 'utf8').trim().split('\n').length).toBe(stubRun.verdicts.length);
  });

  test('without --claude-program a session probe is inapplicable and spends nothing', async () => {
    const { exitCode, verdicts } = await runAll([], ['--only', 'claude-p01']);
    expect(exitCode).toBe(0);
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]?.applicable).toBe(false);
  });

  test('a program that will not start is recorded by the fixture probe, its spawn error kept', async () => {
    const missingProgram = join(scratchFolder, 'no-such-claude');
    const { verdicts } = await runAll(['--claude-program', missingProgram], ['--only', 'host-stream-fixture']);
    const spawnError = verdicts[0]?.observed['spawnError'] as { code: string } | undefined;
    expect(spawnError?.code).toBe('ENOENT');
  });

  test('a pid a dead child never printed reads as gone, and killing it leaves the probe\'s own process group alone', async () => {
    const programsPath = join(PROBES_FOLDER, 'support', 'programs.js');
    const source = `
      const { killQuietly, processIsAlive } = await import(${JSON.stringify(programsPath)});
      const pidOfSilentChild = Number('');
      console.log(processIsAlive(pidOfSilentChild));
      killQuietly(pidOfSilentChild);
      console.log('survived');
    `;
    const child = Bun.spawn([process.execPath, '-e', source], {
      detached: true, stdin: 'ignore', stdout: 'pipe', stderr: 'ignore'
    });
    expect(await new Response(child.stdout).text()).toBe('false\nsurvived\n');
    expect(await child.exited).toBe(0);
  });

  test('a script that dies gets a line of its own, and the scripts after it still run', async () => {
    const folderCopy = join(scratchFolder, 'probes-copy');
    cpSync(join(PROBES_FOLDER, 'support'), join(folderCopy, 'support'), { recursive: true });
    cpSync(join(PROBES_FOLDER, 'run-all.js'), join(folderCopy, 'run-all.js'));
    cpSync(join(PROBES_FOLDER, 'os-glob-separators.js'), join(folderCopy, 'os-glob-separators.js'));
    writeFileSync(join(folderCopy, 'os-a-dying-script.js'), `console.error('dying'); process.exit(${DYING_SCRIPT_EXIT_CODE});\n`);
    const { verdicts } = await runAll([], [], join(folderCopy, 'run-all.js'));
    expect(verdicts.map((verdict) => verdict.unknown)).toEqual(['a-dying-script', 'glob-separators']);
    expect(verdicts[0]?.observed).toMatchObject({ scriptPrintedNoVerdict: true, exitCode: DYING_SCRIPT_EXIT_CODE, stderr: 'dying\n' });
  });

  test('a script that stops early still removes its scratch folder, which lies in the given scratch root', async () => {
    const folderCopy = join(scratchFolder, 'early-stop-copy');
    cpSync(join(PROBES_FOLDER, 'support'), join(folderCopy, 'support'), { recursive: true });
    cpSync(join(PROBES_FOLDER, 'run-all.js'), join(folderCopy, 'run-all.js'));
    writeFileSync(
      join(folderCopy, 'os-an-early-stop.js'),
      `import { scratchFolder } from './support/scratch.js';\nconsole.error(scratchFolder()); process.exit(${DYING_SCRIPT_EXIT_CODE});\n`,
    );
    const { verdicts } = await runAll([], [], join(folderCopy, 'run-all.js'));
    const madeFolder = String((verdicts[0]?.observed as { stderr: string }).stderr).trim();
    expect(madeFolder.startsWith(join(realpathSync(runScratchRoot()), 'platform-probe-'))).toBe(true);
    expect(existsSync(madeFolder)).toBe(false);
  });

});
