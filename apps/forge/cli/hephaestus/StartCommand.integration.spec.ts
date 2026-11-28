/**
 * Hephaestus's start, lock and stop through real child processes, since a Hephaestus holds its process until stopped: two starters leave one
 * serving, a dead lock is taken over, an overtaken generation exits 2, and the verbs agree with the lock. Every Hephaestus binds `--port 0` and
 * answers git from one recorded set.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { HEPHAESTUS_LOCK_FORMAT_VERSION }                 from '../../src/adapters/hephaestus-lock/HephaestusLockIngestion.ts';
import { childFilesOf, talosRecordPathOf }                from '../../src/domain/talos/TalosFiles.ts';
import { type TalosRecord, talosRecordOf }                from '../../src/domain/talos/TalosRecord.ts';
import { processIsGone }                                  from '../../src/lib/process-identity/ProcessIdentity.ts';
import { CodeVersion }                                    from '../../src/services/hephaestus/CodeVersion.ts';
import { workspacePathsFor }                              from '../../src/services/tracker/Workspace.ts';
import { fakeAgentVariableOf }                            from '../../src/shared/Environment.ts';
import { PRODUCT_NAMES }                                  from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../src/testing/ChildProcessCaseTimeout.ts';
import { startScratchBoardTalos }                         from '../../src/testing/DrivePassHarness.ts';
import { FAKE_AGENT_VENDOR }                              from '../../src/testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                            from '../../src/testing/NativePlatformPorts.ts';
import { PlantedChild }                                   from '../../src/testing/PlantedChild.ts';
import { stopProcessesReachingInto }                      from '../../src/testing/ProcessesInFolder.ts';
import { type RecordedGitStage, useRecordedGit }          from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                         from '../../src/testing/TalosChildReadings.ts';
import { describeWhenGitIsRecorded }                      from '../../src/testing/ToolGuard.ts';
import { firstValueOf, waitUntil }                        from '../../src/testing/WaitUntil.ts';
import {
  type AgentProgressResult,
  runAgentProgressBesideRecordedGit,
  shareRecordedGitAnswers,
  type SharedRecordedGitAnswers,
  startAgentProgress,
  type StartedAgentProgress
} from '../testing/CliProcess.ts';
import { createInitializedRecordedGitRepository } from '../testing/InitializedScratchRepository.ts';
import {
  COMMON_FOLDER_AT_THE_ROOT,
  COMMON_FOLDER_OUTSIDE,
  idleHephaestusAnswersIn,
  REFRESH_OF_AN_IGNORING_REPOSITORY
} from '../testing/RecordedGitStages.ts';
import { preflightFailureOf } from './HephaestusForeground.ts';

const ports = nativePlatformPorts();
const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const OWNER_ONLY_FILE_MODE = 0o600;
const PERMISSION_BITS      = 0o777;

let repositoryDirectory = '';
let homeDirectory       = '';

function hephaestusDirectory(): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'hephaestus');
}

function hephaestusLockFileNames(): string[] {
  return existsSync(hephaestusDirectory()) ? readdirSync(hephaestusDirectory()).filter((fileName) => /^lock-\d+\.json$/.test(fileName)).sort() : [];
}

function hephaestusLockOf(fileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(hephaestusDirectory(), fileName), 'utf8')) as Record<string, unknown>;
}

function hephaestusLogText(): string {
  const logFilePath = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'hephaestus.log');
  return existsSync(logFilePath) ? readFileSync(logFilePath, 'utf8') : '';
}

function storedLogKindsOf(repository: string): string[] {
  return readFileSync(join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl'), 'utf8').split('\n').filter((line) => line !== '')
    .map((line) => (JSON.parse(line) as { kind: string }).kind);
}

/** This process's pid with a start no process ever had: a Hephaestus lock that reads as dead without depending on a pid being free. */
function plantDeadLock(generation: number): void {
  mkdirSync(hephaestusDirectory(), { recursive: true });
  writeFileSync(join(hephaestusDirectory(), `lock-${generation}.json`), JSON.stringify({
    version:              HEPHAESTUS_LOCK_FORMAT_VERSION,
    processId:            process.pid,
    processStartStamp:    '1',
    bootIdentity:         'example-boot',
    port:                 1,
    url:                  'http://127.0.0.1:1/',
    tokenFile:            join(hephaestusDirectory(), 'token'),
    codeVersion:          'code-example',
    installVersion:       1,
    talosProtocolVersion: 1,
  }));
}

