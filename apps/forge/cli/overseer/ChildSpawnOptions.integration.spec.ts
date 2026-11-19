/**
 * What each child starts under, through the real spawn sites; a gate line is a child of Talos, so it starts as a supervised child. The
 * Windows answer per child kind is a table, since a detached gate or Watcher child can report green unrun; POSIX stays equal to the frozen
 * table; with the Windows answer on this machine a child's stderr still reaches the Watcher log, now through a pipe; and a Watcher, an
 * Overseer and a successor run from the root, without Bun's flag that ends a process with its parent, whatever the process that started
 * them had.
 */
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
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

import { platformPortsFor }                               from '../../src/lib/platform-ports/PlatformPortsFor.ts';
import type { SupervisedChildKind }                       from '../../src/lib/process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                          from '../../src/lib/process-identity/ProcessSupervisionFor.ts';
import { WINDOWS_SUPERVISED_CHILD_SPAWN }                 from '../../src/lib/process-identity/SpawnOptionsFor.ts';
import { runWatcherOnPorts, type WatcherPorts }           from '../../src/lib/watcher/Watcher.ts';
import { watcherFilesOf }                                 from '../../src/lib/watcher/WatcherFiles.ts';
import { WatcherFleet }                                   from '../../src/services/overseer/WatcherFleet.ts';
import { NO_ORPHANS_VARIABLE, environmentCopy }           from '../../src/shared/Environment.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../src/testing/ChildProcessCaseTimeout.ts';
import { jsonPrintedByAChildProcess }                     from '../../src/testing/JsonPrintedByAChildProcess.ts';
import { nativePlatformPorts }                            from '../../src/testing/NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { type WatcherJob, createWatcherJob }              from '../../src/testing/WatcherJob.ts';
import FROZEN_POSIX_CHILD_SPAWN                           from './FrozenPosixChildSpawn.json';
import { spawnSuccessor }                                 from './OverseerForeground.ts';
import { OverseerRemote }                                 from './OverseerRemote.ts';

const NATIVE_PORTS = nativePlatformPorts();
const EXAMPLE_LOG_DESCRIPTOR = 7;
const DESCENDANT_END_MARGIN_MILLISECONDS = 500;
const EVERY_CHILD_KIND: readonly SupervisedChildKind[] = ['gate', 'supervised-child', 'watcher', 'talos', 'overseer', 'successor'];

interface ChildStreams {
  detached: unknown;
  stdin:    unknown;
  stdout:   unknown;
  stderr:   unknown;
}

function streamNameOf(stream: unknown): unknown {
  return typeof stream === 'number' ? 'descriptor' : stream;
}

function childStreamsOf(options: Record<string, unknown>): ChildStreams {
  const streams = options['stdio'] as readonly unknown[] | undefined;
  const [stdin, stdout, stderr] = streams ?? [options['stdin'], options['stdout'], options['stderr']];
  return {
    detached: options['detached'], stdin: streamNameOf(stdin), stdout: streamNameOf(stdout), stderr: streamNameOf(stderr)
  };
}

/** Every `Bun.spawn` of the run still starts its child; the options it took are answered beside the run's result. */
async function withRecordedSpawns<Result>(run: () => Promise<Result>): Promise<{ result: Result; spawnOptions: readonly Record<string, unknown>[] }> {
  const spawnOptions: Record<string, unknown>[] = [];
  const spawnAsItStood = Bun.spawn;
  Bun.spawn = ((...spawnArguments: unknown[]) => {
    spawnOptions.push((spawnArguments.length > 1 ? spawnArguments[1] : spawnArguments[0]) as Record<string, unknown>);
    return Reflect.apply(spawnAsItStood, Bun, spawnArguments) as unknown;
  }) as typeof Bun.spawn;
  try {
    return { result: await run(), spawnOptions };
  } finally {
    Bun.spawn = spawnAsItStood;
  }
}

const QUICK_PROGRAM = [process.execPath, '-e', 'process.exit(0);'];

let job: WatcherJob;
let scratchDirectory = '';

beforeEach(() => {
  job              = createWatcherJob();
  scratchDirectory = realpathSync(createScratchDirectory('child-spawn'));
});

afterEach(() => {
  job.remove();
  removeScratchDirectory(scratchDirectory);
});

/** A Watcher run in this process to its acknowledged end, on the given ports. */
async function supervisedRun(ports: WatcherPorts, kind: 'agent' | 'process', childScript: string): Promise<void> {
  job.writeLaunch(1, kind, childScript);
  const watcherRun = runWatcherOnPorts([job.jobFolder, '1'], () => '2026-01-01T00:00:00.000Z', ports);
  const client = await job.attach(1);
  await client.nextFrame((frame) => (frame.kind === 'welcome' || frame.kind === 'state') && frame.state === 'ended');
  client.send(kind === 'agent' ? { kind: 'close-input' } : { kind: 'stop', graceMilliseconds: 0 });
  expect(await watcherRun).toBe(0);
  client.close();
}

