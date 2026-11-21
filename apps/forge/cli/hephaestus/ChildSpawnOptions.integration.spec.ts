/**
 * What each child starts under, through the real spawn sites; a gate line is a child of Talos, so it starts as a supervised child. The
 * Windows answer per child kind is a table, since a detached gate line can report green unrun; POSIX stays equal to the frozen table; a
 * line child of Talos cannot be stalled by its stderr, nor held back by a descendant that keeps it open; and Talos, a Hephaestus and a
 * successor run from the root, without Bun's flag that ends a process with its parent, whatever the process that started them had.
 */
import {
  chmodSync,
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
import { childFilesOf }                                   from '../../src/lib/talos/TalosFiles.ts';
import { NO_ORPHANS_VARIABLE, environmentCopy }           from '../../src/shared/Environment.ts';
import { CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS }        from '../../src/testing/ChildProcessCaseTimeout.ts';
import { jsonPrintedByAChildProcess }                     from '../../src/testing/JsonPrintedByAChildProcess.ts';
import { nativePlatformPorts }                            from '../../src/testing/NativePlatformPorts.ts';
import { processIsRunning, stopProcesses }                from '../../src/testing/ProcessesInFolder.ts';
import { createScratchTalos, type ScratchTalos }          from '../../src/testing/ScratchTalos.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { waitUntil }                                      from '../../src/testing/WaitUntil.ts';
import FROZEN_POSIX_CHILD_SPAWN                           from './FrozenPosixChildSpawn.json';
import { spawnSuccessor }                                 from './HephaestusForeground.ts';
import { HephaestusRemote }                               from './HephaestusRemote.ts';

const NATIVE_PORTS = nativePlatformPorts();
const DESCENDANT_LINE = /^descendant (\d+)$/mu;
const EVERY_CHILD_KIND: readonly SupervisedChildKind[] = ['supervised-child', 'talos', 'hephaestus', 'successor'];
const START_NUMBER = 1;

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

let scratchTalos: ScratchTalos;
let scratchDirectory = '';

beforeEach(() => {
  scratchTalos     = createScratchTalos();
  scratchDirectory = realpathSync(createScratchDirectory('child-spawn'));
});

afterEach(async () => {
  await scratchTalos.remove();
  removeScratchDirectory(scratchDirectory);
});

/** A line child of a served Talos, run to its end; answers what the child wrote to stderr. */
async function lineStandardErrorOf(childScript: string): Promise<string> {
  const serving = await scratchTalos.serve(START_NUMBER);
  expect(await serving.send({ kind: 'launch', launch: scratchTalos.lineLaunch('jobs/J-1/install', 1, childScript) })).toMatchObject({ verdict: 'done' });
  await scratchTalos.endedRecordOf('jobs/J-1/install', 1);
  expect(await serving.quit()).toBe(0);
  return readFileSync(childFilesOf(scratchTalos.boardFolder, 'jobs/J-1/install', 1).standardErrorPath, 'utf8');
}

describe('the Windows answer per child kind', () => {
  const supervision = processSupervisionFor('win32');

  test('a supervised child is never detached, hides its window and pipes stderr', () => {
    expect(supervision.spawnOptionsFor('supervised-child')).toEqual(WINDOWS_SUPERVISED_CHILD_SPAWN);
    expect(WINDOWS_SUPERVISED_CHILD_SPAWN).toEqual({ detached: false, windowsHide: true, stderr: 'pipe' });
  });

  test.each(['talos', 'hephaestus', 'successor'] as const)('a %s, a Bun program, stays detached and hidden', (childKind) => {
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

  test('a Hephaestus started in the background', async () => {
    const context = { programCommand: QUICK_PROGRAM, platformPorts: NATIVE_PORTS };
    const files = { hephaestusDirectory: scratchDirectory, logFilePath: join(scratchDirectory, 'hephaestus.log') } as Parameters<typeof HephaestusRemote.startDetached>[2];
    const { spawnOptions } = await withRecordedSpawns(() => HephaestusRemote.startDetached(context, scratchDirectory, files, []).catch(() => ''));
    expect(spawnOptions.map(childStreamsOf)).toEqual([children.hephaestus]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a successor Hephaestus spawns with the frozen stream options', async () => {
    const context = { programCommand: QUICK_PROGRAM, platformPorts: NATIVE_PORTS };
    const files = { logFilePath: join(scratchDirectory, 'hephaestus.log') };
    const { spawnOptions } = await withRecordedSpawns(() => Promise.resolve(spawnSuccessor(context, { rootDirectory: scratchDirectory }, files, 1, 0)));
    expect(spawnOptions.map(childStreamsOf)).toEqual([children.successor]);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});

describe('a line child of Talos', () => {
  test('more stderr than a pipe holds cannot stall the child', async () => {
    const pipeOverflow = 'process.stderr.write("x".repeat(1 << 20), () => process.exit(0));';
    expect((await lineStandardErrorOf(pipeOverflow)).length).toBeGreaterThanOrEqual(1 << 20);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);

  test('a descendant that keeps stderr open past the child\'s end does not hold the end back', async () => {
    const descendantSeconds = 8;
    const descendantSpawn = `const descendant = Bun.spawn(['sleep', '${descendantSeconds}'], { stdin: 'ignore', stdout: 'ignore', stderr: 'inherit' }); descendant.unref();`;
    const childScript = `console.error("first stderr line"); ${descendantSpawn} console.error("descendant " + descendant.pid); process.exit(0);`;
    const startedAt = Date.now();
    const standardError = await lineStandardErrorOf(childScript);
    const endedAfterMilliseconds = Date.now() - startedAt;
    expect(standardError).toContain('first stderr line\n');
    expect(endedAfterMilliseconds).toBeLessThan(descendantSeconds * 1000);
    const descendantProcessId = Number(DESCENDANT_LINE.exec(standardError)?.[1]);
    expect(processIsRunning(descendantProcessId)).toBe(true);
    // The run's leak check fails on a process left running, so the case ends the unreferenced descendant once its claim holds.
    await stopProcesses([{ processId: descendantProcessId, command: 'sleep' }]);
    await waitUntil(() => !processIsRunning(descendantProcessId), 'the sleep descendant has ended');
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
    const boardFolder   = join(scratchDirectory, 'board');
    for (const folder of [subfolder, reportFolder, boardFolder]) mkdirSync(folder, { recursive: true });
    const reportProgram = join(scratchDirectory, 'report.js');
    writeFileSync(reportProgram, `require('node:fs').writeFileSync(${JSON.stringify(reportFolder)} + '/' + process.pid + '.json', JSON.stringify({
      args: process.argv.slice(2), cwd: process.cwd(), flag: process.env.${NO_ORPHANS_VARIABLE} ?? null,
    }));`);
    // Talos is started as this Bun with its entry; the stand-in Bun runs the report program in its place.
    const reportingBun = join(scratchDirectory, 'reporting-bun');
    writeFileSync(reportingBun, `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(reportProgram)} "$@"\n`);
    chmodSync(reportingBun, 0o755);

    const moduleUrl = (path: string): string => JSON.stringify(new URL(path, import.meta.url).href);
    const finishedSpawns = jsonPrintedByAChildProcess({ ...environmentCopy(), [NO_ORPHANS_VARIABLE]: '1' }, `
      import { readdirSync } from 'node:fs';
      import { nativePlatformPorts } from ${moduleUrl('../../src/testing/NativePlatformPorts.ts')};
      import { waitUntil } from ${moduleUrl('../../src/testing/WaitUntil.ts')};
      import { spawnTalos } from ${moduleUrl('../../src/services/hephaestus/TalosStart.ts')};
      import { HephaestusRemote } from ${moduleUrl('./HephaestusRemote.ts')};
      import { spawnSuccessor } from ${moduleUrl('./HephaestusForeground.ts')};
      process.chdir(${JSON.stringify(subfolder)});
      const root = ${JSON.stringify(rootDirectory)};
      const platformPorts = nativePlatformPorts();
      const context = { programCommand: [process.execPath, ${JSON.stringify(reportProgram)}], platformPorts };
      const logFilePath = ${JSON.stringify(join(scratchDirectory, 'hephaestus.log'))};
      const ownBun = process.execPath;
      process.execPath = ${JSON.stringify(reportingBun)};
      spawnTalos(platformPorts, { boardFolder: ${JSON.stringify(boardFolder)}, startNumber: 1, repositoryRoot: root });
      process.execPath = ownBun;
      spawnSuccessor(context, { rootDirectory: root }, { logFilePath }, 1, 0);
      await HephaestusRemote.startDetached(context, root, { hephaestusDirectory: root, logFilePath }, ['--started']).catch(() => undefined);
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
    expect(outliving.filter((report) => report.args.includes('start'))).toHaveLength(2);
    expect(outliving.filter((report) => report.args.includes('--successor-of'))).toHaveLength(1);
    expect(outliving.filter((report) => report.args.some((argument) => argument.endsWith('talos.ts')))).toHaveLength(1);
  }, CHILD_PROCESS_CASE_TIMEOUT_MILLISECONDS);
});