interface JobOnTheBoard {
  id:            string;
  childInstance: number;
}

function jobsOnTheBoard(): readonly JobOnTheBoard[] {
  const progress = JSON.parse(readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'progress.json'), 'utf8')) as { jobs?: JobOnTheBoard[] };
  return progress.jobs ?? [];
}

/** The Assistant is the job these cases list, and a new board has it off: it is switched on over a pipeline with no gates. */
async function turnTheAssistantOn(): Promise<void> {
  for (const gateVerb of [['gate', 'none'], ['gate', 'assistant', 'on']]) {
    const switched = await runAgentProgress(gateVerb, { currentDirectory: repositoryDirectory, homeDirectory });
    expect(switched.exitCode, switched.standardError).toBe(0);
  }
}

/**
 * The event log of the job the board lists now, its current instance's child record planted as a running child of Talos. A job whose
 * session ended may be replaced at a later generation, so a fixed job id would name a job a later generation no longer lists.
 */
async function plantedEventLogPathOfTheListedJob(): Promise<string> {
  const listedJob = await firstValueOf(() => jobsOnTheBoard()[0], () => `the board listing a job:\n${hephaestusLogText()}`);
  const trackerDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER);
  const child = { boardFolder: trackerDirectory, childFolder: `jobs/${listedJob.id}`, instance: listedJob.childInstance };
  PlantedChild.plantChildRecord(child);
  return childFilesOf(child.boardFolder, child.childFolder, child.instance).eventLogPath;
}

/** The board's Talos record of the first start; `null` before Talos claimed it. */
function firstTalosRecord(): ReturnType<typeof talosRecordOf> | null {
  const recordPath = talosRecordPathOf(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER), 1);
  return existsSync(recordPath) ? talosRecordOf(readFileSync(recordPath, 'utf8')) : null;
}

/** The board's Talos record of that start, when Talos claimed it and it reads. */
function talosRecordAt(startNumber: number): TalosRecord | null {
  const recordPath = talosRecordPathOf(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER), startNumber);
  const reading = existsSync(recordPath) ? talosRecordOf(readFileSync(recordPath, 'utf8')) : null;
  return reading?.verdict === 'read' ? reading.record : null;
}

/** The isolation check here asks git for the root of each scratch folder it is handed that holds no tracker and lies in no repository. */
function isolationCheckOf(currentDirectory: string): RecordedGitStage {
  return currentDirectory === repositoryDirectory ? [COMMON_FOLDER_OUTSIDE] : [COMMON_FOLDER_OUTSIDE, COMMON_FOLDER_OUTSIDE];
}

/** Every binary and every Hephaestus it starts answers git from one set: the idle Hephaestus's calls, the root, and the refresh `update` makes. */
function hephaestusAnswersIn(repository: string): RecordedGitStage {
  return [...idleHephaestusAnswersIn(repository), COMMON_FOLDER_AT_THE_ROOT, ...REFRESH_OF_AN_IGNORING_REPOSITORY];
}

async function runAgentProgress(
  commandLineArguments: readonly string[], options: { currentDirectory: string; homeDirectory: string },
): Promise<AgentProgressResult> {
  return await runAgentProgressBesideRecordedGit(
    recordedGit, isolationCheckOf(options.currentDirectory), commandLineArguments, { ...options, sharedRecordedGitAnswers: sharedAnswersOfThisCase() },
  );
}

async function startHephaestus(environment?: Record<string, string>): Promise<StartedAgentProgress> {
  return await recordedGit.playStage([COMMON_FOLDER_OUTSIDE], async () => startAgentProgress(['start', '--foreground', '--port', '0'], {
    currentDirectory:         repositoryDirectory,
    homeDirectory,
    sharedRecordedGitAnswers: sharedAnswersOfThisCase(),
    ...(environment === undefined ? {} : { environment }),
  }));
}

function sharedAnswersOfThisCase(): SharedRecordedGitAnswers {
  if (sharedAnswers === null) throw new Error('no recorded git answers are shared outside a case');
  return sharedAnswers;
}