function watcherPortsOn(supervision: WatcherPorts['supervision']): WatcherPorts {
  return { supervision, endpoint: NATIVE_PORTS.localEndpoint };
}

describe('the Windows answer per child kind', () => {
  const supervision = processSupervisionFor('win32');

  test.each(['gate', 'supervised-child'] as const)('a %s is never detached, hides its window and pipes stderr', (childKind) => {
    expect(supervision.spawnOptionsFor(childKind)).toEqual(WINDOWS_SUPERVISED_CHILD_SPAWN);
    expect(WINDOWS_SUPERVISED_CHILD_SPAWN).toEqual({ detached: false, windowsHide: true, stderr: 'pipe' });
  });

  test.each(['watcher', 'talos', 'overseer', 'successor'] as const)('a %s, a Bun program, stays detached and hidden', (childKind) => {
    expect(supervision.spawnOptionsFor(childKind)).toEqual({ detached: true, windowsHide: true });
  });

  test('the record the platform ports hold gives that answer', () => {
    const { processSupervision } = platformPortsFor('win32', {
      userShell: () => undefined, commandInterpreter: () => undefined, systemRoot: () => undefined, monitorFolderName: 'monitor-example', pipeNamePrefix: 'example-product'
    });
    for (const childKind of EVERY_CHILD_KIND) expect(processSupervision.spawnOptionsFor(childKind)).toEqual(supervision.spawnOptionsFor(childKind));
  });
});

