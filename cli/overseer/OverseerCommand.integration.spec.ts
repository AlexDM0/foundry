/**
 * The Overseer's start, Baton and stop, end to end through real child processes, since an Overseer holds its process until it is stopped.
 * What matters: two starters at once leave exactly one Overseer serving; a Baton naming a dead process is taken over as after a crash; a
 * Overseer whose generation was overtaken stops at exit 2 touching nothing; `oversee --detach`, `oversee status`, `oversee restart` and `oversee stop`
 * agree with the Baton; `oversee stop --now` stops a live process Watcher, which a plain stop leaves running; `oversee pause|resume` write the
 * drain flag with no Overseer up, which the Bridge header's board state and `oversee status` read alike, held in-process by
 * `cli/overseer/OverseerCommand.spec.ts`; and a spec-spawned Overseer resolves the fake agent, never the vendor's adapter. Every Overseer binds
 * `--port 0`. Every binary, and every Overseer it starts, answers git from one recorded answer set an idle board needs. An Overseer whose data
 * folder watch fails to start writes its URL to no page stub and no output: a move of these writes before the watch start makes it fail.
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
  expect,
  test
} from 'bun:test';

import { processIsGone }                                  from '../../src/lib/process-identity/ProcessIdentity.ts';
import { watcherFilesOf }                                 from '../../src/lib/watcher/WatcherFiles.ts';
import { CodeVersion }                                    from '../../src/services/overseer/CodeVersion.ts';
import { WatcherFleet }                                   from '../../src/services/overseer/WatcherFleet.ts';
import { PlantedWatcher }                                 from '../../src/services/overseer/testing/PlantedWatcher.ts';
import { workspacePathsFor }                              from '../../src/services/tracker/Workspace.ts';
import { fakeAgentVariableOf }                            from '../../src/shared/Environment.ts';
import { PRODUCT_NAMES }                                  from '../../src/shared/constants/ProductNames.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../src/testing/ChildProcessCaseTimeout.ts';
import { FAKE_AGENT_VENDOR }                              from '../../src/testing/FakeAgentAdapter.ts';
import { nativePlatformPorts }                            from '../../src/testing/NativePlatformPorts.ts';
import { stopProcessesReachingInto }                      from '../../src/testing/ProcessesInFolder.ts';
import { type RecordedGitStage, useRecordedGit }          from '../../src/testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../src/testing/ToolGuard.ts';
import { waitUntil }                                      from '../../src/testing/WaitUntil.ts';
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
  idleOverseerAnswersIn,
  REFRESH_OF_AN_IGNORING_REPOSITORY
} from '../testing/RecordedGitStages.ts';

const ports = nativePlatformPorts();
const recordedGit = useRecordedGit();

const SPEC_CLOCK = (): Date => new Date('2026-09-18T20:11:03Z');

const OWNER_ONLY_FILE_MODE = 0o600;
const PERMISSION_BITS      = 0o777;
const WATCHER_BINARY_PATH = new URL('../../watcher.ts', import.meta.url).pathname;

let repositoryDirectory = '';
let homeDirectory       = '';
let shortMonitorFolder  = '';

function overseerDirectory(): string {
  return join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer');
}

function batonFileNames(): string[] {
  return existsSync(overseerDirectory()) ? readdirSync(overseerDirectory()).filter((fileName) => /^baton-\d+\.json$/.test(fileName)).sort() : [];
}

function batonOf(fileName: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(overseerDirectory(), fileName), 'utf8')) as Record<string, unknown>;
}

function overseerLogText(): string {
  const logFilePath = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer.log');
  return existsSync(logFilePath) ? readFileSync(logFilePath, 'utf8') : '';
}

function storedLogKindsOf(repository: string): string[] {
  return readFileSync(join(repository, PRODUCT_NAMES.DATA_FOLDER, 'log.jsonl'), 'utf8').split('\n').filter((line) => line !== '')
    .map((line) => (JSON.parse(line) as { kind: string }).kind);
}

/** This process's pid with a start no process ever had: a Baton that reads as dead without depending on a pid being free. */
function plantDeadBaton(generation: number): void {
  mkdirSync(overseerDirectory(), { recursive: true });
  writeFileSync(join(overseerDirectory(), `baton-${generation}.json`), JSON.stringify({
    processId:              process.pid,
    processStartStamp:      '1',
    bootIdentity:           'example-boot',
    port:                   1,
    url:                    'http://127.0.0.1:1/',
    tokenFile:              join(overseerDirectory(), 'token'),
    codeVersion:            'code-example',
    installVersion:         1,
    watcherProtocolVersion: 1,
  }));
}