async function stopHephaestus(): Promise<void> {
  const stopped = await runAgentProgress(['stop'], { currentDirectory: repositoryDirectory, homeDirectory });
  expect(stopped.exitCode, stopped.standardError).toBe(0);
}

let sharedAnswers: SharedRecordedGitAnswers | null = null;

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('hephaestus', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  homeDirectory       = createScratchDirectory('start-home');
  sharedAnswers       = shareRecordedGitAnswers(hephaestusAnswersIn(repositoryDirectory));
});

afterEach(async () => {
  await runAgentProgress(['stop'], { currentDirectory: repositoryDirectory, homeDirectory });
  // A case its deadline cut short during a restart leaves a successor no Hephaestus lock names yet, which `stop` cannot reach.
  await stopProcessesReachingInto(repositoryDirectory);
  const answers = sharedAnswersOfThisCase();
  sharedAnswers = null;
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(homeDirectory);
  try {
    answers.requireEveryCallAnswered();
  } finally {
    answers.remove();
  }
});

describeWhenGitIsRecorded('run in the foreground', () => {
  test('a SIGHUP, as a closed terminal delivers, ends a foreground Hephaestus through its own stop', async () => {
    const hephaestus = await startHephaestus();
    expect(await hephaestus.firstOutputLine).not.toBeNull();

    process.kill(hephaestus.processId, 'SIGHUP');
    const finished = await hephaestus.finished;

    expect(finished.exitCode, `${finished.standardError}\n${hephaestusLogText()}`).toBe(0);
    expect(storedLogKindsOf(repositoryDirectory)).toContain('hephaestus-stopped');
    expect(hephaestusLockFileNames()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('two starters at once leave exactly one Hephaestus serving; the other refuses already-running or contended at exit 1', async () => {
    const starters = [await startHephaestus(), await startHephaestus()];
    const firstLines = await Promise.all(starters.map((starter) => Promise.race([starter.firstOutputLine, starter.finished.then(() => null)])));
    const servingIndex = firstLines.findIndex((line) => line !== null);
    expect(servingIndex).toBeGreaterThanOrEqual(0);
    const refused = await (starters[1 - servingIndex]?.finished ?? Promise.reject(new Error('no second starter')));
    expect(refused.exitCode, refused.standardError).toBe(1);
    expect(refused.standardError).toMatch(/A Hephaestus already serves this board at http:\/\/127\.0\.0\.1:\d+\/|Another Hephaestus started/);

    const url = firstLines[servingIndex] ?? '';
    expect(hephaestusLockFileNames()).toEqual(['lock-1.json']);
    const hephaestusLock = hephaestusLockOf('lock-1.json');
    expect(hephaestusLock).toMatchObject({ processId: starters[servingIndex]?.processId, url, codeVersion: CodeVersion.onDisk() });
    expect(Object.keys(hephaestusLock)).toEqual([
      'version', 'processId', 'processStartStamp', 'bootIdentity', 'port', 'url', 'tokenFile', 'codeVersion', 'installVersion', 'talosProtocolVersion',
    ]);
    expect(existsSync(join(hephaestusDirectory(), 'token'))).toBe(false);
    expect(statSync(hephaestusLock['tokenFile'] as string).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FILE_MODE);
    const identity = await (await fetch(new URL('api/identity', url))).json() as Record<string, unknown>;
    expect(identity).toMatchObject({ application: PRODUCT_NAMES.PROGRAM, project: 'Example Agency', processId: hephaestusLock['processId'] });

    await stopHephaestus();
    expect((await starters[servingIndex]?.finished)?.exitCode).toBe(0);
    expect(hephaestusLockFileNames()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Hephaestus lock naming a dead process is replaced by the next generation, which removes the older one', async () => {
    plantDeadLock(3);
    const hephaestus = await startHephaestus();
    expect(await hephaestus.firstOutputLine).toStartWith('http://127.0.0.1:');
    expect(hephaestusLockFileNames()).toEqual(['lock-4.json']);
    await stopHephaestus();
    expect((await hephaestus.finished).exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Hephaestus whose generation a newer Hephaestus lock overtook stops hephaestus-lock-taken at exit 2 and unlinks nothing', async () => {
    const hephaestus = await startHephaestus();
    expect(await hephaestus.firstOutputLine).toStartWith('http://127.0.0.1:');
    plantDeadLock(2);
    const finished = await hephaestus.finished;
    expect(finished.exitCode).toBe(2);
    expect(finished.standardError).toContain('A newer Hephaestus took this board over');
    expect(hephaestusLockFileNames()).toEqual(['lock-1.json', 'lock-2.json']);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Hephaestus whose data folder watch fails to start gives its URL to no output', async () => {
    const worktreesFolder = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
    rmSync(worktreesFolder, { recursive: true, force: true });
    // A file where the watch creates its Hatch root makes the watch start throw, after the bind and the logged URL.
    writeFileSync(worktreesFolder, 'not a folder\n');

    const finished = await (await startHephaestus()).finished;

    expect(finished.exitCode, finished.standardError).toBe(2);
    const servedUrl = /Hephaestus serving (http:\/\/127\.0\.0\.1:\d+\/)/.exec(hephaestusLogText())?.[1] ?? null;
    expect(servedUrl, hephaestusLogText()).not.toBeNull();
    expect(finished.standardOutput).toBe('');
    expect(hephaestusLockFileNames()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

/** The vendor a Hephaestus announced in its log since `fromOffset`: the adapter its process resolved. */
function announcedVendorSince(fromOffset: number): string | null {
  const logText = readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'hephaestus.log'), 'utf8').slice(fromOffset);
  return /, agents ([\w-]+)\)\./.exec(logText)?.[1] ?? null;
}

describeWhenGitIsRecorded('the agent adapter of a spec-spawned hephaestus', () => {
  test('is the fake agent by default, and stays the fake agent when a spec\'s environment plants the fake-agent switch off', async () => {
    const hephaestus = await startHephaestus();
    expect(await hephaestus.firstOutputLine).toStartWith('http://127.0.0.1:');
    expect(announcedVendorSince(0)).toBe(FAKE_AGENT_VENDOR);
    await stopHephaestus();
    expect((await hephaestus.finished).exitCode).toBe(0);

    const logLength = readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'hephaestus.log'), 'utf8').length;
    const switchedOff = { [fakeAgentVariableOf(PRODUCT_NAMES)]: '0' };
    const planted     = await startHephaestus(switchedOff);
    expect(await planted.firstOutputLine).toStartWith('http://127.0.0.1:');
    expect(announcedVendorSince(logLength)).toBe(FAKE_AGENT_VENDOR);
    await stopHephaestus();
    expect((await planted.finished).exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describeWhenGitIsRecorded('run start, status, restart and stop', () => {
  test('start --repository run from another directory serves that repository\'s board, as a Windows Run entry starts it', async () => {
    const startArguments = ['start', '--port', '0', '--repository', repositoryDirectory, '--json'];
    const detached = await runAgentProgress(startArguments, { currentDirectory: homeDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };
    expect(hephaestusLockFileNames()).toEqual(['lock-1.json']);
    expect(hephaestusLockOf('lock-1.json')['url']).toBe(url);
    await stopHephaestus();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('start twice answers started true, then false, both at exit 0 with one Hephaestus live, and stop answers done', async () => {
    const first = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(first.exitCode, first.standardError).toBe(0);
    const firstAnswer = JSON.parse(first.standardOutput) as Record<string, unknown>;
    expect(firstAnswer).toEqual({
      answerVersion:  3,
      started:        true,
      url:            expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/$/),
      generation:     1,
      trackerId:      expect.any(String),
      codeVersion:    CodeVersion.onDisk(),
      installVersion: expect.any(Number),
      contracts:      { summary: 3, monitor: 6, control: 3 },
    });
    const second = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(second.exitCode, second.standardError).toBe(0);
    expect(JSON.parse(second.standardOutput)).toEqual({ ...firstAnswer, started: false });
    expect(hephaestusLockFileNames()).toEqual(['lock-1.json']);
    const stopped = await runAgentProgress(['stop', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(stopped.standardOutput)).toEqual({ answerVersion: 3, outcome: 'done' });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a detached Hephaestus prints its URL once it answers; status reports it serving; restart keeps its port under a new process', async () => {
    const detached = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };

    const status = await runAgentProgress(['status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(status.standardOutput)).toMatchObject({
      hephaestus: {
        state: 'serving', paused: true, url, codeVersionOnDisk: CodeVersion.onDisk(), codeVersionInMemory: CodeVersion.onDisk(),
      },
    });

    const processBefore = hephaestusLockOf(hephaestusLockFileNames()[0] ?? '')['processId'];
    const restarted = await runAgentProgress(['restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(restarted.exitCode, `${restarted.standardError}\n${hephaestusLogText()}`).toBe(0);
    expect(JSON.parse(restarted.standardOutput)).toEqual({ outcome: 'done', url, codeVersion: CodeVersion.onDisk() });
    expect(hephaestusLockFileNames()).toEqual(['lock-2.json']);
    expect(hephaestusLockOf(hephaestusLockFileNames()[0] ?? '')['processId']).not.toBe(processBefore);
    expect(storedLogKindsOf(repositoryDirectory).filter((kind) => kind.startsWith('hephaestus-'))).toEqual(['hephaestus-started', 'hephaestus-stopped', 'hephaestus-started']);

    const stopped = await runAgentProgress(['stop', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(stopped.standardOutput)).toEqual({ answerVersion: 3, outcome: 'done' });
    expect(hephaestusLockFileNames()).toEqual([]);
    const statusAfter = await runAgentProgress(['status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(statusAfter.standardOutput)).toMatchObject({ hephaestus: { state: 'down', url: null } });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a second restart command while a restart runs starts no second restart, and the first completes', async () => {
    const detached = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };
    const token = readFileSync(hephaestusLockOf('lock-1.json')['tokenFile'] as string, 'utf8').trim();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const body    = JSON.stringify({ kind: 'hephaestus-restart', now: false });

    const restarting = runAgentProgress(['restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    // Whichever command arrives second finds the restart running; the listener may be closed by then, which answers nothing.
    await fetch(new URL('api/commands', url), { method: 'POST', headers, body }).catch(() => null);

    const restarted = await restarting;
    expect(restarted.exitCode, `${restarted.standardError}\n${hephaestusLogText()}`).toBe(0);
    expect(hephaestusLockFileNames()).toEqual(['lock-2.json']);
    expect(storedLogKindsOf(repositoryDirectory).filter((kind) => kind === 'hephaestus-started')).toHaveLength(1 + 1);
    await stopHephaestus();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a preflight that fails a step: restart exits 1 restart-failed and the old Hephaestus keeps driving, logging it and warning', async () => {
    await turnTheAssistantOn();
    const detached = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };
    const hephaestusLockBefore = hephaestusLockOf('lock-1.json');
    // The preflight reads every launched child's event log: a malformed line in the listed job's fails that step.
    appendFileSync(await plantedEventLogPathOfTheListedJob(), 'not an event\n');

    const restarted = await runAgentProgress(['restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(restarted.exitCode, `${restarted.standardError}\n${hephaestusLogText()}`).toBe(1);
    expect(`${restarted.standardOutput}${restarted.standardError}`).toContain('failed at read-child-records');
    expect(hephaestusLockFileNames()).toEqual(['lock-1.json']);
    expect(hephaestusLockOf('lock-1.json')).toEqual(hephaestusLockBefore);
    expect(storedLogKindsOf(repositoryDirectory)).toContain('restart-failed');

    const status = await runAgentProgress(['status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(status.standardOutput)).toMatchObject({ hephaestus: { url, restartWarning: { step: 'read-child-records' } } });
    expect((await runAgentProgress(['status'], { currentDirectory: repositoryDirectory, homeDirectory })).standardOutput)
      .toContain('warning: the restart to code');
    await stopHephaestus();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('update ends by handing a live Hephaestus on other code to the code on disk; a failed restart exits 1, its install writes standing', async () => {
    const withNoHephaestus = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(withNoHephaestus.exitCode, withNoHephaestus.standardError).toBe(0);
    expect(withNoHephaestus.standardOutput).not.toContain('Handing Hephaestus');

    await turnTheAssistantOn();
    const detached = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const onTheSameCode = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(onTheSameCode.standardOutput).not.toContain('Handing Hephaestus');

    // The live Hephaestus's Hephaestus lock says it runs older code, as after a pull into the checkout the binary links to.
    writeFileSync(join(hephaestusDirectory(), 'lock-1.json'), `${JSON.stringify({ ...hephaestusLockOf('lock-1.json'), codeVersion: 'code-older' })}\n`);
    const updated = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(updated.exitCode, `${updated.standardError}\n${hephaestusLogText()}`).toBe(0);
    expect(updated.standardOutput).toContain(`Hephaestus handed over to code ${CodeVersion.onDisk()}`);
    expect(hephaestusLockFileNames()).toEqual(['lock-2.json']);

    writeFileSync(join(hephaestusDirectory(), 'lock-2.json'), `${JSON.stringify({ ...hephaestusLockOf('lock-2.json'), codeVersion: 'code-older' })}\n`);
    appendFileSync(await plantedEventLogPathOfTheListedJob(), 'not an event\n');
    const manifestPath = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'version.json');
    rmSync(manifestPath);
    const failed = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(failed.exitCode, failed.standardError).toBe(1);
    expect(failed.standardError).toContain('failed at read-child-records');
    expect(existsSync(manifestPath)).toBe(true);
    expect(hephaestusLockFileNames()).toEqual(['lock-2.json']);
    await stopHephaestus();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('stop --now stops a live line of Talos before Hephaestus exits; a plain stop leaves it running', async () => {
    const monitorFolder = createScratchDirectory('h');
    const trackerDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER);
    try {
      const startHephaestusDetached = async (): Promise<void> => {
        const detached = await runAgentProgress(['start', '--port', '0'], { currentDirectory: repositoryDirectory, homeDirectory });
        expect(detached.exitCode, detached.standardError).toBe(0);
      };
      await startHephaestusDetached();
      // Hephaestus's own Talos serves, so this attaches to it, as a second Hephaestus would.
      const boardTalos = await startScratchBoardTalos({
        workspace: workspacePathsFor(repositoryDirectory), platformPorts: ports, monitorFolder, log: () => undefined
      });
      const lineFolder = join(trackerDirectory, 'jobs', 'J-example', 'install-1');
      const children = talosChildReadingsWith(ports, trackerDirectory);
      const launched = await boardTalos.connection()?.send({
        kind:   'launch',
        launch: {
          childFolder:                    'jobs/J-example/install-1',
          instance:                       1,
          kind:                           'line',
          label:                          'J-example/install-1',
          argv:                           [process.execPath, '-e', 'setInterval(() => undefined, 1000);'],
          environment:                    {},
          environmentFromTalos:           {},
          workingDirectory:               repositoryDirectory,
          verbatimArguments:              false,
          standingReplies:                [],
          closingLine:                    null,
          endingPatterns:                 [],
          quitAtTurnEnd:                  null,
          treeStopAtEndGraceMilliseconds: null,
          timeBoundMilliseconds:          null,
        },
      });
      expect(launched).toMatchObject({ verdict: 'done' });
      await waitUntil(() => children.livenessOf(lineFolder, 1).verdict === 'live' && children.recordOf(lineFolder, 1)?.state === 'running', 'the line running');
      const lineProcessId = children.recordOf(lineFolder, 1)?.childProcess?.processId;
      if (lineProcessId === undefined) throw new Error('the line did not start');

      await stopHephaestus();
      expect(children.livenessOf(lineFolder, 1).verdict).toBe('live');

      await startHephaestusDetached();
      const stoppedNow = await runAgentProgress(['stop', '--now'], { currentDirectory: repositoryDirectory, homeDirectory });
      expect(stoppedNow.exitCode, stoppedNow.standardError).toBe(0);
      await waitUntil(() => children.livenessOf(lineFolder, 1).verdict === 'ended', () => `the line ending:\n${hephaestusLogText()}`);
      await waitUntil(() => processIsGone(lineProcessId), () => `the line going:\n${hephaestusLogText()}`);
    } finally {
      // Talos and its line work in the repository: the case's teardown stops what reaches into it.
      removeScratchDirectory(monitorFolder);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a started Hephaestus has its board\'s Talos serving under a lease it renewed', async () => {
    const detached = await runAgentProgress(['start', '--port', '0'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    await waitUntil(() => {
      const reading = firstTalosRecord();
      return reading?.verdict === 'read' && reading.record.state === 'serving' && reading.record.lease.standing === 'held';
    }, () => `Talos serving under a held lease:\n${hephaestusLogText()}`);
    const lines = hephaestusLogText().split('\n');
    const talosLine = lines.findIndex((line) => line.includes('Started Talos 1'));
    const servingLine = lines.findIndex((line) => line.includes('Hephaestus serving'));
    expect(servingLine, hephaestusLogText()).toBeGreaterThan(-1);
    // Talos starts once the Hephaestus lock is taken and the start recorded, so a start refused earlier leaves no Talos behind.
    expect(talosLine, hephaestusLogText()).toBeGreaterThan(servingLine);
    await stopHephaestus();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('talos-restart has the live Hephaestus quit its Talos cleanly and start the next, which it follows, as no crash; with none live it is not taken', async () => {
    const withNoHephaestus = await runAgentProgress(['talos-restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(withNoHephaestus.standardOutput), withNoHephaestus.standardError).toEqual({ outcome: 'not-taken' });

    const detached = await runAgentProgress(['start', '--port', '0'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    await waitUntil(() => talosRecordAt(1)?.state === 'serving', () => `Talos 1 serving:\n${hephaestusLogText()}`);

    const restarted = await runAgentProgress(['talos-restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(restarted.standardOutput), restarted.standardError).toEqual({ outcome: 'done' });
    await waitUntil(() => hephaestusLogText().includes('Started Talos 2 (the one before quit'), () => `Hephaestus following Talos 2:\n${hephaestusLogText()}`);

    expect(talosRecordAt(1)).toMatchObject({ state: 'quit', quitReason: 'restart' });
    expect(talosRecordAt(2)?.state).toBe('serving');
    expect(existsSync(join(hephaestusDirectory(), 'crash-logs')), hephaestusLogText()).toBe(false);
    const status = await runAgentProgress(['status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(status.standardOutput)).toMatchObject({ hephaestus: { state: 'serving', hephaestusLock: { generation: 1 } } });
    await stopHephaestus();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('the preflight as the serving Hephaestus runs it', () => {
  const failureOfProgram = (programCommand: string[], boundMilliseconds?: number) => preflightFailureOf(
    { programCommand },
    { rootDirectory: repositoryDirectory },
    { logFilePath: join(repositoryDirectory, 'example-hephaestus.log') },
    boundMilliseconds,
  );
  const scriptOf = (script: string): string[] => [process.execPath, '-e', script];

  test('no program command, or one that cannot be run, fails at spawn', async () => {
    expect(await failureOfProgram([])).toMatchObject({ step: 'spawn' });
    expect(await failureOfProgram([join(repositoryDirectory, 'no-such-program')])).toMatchObject({ step: 'spawn' });
  });

  test('a preflight that exits with no report fails at preflight, naming its exit code', async () => {
    expect(await failureOfProgram(scriptOf('process.exit(3)'))).toMatchObject({ step: 'preflight', error: 'the preflight exited 3 with no report' });
  });

  test('a preflight that hangs is ended at the bound and fails at preflight', async () => {
    const boundMilliseconds = 200;
    const failure = await failureOfProgram(scriptOf('setInterval(() => undefined, 1000)'), boundMilliseconds);
    expect(failure).toMatchObject({ step: 'preflight', error: `the preflight left no report within ${boundMilliseconds} ms` });
  });

  test('a fit report on the last line is no failure, and an unfit one fails at its step', async () => {
    const reportScriptOf = (report: object): string[] => scriptOf(`console.log('example line'); console.log(${JSON.stringify(JSON.stringify(report))})`);
    expect(await failureOfProgram(reportScriptOf({ verdict: 'fit', codeVersion: 'code-example' }))).toBeNull();
    const unfit = {
      verdict: 'unfit', codeVersion: 'code-example', step: 'read-jobs', error: 'Example error'
    };
    expect(await failureOfProgram(reportScriptOf(unfit))).toEqual({ successorCodeVersion: 'code-example', step: 'read-jobs', error: 'Example error' });
  });
});