describe('POSIX equals the frozen table', () => {
  const { children } = FROZEN_POSIX_CHILD_SPAWN;

  test.each([['agent', children['agent-child']], ['process', children['process-child']]] as const)('the child of an %s Watcher', async (kind, expected) => {
    const { spawnOptions } = await withRecordedSpawns(() => supervisedRun(watcherPortsOn(NATIVE_PORTS.processSupervision), kind, 'process.exit(0);'));
    expect(spawnOptions.map(childStreamsOf)).toEqual([expected]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a Watcher spawns with the frozen stream options', () => {
    expect(childStreamsOf(WatcherFleet.watcherSpawnOptionsOf(NATIVE_PORTS, scratchDirectory, EXAMPLE_LOG_DESCRIPTOR) as Record<string, unknown>)).toEqual(children.watcher);
  });

  test('an Overseer started in the background', async () => {
    const context = { programCommand: QUICK_PROGRAM, platformPorts: NATIVE_PORTS };
    const files = { overseerDirectory: scratchDirectory, logFilePath: join(scratchDirectory, 'overseer.log') } as Parameters<typeof OverseerRemote.startDetached>[2];
    const { spawnOptions } = await withRecordedSpawns(() => OverseerRemote.startDetached(context, scratchDirectory, files, []).catch(() => ''));
    expect(spawnOptions.map(childStreamsOf)).toEqual([children.overseer]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a successor Overseer spawns with the frozen stream options', async () => {
    const context = { programCommand: QUICK_PROGRAM, platformPorts: NATIVE_PORTS };
    const files = { logFilePath: join(scratchDirectory, 'overseer.log') };
    const { spawnOptions } = await withRecordedSpawns(() => Promise.resolve(spawnSuccessor(context, { rootDirectory: scratchDirectory }, files, 1, 0)));
    expect(spawnOptions.map(childStreamsOf)).toEqual([children.successor]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a child under the Windows options', () => {
  const windowsAnswerHere = watcherPortsOn({ ...NATIVE_PORTS.processSupervision, spawnOptionsFor: processSupervisionFor('win32').spawnOptionsFor });

  test.each(['agent', 'process'] as const)('the stderr of an %s Watcher\'s child reaches the Watcher log', async (kind) => {
    const childScript = 'console.error("first stderr line"); process.stderr.write("an unterminated tail");';
    const { spawnOptions } = await withRecordedSpawns(() => supervisedRun(windowsAnswerHere, kind, childScript));
    expect(spawnOptions[0]).toMatchObject({ ...WINDOWS_SUPERVISED_CHILD_SPAWN });
    const watcherLog = readFileSync(watcherFilesOf(job.jobFolder, 1).watcherLogPath, 'utf8');
    expect(watcherLog).toContain('first stderr line\n');
    expect(watcherLog).toContain('an unterminated tail');
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('more stderr than a pipe holds cannot stall the child', async () => {
    const pipeOverflow = 'process.stderr.write("x".repeat(1 << 20), () => process.exit(0));';
    await supervisedRun(windowsAnswerHere, 'process', pipeOverflow);
    expect(readFileSync(watcherFilesOf(job.jobFolder, 1).watcherLogPath, 'utf8').length).toBeGreaterThanOrEqual(1 << 20);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a descendant that keeps stderr open past the child\'s end does not hold the end back', async () => {
    const descendantSeconds = 8;
    const childScript = `Bun.spawn(['sleep', '${descendantSeconds}'], { stdin: 'ignore', stdout: 'ignore', stderr: 'inherit' }).unref(); process.exit(0);`;
    const startedAt = Date.now();
    await supervisedRun(windowsAnswerHere, 'process', childScript);
    const endedAfterMilliseconds = Date.now() - startedAt;
    expect(endedAfterMilliseconds).toBeLessThan(descendantSeconds * 1000);
    // The run's leak check fails on a process left running, so the case outlasts the unreferenced descendant.
    await Bun.sleep(descendantSeconds * 1000 - endedAfterMilliseconds + DESCENDANT_END_MARGIN_MILLISECONDS);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

interface ChildReport {
  args: readonly string[];
  cwd:  string;
  flag: string | null;
}

describe('the three programs that outlive their parent', () => {
  test('from a subfolder with the flag planted, each holds the root and none has the flag, while a plain child inherits it', () => {
    const rootDirectory = join(scratchDirectory, 'root');
    const subfolder     = join(rootDirectory, 'worktrees', 'ticket-example');
    const reportFolder  = join(scratchDirectory, 'reports');
    const jobFolder     = join(scratchDirectory, 'job');
    for (const folder of [subfolder, reportFolder, jobFolder]) mkdirSync(folder, { recursive: true });
    const reportProgram = join(scratchDirectory, 'report.js');
    writeFileSync(reportProgram, `require('node:fs').writeFileSync(${JSON.stringify(reportFolder)} + '/' + process.pid + '.json', JSON.stringify({
      args: process.argv.slice(2), cwd: process.cwd(), flag: process.env.${NO_ORPHANS_VARIABLE} ?? null,
    }));`);

    const moduleUrl = (path: string): string => JSON.stringify(new URL(path, import.meta.url).href);
    const finishedSpawns = jsonPrintedByAChildProcess({ ...environmentCopy(), [NO_ORPHANS_VARIABLE]: '1' }, `
      import { readdirSync } from 'node:fs';
      import { nativePlatformPorts } from ${moduleUrl('../../src/testing/NativePlatformPorts.ts')};
      import { waitUntil } from ${moduleUrl('../../src/testing/WaitUntil.ts')};
      import { WatcherFleet } from ${moduleUrl('../../src/services/overseer/WatcherFleet.ts')};
      import { OverseerRemote } from ${moduleUrl('./OverseerRemote.ts')};
      import { spawnSuccessor } from ${moduleUrl('./OverseerForeground.ts')};
      process.chdir(${JSON.stringify(subfolder)});
      const root = ${JSON.stringify(rootDirectory)};
      const platformPorts = nativePlatformPorts();
      const context = { programCommand: [process.execPath, ${JSON.stringify(reportProgram)}], platformPorts };
      const logFilePath = ${JSON.stringify(join(scratchDirectory, 'overseer.log'))};
      WatcherFleet.spawnWatcher(platformPorts, { bundlePath: ${JSON.stringify(reportProgram)}, jobFolder: ${JSON.stringify(jobFolder)}, instance: 1, rootDirectory: root });
      spawnSuccessor(context, { rootDirectory: root }, { logFilePath }, 1, 0);
      await OverseerRemote.startDetached(context, root, { overseerDirectory: root, logFilePath }, ['--started']).catch(() => undefined);
      Bun.spawnSync([process.execPath, ${JSON.stringify(reportProgram)}, 'plain-child']);
      await waitUntil(() => readdirSync(${JSON.stringify(reportFolder)}).length === 4, 'the four reports');
      console.log('true');
    `);
    expect(finishedSpawns).toBe(true);

    const reports = readdirSync(reportFolder).map((fileName) => JSON.parse(readFileSync(join(reportFolder, fileName), 'utf8')) as ChildReport);
    const plainChild = reports.find((report) => report.args.includes('plain-child'));
    expect(plainChild).toMatchObject({ flag: '1' });
    const outliving = reports.filter((report) => report !== plainChild);
    expect(outliving).toHaveLength(3);
    for (const report of outliving) expect(report).toMatchObject({ cwd: rootDirectory, flag: null });
    expect(outliving.filter((report) => report.args.includes('oversee'))).toHaveLength(2);
    expect(outliving.filter((report) => report.args.includes('--successor-of'))).toHaveLength(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