/**
 * The orchestrator's Watcher, claimed by this process. Under a macOS temp path the scratch home is too long for a socket, so the Overseer launches
 * none; the monitor folder here is short enough.
 */
function plantedOrchestratorEventLogPath(): string {
  const trackerDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER);
  shortMonitorFolder = createScratchDirectory('m');
  PlantedWatcher.plantLiveWatcher({
    trackerDirectory, monitorFolder: shortMonitorFolder, jobId: 'J1', instance: 1
  });
  return watcherFilesOf(join(trackerDirectory, 'jobs', 'J1'), 1).eventLogPath;
}

/** The isolation check here asks git for the root of each scratch folder it is handed that holds no tracker and lies in no repository. */
function isolationCheckOf(currentDirectory: string): RecordedGitStage {
  return currentDirectory === repositoryDirectory ? [COMMON_FOLDER_OUTSIDE] : [COMMON_FOLDER_OUTSIDE, COMMON_FOLDER_OUTSIDE];
}

/** Every binary and every Overseer it starts answers git from one set: the idle Overseer's calls, the root, and the refresh `update` makes. */
function overseerAnswersIn(repository: string): RecordedGitStage {
  return [...idleOverseerAnswersIn(repository), COMMON_FOLDER_AT_THE_ROOT, ...REFRESH_OF_AN_IGNORING_REPOSITORY];
}

async function runAgentProgress(
  commandLineArguments: readonly string[], options: { currentDirectory: string; homeDirectory: string },
): Promise<AgentProgressResult> {
  return await runAgentProgressBesideRecordedGit(
    recordedGit, isolationCheckOf(options.currentDirectory), commandLineArguments, { ...options, sharedRecordedGitAnswers: sharedAnswersOfThisCase() },
  );
}

