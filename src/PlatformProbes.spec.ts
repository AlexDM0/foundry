/**
 * Holds `.platform-probes/` through the one way it is run: the whole folder under `process.execPath`, with a scratch stub as the Claude program,
 * so no real session starts. What matters: every script yields one line of the agreed shape, an applicable line and an inapplicable line both;
 * every unknown the ticket named and every numbered probe has a script; a line records and never judges; and the folder stays apart from `src/`.
 */
import {
  chmodSync,
  existsSync,
  readdirSync,
  readFileSync,
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

import { takeClaudeLaunchAttempts }        from './testing/ClaudeLaunchTrap.ts';
import { createCanonicalScratchDirectory } from './testing/ScratchWorkspace.ts';

const PROBES_FOLDER = join(import.meta.dir, '..', '.platform-probes');
const WHOLE_RUN_TIMEOUT_MILLISECONDS = 180_000;
const EXECUTABLE_FILE_MODE = 0o755;

const OPERATING_SYSTEM_UNKNOWNS = [
  'absolute-git-dir',
  'boot-identity',
  'bun-build-output-paths',
  'busybox-ps-lstart',
  'bwrap-user-namespaces',
  'detached-console-programs',
  'exit-code-extremes',
  'fast-forward-held-file',
  'ffi-process-times',
  'ffi-toolhelp-snapshot',
  'glob-separators',
  'held-file-write-loop',
  'job-object-nesting',
  'mount-point-residue',
  'negative-pid-kill',
  'no-orphans-shim',
  'path-variable-spelling',
  'pipe-busy-error',
  'pipe-half-close-latency',
  'pipe-listen-connect',
  'pipe-release-after-crash',
  'pipe-second-user',
  'realpath-short-path',
  'remove-read-only-git-objects',
  'rename-onto-held-file',
  'sandbox-exec-nested',
  'signal-code-after-kill',
  'sigterm-handler',
  'spawn-without-path',
  'symlink-permission',
  'task-scheduler-logon',
  'watch-later-folders',
  'watch-user-limit',
  'worktree-remove-held-cwd',
];

const HOST_UNKNOWNS = [
  'host-common-git-writable', 'host-deny-rule-form', 'host-fail-if-unavailable', 'host-npm-global-resolution', 'host-path-forms', 'host-stream-fixture',
];

const NUMBERED_PROBES = [
  'p01-live-answer',
  'p02-claude-md-walk',
  'p03-disable-slash-commands',
  'p04-network-guard',
  'p05-anchored-rules',
  'p06-resume',
  'p07-process-groups',
  'p08-mid-turn-line',
  'p09-agents-and-memory',
  'p10-rate-limit-events',
  'p11-product-owner-session',
  'p13-settings-local',
  'p14-signing-and-ref-denies',
  'p15-gates-under-sandbox',
  'p16-setting-sources',
  'p17-block-outside-reads',
].map((probeName) => `claude-${probeName}`);

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

function writeClaudeStub(folder: string, callsFile: string): string {
  const sourcePath = join(folder, 'claude-stub-source.mjs');
  const stubPath = join(folder, 'claude-stub');
  writeFileSync(sourcePath, STUB_SOURCE);
  writeFileSync(stubPath, `#!/bin/sh\nexec '${process.execPath}' '${sourcePath}' '${callsFile}' "$@"\n`);
  chmodSync(stubPath, EXECUTABLE_FILE_MODE);
  return stubPath;
}

async function runAll(claudeProgramArguments: readonly string[], only: readonly string[] = []) {
  const child = Bun.spawn(
    [process.execPath, join(PROBES_FOLDER, 'run-all.js'), '--settle-seconds', '0', '--results-folder', resultsFolder, ...claudeProgramArguments, ...only],
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

function everyProbeSource(): { fileName: string; source: string }[] {
  const supportFolder = join(PROBES_FOLDER, 'support');
  return [
    ...readdirSync(PROBES_FOLDER).filter((fileName) => fileName.endsWith('.js')).map((fileName) => join(PROBES_FOLDER, fileName)),
    ...readdirSync(supportFolder).map((fileName) => join(supportFolder, fileName)),
  ].map((path) => ({ fileName: path, source: readFileSync(path, 'utf8') }));
}

describe('the platform probes', () => {
  let stubRun: Awaited<ReturnType<typeof runAll>>;

  beforeAll(async () => {
    scratchFolder = createCanonicalScratchDirectory('platform-probes');
    stubCallsFile = join(scratchFolder, 'stub-calls.jsonl');
    resultsFolder = join(scratchFolder, 'results');
    stubRun = await runAll(['--claude-program', writeClaudeStub(scratchFolder, stubCallsFile)]);
  }, WHOLE_RUN_TIMEOUT_MILLISECONDS);

  afterAll(() => {
    rmSync(scratchFolder, { recursive: true, force: true });
  });

  test('a whole run exits 0 with one parseable line per script', () => {
    expect(stubRun.exitCode).toBe(0);
    expect(stubRun.verdicts.map((verdict) => verdict.unknown).sort()).toEqual(probeScriptNames().map((name) => name.replace(/^os-/u, '')).sort());
  });

  test('every unknown of the ticket and every numbered probe has a script', () => {
    const scriptNames = probeScriptNames();
    expect(scriptNames.sort()).toEqual([...OPERATING_SYSTEM_UNKNOWNS.map((unknown) => `os-${unknown}`), ...HOST_UNKNOWNS, ...NUMBERED_PROBES].sort());
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

  test('every session went to the stub through the flag, the trap on PATH saw none, and the numbered probes used stream-json', () => {
    expect(takeClaudeLaunchAttempts()).toEqual([]);
    const calls = readFileSync(stubCallsFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as string[]);
    expect(calls.length).toBeGreaterThanOrEqual(NUMBERED_PROBES.length);
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

  test('no script imports from the typed programs', () => {
    const typedProgramImport = /from '[^']*(?:\/src\/|\/cli\/|\/bridge\/|\.ts')/u;
    const sources = everyProbeSource();
    expect(sources.length).toBeGreaterThan(NUMBERED_PROBES.length);
    for (const { source } of sources) expect(source).not.toMatch(typedProgramImport);
  });

  test('the folder states the command, that a run gates nothing, and where results go', () => {
    const readme = readFileSync(join(PROBES_FOLDER, 'README.md'), 'utf8');
    expect(readme).toContain('bun .platform-probes/run-all.js');
    expect(readme).toContain('gates no ticket');
    expect(readme).toContain('per-OS column of `docs/development/overseer-claude-probe.md`');
  });
});