async function startOverseer(environment?: Record<string, string>): Promise<StartedAgentProgress> {
  return await recordedGit.playStage([COMMON_FOLDER_OUTSIDE], async () => startAgentProgress(['oversee', '--port', '0'], {
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

async function stopOverseer(): Promise<void> {
  const stopped = await runAgentProgress(['oversee', 'stop'], { currentDirectory: repositoryDirectory, homeDirectory });
  expect(stopped.exitCode, stopped.standardError).toBe(0);
}

let sharedAnswers: SharedRecordedGitAnswers | null = null;

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('overseer', ['--project', 'Example Agency', '--no-hooks'], SPEC_CLOCK, recordedGit);
  homeDirectory       = createScratchDirectory('overseer-home');
  sharedAnswers       = shareRecordedGitAnswers(overseerAnswersIn(repositoryDirectory));
});

afterEach(async () => {
  await runAgentProgress(['oversee', 'stop'], { currentDirectory: repositoryDirectory, homeDirectory });
  // A case its deadline cut short during a Baton pass leaves a successor no Baton names yet, which `oversee stop` cannot reach.
  await stopProcessesReachingInto(repositoryDirectory);
  const answers = sharedAnswersOfThisCase();
  sharedAnswers = null;
  removeScratchDirectory(repositoryDirectory);
  removeScratchDirectory(homeDirectory);
  if (shortMonitorFolder !== '') removeScratchDirectory(shortMonitorFolder);
  shortMonitorFolder = '';
  try {
    answers.requireEveryCallAnswered();
  } finally {
    answers.remove();
  }
});

describeWhenGitIsRecorded('run in the foreground', () => {
  test('a SIGHUP, as a closed terminal delivers, ends a foreground Overseer through its own stop', async () => {
    const overseer = await startOverseer();
    expect(await overseer.firstOutputLine).not.toBeNull();

    process.kill(overseer.processId, 'SIGHUP');
    const finished = await overseer.finished;

    expect(finished.exitCode, `${finished.standardError}\n${overseerLogText()}`).toBe(0);
    expect(storedLogKindsOf(repositoryDirectory)).toContain('overseer-stopped');
    expect(batonFileNames()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('two starters at once leave exactly one Overseer serving; the other refuses already-running or contended at exit 1', async () => {
    const starters = [await startOverseer(), await startOverseer()];
    const firstLines = await Promise.all(starters.map((starter) => Promise.race([starter.firstOutputLine, starter.finished.then(() => null)])));
    const servingIndex = firstLines.findIndex((line) => line !== null);
    expect(servingIndex).toBeGreaterThanOrEqual(0);
    const refused = await (starters[1 - servingIndex]?.finished ?? Promise.reject(new Error('no second starter')));
    expect(refused.exitCode, refused.standardError).toBe(1);
    expect(refused.standardError).toMatch(/An Overseer already serves this board at http:\/\/127\.0\.0\.1:\d+\/|Another Overseer started/);

    const url = firstLines[servingIndex] ?? '';
    expect(batonFileNames()).toEqual(['baton-1.json']);
    const baton = batonOf('baton-1.json');
    expect(baton).toMatchObject({ processId: starters[servingIndex]?.processId, url, codeVersion: CodeVersion.onDisk() });
    expect(Object.keys(baton)).toEqual([
      'processId', 'processStartStamp', 'bootIdentity', 'port', 'url', 'tokenFile', 'codeVersion', 'installVersion', 'watcherProtocolVersion',
    ]);
    expect(existsSync(join(overseerDirectory(), 'token'))).toBe(false);
    expect(statSync(baton['tokenFile'] as string).mode & PERMISSION_BITS).toBe(OWNER_ONLY_FILE_MODE);
    const identity = await (await fetch(new URL('api/identity', url))).json() as Record<string, unknown>;
    expect(identity).toMatchObject({ application: PRODUCT_NAMES.PROGRAM, project: 'Example Agency', processId: baton['processId'] });

    await stopOverseer();
    expect((await starters[servingIndex]?.finished)?.exitCode).toBe(0);
    expect(batonFileNames()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Baton naming a dead process is replaced by the next generation, which removes the older one', async () => {
    plantDeadBaton(3);
    const overseer = await startOverseer();
    expect(await overseer.firstOutputLine).toStartWith('http://127.0.0.1:');
    expect(batonFileNames()).toEqual(['baton-4.json']);
    await stopOverseer();
    expect((await overseer.finished).exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an Overseer whose generation a newer Baton overtook stops baton-taken at exit 2 and unlinks nothing', async () => {
    const overseer = await startOverseer();
    expect(await overseer.firstOutputLine).toStartWith('http://127.0.0.1:');
    plantDeadBaton(2);
    const finished = await overseer.finished;
    expect(finished.exitCode).toBe(2);
    expect(finished.standardError).toContain('A newer Overseer took this board over');
    expect(batonFileNames()).toEqual(['baton-1.json', 'baton-2.json']);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('an Overseer whose data folder watch fails to start gives its URL to no page stub and no output', async () => {
    const worktreesFolder = join(repositoryDirectory, PRODUCT_NAMES.WORKTREES_FOLDER);
    rmSync(worktreesFolder, { recursive: true, force: true });
    // A file where the watch creates its Hatch root makes the watch start throw, after the bind and the logged URL.
    writeFileSync(worktreesFolder, 'not a folder\n');
    const { htmlFilePath } = workspacePathsFor(repositoryDirectory);
    const pageBefore = existsSync(htmlFilePath) ? readFileSync(htmlFilePath, 'utf8') : null;

    const finished = await (await startOverseer()).finished;

    expect(finished.exitCode, finished.standardError).toBe(2);
    const servedUrl = /Overseer serving (http:\/\/127\.0\.0\.1:\d+\/)/.exec(overseerLogText())?.[1] ?? null;
    expect(servedUrl, overseerLogText()).not.toBeNull();
    expect(finished.standardOutput).toBe('');
    expect(existsSync(htmlFilePath) ? readFileSync(htmlFilePath, 'utf8') : null).toBe(pageBefore);
    expect(batonFileNames()).toEqual([]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

/** The vendor an Overseer announced in its log since `fromOffset`: the adapter its process resolved. */
function announcedVendorSince(fromOffset: number): string | null {
  const logText = readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer.log'), 'utf8').slice(fromOffset);
  return /, agents ([\w-]+)\)\./.exec(logText)?.[1] ?? null;
}

describeWhenGitIsRecorded('the agent adapter of a spec-spawned overseer', () => {
  test('is the fake agent by default, and stays the fake agent when a spec\'s environment plants the fake-agent switch off', async () => {
    const overseer = await startOverseer();
    expect(await overseer.firstOutputLine).toStartWith('http://127.0.0.1:');
    expect(announcedVendorSince(0)).toBe(FAKE_AGENT_VENDOR);
    await stopOverseer();
    expect((await overseer.finished).exitCode).toBe(0);

    const logLength = readFileSync(join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'overseer.log'), 'utf8').length;
    const switchedOff = { [fakeAgentVariableOf(PRODUCT_NAMES)]: '0' };
    const planted     = await startOverseer(switchedOff);
    expect(await planted.firstOutputLine).toStartWith('http://127.0.0.1:');
    expect(announcedVendorSince(logLength)).toBe(FAKE_AGENT_VENDOR);
    await stopOverseer();
    expect((await planted.finished).exitCode).toBe(0);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describeWhenGitIsRecorded('run --detach, status, restart and stop', () => {
  test('oversee --repository started from another directory serves that repository\'s board, as a Windows Run entry starts it', async () => {
    const startArguments = ['oversee', '--detach', '--port', '0', '--repository', repositoryDirectory, '--json'];
    const detached = await runAgentProgress(startArguments, { currentDirectory: homeDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };
    expect(batonFileNames()).toEqual(['baton-1.json']);
    expect(batonOf('baton-1.json')['url']).toBe(url);
    await stopOverseer();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('start twice answers started true, then false, both at exit 0 with one Overseer live, and stop answers done', async () => {
    const first = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(first.exitCode, first.standardError).toBe(0);
    const firstAnswer = JSON.parse(first.standardOutput) as Record<string, unknown>;
    expect(firstAnswer).toEqual({
      answerVersion:  1,
      started:        true,
      url:            expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/$/),
      generation:     1,
      trackerId:      expect.any(String),
      codeVersion:    CodeVersion.onDisk(),
      installVersion: expect.any(Number),
      contracts:      { summary: 1, monitor: 1, control: 1 },
    });
    const second = await runAgentProgress(['start', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(second.exitCode, second.standardError).toBe(0);
    expect(JSON.parse(second.standardOutput)).toEqual({ ...firstAnswer, started: false });
    expect(batonFileNames()).toEqual(['baton-1.json']);
    const stopped = await runAgentProgress(['stop', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(stopped.standardOutput)).toEqual({ answerVersion: 1, outcome: 'done' });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a detached Overseer prints its URL once it answers; status reports it serving; restart keeps its port under a new process', async () => {
    const detached = await runAgentProgress(['oversee', '--detach', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };

    const status = await runAgentProgress(['oversee', 'status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(status.standardOutput)).toMatchObject({
      state: 'serving', paused: true, url, codeVersionOnDisk: CodeVersion.onDisk(), codeVersionInMemory: CodeVersion.onDisk(),
    });

    const processBefore = batonOf(batonFileNames()[0] ?? '')['processId'];
    const restarted = await runAgentProgress(['oversee', 'restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(restarted.exitCode, `${restarted.standardError}\n${overseerLogText()}`).toBe(0);
    expect(JSON.parse(restarted.standardOutput)).toEqual({ outcome: 'done', url, codeVersion: CodeVersion.onDisk() });
    expect(batonFileNames()).toEqual(['baton-2.json']);
    expect(batonOf(batonFileNames()[0] ?? '')['processId']).not.toBe(processBefore);
    expect(storedLogKindsOf(repositoryDirectory).filter((kind) => kind.startsWith('overseer-'))).toEqual(['overseer-started', 'overseer-stopped', 'overseer-started']);

    const stopped = await runAgentProgress(['oversee', 'stop', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(stopped.standardOutput)).toEqual({ outcome: 'done' });
    expect(batonFileNames()).toEqual([]);
    const statusAfter = await runAgentProgress(['oversee', 'status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(statusAfter.standardOutput)).toMatchObject({ state: 'down', url: null });
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a second restart while a Baton pass runs leaves the successor\'s ready report standing, and the first Baton pass completes', async () => {
    const detached = await runAgentProgress(['oversee', '--detach', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };
    const batonPassFilePath = join(overseerDirectory(), 'baton-pass-1.json');
    const batonPassState = (): string | null => {
      try {
        return (JSON.parse(readFileSync(batonPassFilePath, 'utf8')) as { state: string }).state;
      } catch {
        return null;
      }
    };

    const restarting = runAgentProgress(['oversee', 'restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    // The old Overseer looks for `ready` only every interval, so a second command sent the moment it appears arrives before that look.
    await waitUntil(() => batonPassState() === 'ready', 'the successor reporting ready', 1);
    const token = readFileSync(batonOf('baton-1.json')['tokenFile'] as string, 'utf8').trim();
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const body    = JSON.stringify({ kind: 'overseer-restart', now: false });
    await fetch(new URL('api/commands', url), { method: 'POST', headers, body }).catch(() => null);
    expect(batonPassState()).not.toBe('requested');

    const restarted = await restarting;
    expect(restarted.exitCode, `${restarted.standardError}\n${overseerLogText()}`).toBe(0);
    expect(batonFileNames()).toEqual(['baton-2.json']);
    await stopOverseer();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a successor that fails a step exits; restart exits 1 baton-pass-failed and the old Overseer keeps driving, logging it and warning', async () => {
    const detached = await runAgentProgress(['oversee', '--detach', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const { url } = JSON.parse(detached.standardOutput) as { url: string };
    const batonBefore = batonOf('baton-1.json');
    // The successor reads every claimed Watcher's event log before it reports ready: a malformed line in the orchestrator's fails that step.
    appendFileSync(plantedOrchestratorEventLogPath(), 'not an event\n');

    const restarted = await runAgentProgress(['oversee', 'restart', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(restarted.exitCode, `${restarted.standardError}\n${overseerLogText()}`).toBe(1);
    expect(`${restarted.standardOutput}${restarted.standardError}`).toContain('failed at read-watcher-files');
    expect(batonFileNames()).toEqual(['baton-1.json']);
    expect(batonOf('baton-1.json')).toEqual(batonBefore);
    expect(storedLogKindsOf(repositoryDirectory)).toContain('baton-pass-failed');

    const status = await runAgentProgress(['oversee', 'status', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(JSON.parse(status.standardOutput)).toMatchObject({ url, batonPassWarning: { step: 'read-watcher-files' } });
    expect((await runAgentProgress(['oversee', 'status'], { currentDirectory: repositoryDirectory, homeDirectory })).standardOutput)
      .toContain('warning: the Baton pass to code');
    await stopOverseer();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('update ends by handing a live Overseer on other code to the code on disk; a failed Baton pass exits 1, its install writes standing', async () => {
    const withNoOverseer = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(withNoOverseer.exitCode, withNoOverseer.standardError).toBe(0);
    expect(withNoOverseer.standardOutput).not.toContain('Handing the overseer');

    const detached = await runAgentProgress(['oversee', '--detach', '--port', '0', '--json'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(detached.exitCode, detached.standardError).toBe(0);
    const onTheSameCode = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(onTheSameCode.standardOutput).not.toContain('Handing the overseer');

    // The live Overseer's Baton says it runs older code, as after a pull into the checkout the binary links to.
    writeFileSync(join(overseerDirectory(), 'baton-1.json'), `${JSON.stringify({ ...batonOf('baton-1.json'), codeVersion: 'code-older' })}\n`);
    const updated = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(updated.exitCode, `${updated.standardError}\n${overseerLogText()}`).toBe(0);
    expect(updated.standardOutput).toContain(`Overseer handed over to code ${CodeVersion.onDisk()}`);
    expect(batonFileNames()).toEqual(['baton-2.json']);

    writeFileSync(join(overseerDirectory(), 'baton-2.json'), `${JSON.stringify({ ...batonOf('baton-2.json'), codeVersion: 'code-older' })}\n`);
    appendFileSync(plantedOrchestratorEventLogPath(), 'not an event\n');
    const manifestPath = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER, 'version.json');
    rmSync(manifestPath);
    const failed = await runAgentProgress(['update'], { currentDirectory: repositoryDirectory, homeDirectory });
    expect(failed.exitCode, failed.standardError).toBe(1);
    expect(failed.standardError).toContain('failed at read-watcher-files');
    expect(existsSync(manifestPath)).toBe(true);
    expect(batonFileNames()).toEqual(['baton-2.json']);
    await stopOverseer();
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('stop --now stops a live install Watcher before the Overseer exits; a plain stop leaves it running', async () => {
    const monitorFolder = createScratchDirectory('h');
    const trackerDirectory = join(repositoryDirectory, PRODUCT_NAMES.DATA_FOLDER);
    try {
      const watcherFolder = join(trackerDirectory, 'jobs', 'J-example', 'install-1');
      WatcherFleet.writeProcessLaunchFile(ports, {
        watcherFolder,
        instance:           1,
        jobId:              'J-example',
        socketName:         'J-example/install-1',
        trackerId:          'tracker-example',
        monitorFolder,
        watcherCodeVersion: 'code-example',
        workingDirectory:   watcherFolder,
        argv:               [process.execPath, '-e', 'setInterval(() => undefined, 1000);'],
        environment:        {},
      });
      const watcherProcessId = WatcherFleet.spawnWatcher(ports, {
        bundlePath: WATCHER_BINARY_PATH, jobFolder: watcherFolder, instance: 1, rootDirectory: repositoryDirectory
      });
      if (watcherProcessId === undefined) throw new Error('the install Watcher did not spawn');
      await waitUntil(() => WatcherFleet.livenessOf(ports, watcherFolder, 1).verdict === 'live', 'the install Watcher going live');

      const startOverseerDetached = async (): Promise<void> => {
        const detached = await runAgentProgress(['oversee', '--detach', '--port', '0'], { currentDirectory: repositoryDirectory, homeDirectory });
        expect(detached.exitCode, detached.standardError).toBe(0);
      };
      await startOverseerDetached();
      await stopOverseer();
      expect(WatcherFleet.livenessOf(ports, watcherFolder, 1).verdict).toBe('live');

      await startOverseerDetached();
      const stoppedNow = await runAgentProgress(['oversee', 'stop', '--now'], { currentDirectory: repositoryDirectory, homeDirectory });
      expect(stoppedNow.exitCode, stoppedNow.standardError).toBe(0);
      expect(WatcherFleet.livenessOf(ports, watcherFolder, 1)).toMatchObject({ verdict: 'ended' });
      await waitUntil(() => processIsGone(watcherProcessId), () => `the install Watcher going:\n${overseerLogText()}`);
    } finally {
      // A failed assertion would otherwise leave the Watcher and its child running past the scratch repository.
      await WatcherFleet.stopLiveProcessWatchers(ports, trackerDirectory);
      await WatcherFleet.reapEndedWatchers(ports, trackerDirectory);
      removeScratchDirectory(monitorFolder);
    }
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
