/**
 * The real-system spec of every forge verb refused, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record forge-program-refused`
 * with a forge that answers in versioned JSON. It records one refusal of each verb Gaia runs: init in a bare repository, start and update
 * over a newer install, stop of a suspended Hephaestus, and a machine limit above the CPU count.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun }                                           from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy }                                          from '../../services/Environment.ts';
import { recordSystemVersion }                                      from '../../testing/BoundaryRecordings.ts';
import { createScratchForge, forgeProgramToRun, type ScratchForge } from '../../testing/ScratchForge.ts';
import { createScratchDirectory, removeScratchPath }                from '../../testing/ScratchRoot.ts';

import { createForgeProgram, type ForgeProgram, type ForgeProgramTarget }    from './ForgeProgram.ts';
import { forgeProgramRecordingRun, type ForgeProgramRecordingRun }           from './testing/ForgeProgramRecording.ts';
import { EXAMPLE_FORGE_PROGRAM_PATH, RECORDING_NAME_OF_FORGE_PROGRAM_STAGE } from './testing/RecordedForgeProgram.ts';

const RECORDING_NAME = RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['every-verb-refused'];
const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const GIT_TIMEOUT_MILLISECONDS = 30_000;
const EXAMPLE_ROOT = '/Users/example/development/example-project';
const EXAMPLE_TRACKER_ID = 'example-tracker';
const EXAMPLE_HEPHAESTUS_ADDRESS = '127.0.0.1:47213';
const EXAMPLE_HEPHAESTUS_PROCESS_ID = '48107';
const MACHINE_LIMIT_ABOVE_ANY_CPU_COUNT = 64;
const VERSION_FILE_PATH = ['.forge', 'version.json'] as const;

let scratchForge: ScratchForge;
let recordingRun: ForgeProgramRecordingRun;
let forgeProgram: ForgeProgram;
let trackedRepository = '';
let suspendedHephaestusProcessId: number | null = null;
const foldersWithoutABoard: string[] = [];

function folderWithoutABoard(prefix: string): string {
  const folder = createScratchDirectory(prefix);
  foldersWithoutABoard.push(folder);
  return folder;
}

function forgeIn(root: string): ForgeProgramTarget {
  return { root, program: EXAMPLE_FORGE_PROGRAM_PATH };
}

function refusalOf(verdict: unknown): string {
  if (typeof verdict !== 'object' || verdict === null || (verdict as { verdict?: unknown }).verdict !== 'refused') {
    throw new Error(`the forge answered ${JSON.stringify(verdict)}, no refusal`);
  }
  return (verdict as { refusal: string }).refusal;
}

beforeAll(async () => {
  scratchForge      = createScratchForge(RECORDING_NAME);
  trackedRepository = await scratchForge.createRepository('example-project');
  scratchForge.exampleValueFor({ drawn: trackedRepository, example: EXAMPLE_ROOT });
  recordingRun = forgeProgramRecordingRun({ recordingName: RECORDING_NAME, scratchForge, program: forgeProgramToRun(RECORDING_NAME) });
  forgeProgram = createForgeProgram({ processRun: recordingRun, settingsProgramPath: () => null });
  const { trackerId } = await scratchForge.runForDocument(trackedRepository, ['init', '--project', 'Example Project', '--no-hooks', '--json']);
  scratchForge.exampleValueFor({ drawn: String(trackerId), example: EXAMPLE_TRACKER_ID });
  const { installVersion, codeVersion } = await scratchForge.runForDocument(trackedRepository, ['version', '--json']);
  recordSystemVersion(RECORDING_NAME, `install version ${String(installVersion)}, code ${String(codeVersion)}`);
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  if (suspendedHephaestusProcessId !== null) process.kill(suspendedHephaestusProcessId, 'SIGCONT');
  recordingRun.recordAnswers();
  await scratchForge.remove();
  for (const folder of foldersWithoutABoard.splice(0)) removeScratchPath(folder);
}, SETUP_TIMEOUT_MILLISECONDS);

describe('a forge that answers F8, every verb refused', () => {
  test('init refuses a bare repository, which has no working tree to track', async () => {
    const bareRepository = folderWithoutABoard('example-bare');
    const gitInit = await realProcessRun(environmentCopy).run({
      program: 'git', programArguments: ['init', '--quiet', '--bare'], workingDirectory: bareRepository, timeoutMilliseconds: GIT_TIMEOUT_MILLISECONDS,
    });
    expect(gitInit).toMatchObject({ verdict: 'finished', exitCode: 0 });
    scratchForge.exampleValueFor({ drawn: bareRepository, example: '/Users/example/development/example-bare' });
    expect(refusalOf(await forgeProgram.init(forgeIn(bareRepository), 'Example Project'))).toBe('arguments-refused');
  });

  test('start and update refuse files a newer forge installed, and write nothing', async () => {
    const versionPath = join(trackedRepository, ...VERSION_FILE_PATH);
    const installedVersion = readFileSync(versionPath, 'utf8');
    const { installVersion } = JSON.parse(installedVersion) as { installVersion: number };
    writeFileSync(versionPath, `${JSON.stringify({ installVersion: installVersion + 1 }, null, 2)}\n`);
    try {
      expect(refusalOf(await forgeProgram.start(forgeIn(trackedRepository)))).toBe('install-version-mismatch');
      expect(refusalOf(await forgeProgram.update(forgeIn(trackedRepository)))).toBe('install-version-mismatch');
    } finally {
      writeFileSync(versionPath, installedVersion);
    }
  });

  test('stop refuses a Hephaestus that is still live after the stop was asked, as a suspended one is', async () => {
    const started = await scratchForge.runForDocument(trackedRepository, ['start', '--json']);
    scratchForge.exampleValueFor({ drawn: new URL(String(started['url'])).host, example: EXAMPLE_HEPHAESTUS_ADDRESS });
    const hephaestus = scratchForge.registryEntryOf(String(started['trackerId']))?.['hephaestus'] as { processId: number } | undefined;
    if (hephaestus === undefined) throw new Error('the registry names no live Hephaestus after start');
    scratchForge.exampleValueFor({ drawn: `process ${hephaestus.processId}`, example: `process ${EXAMPLE_HEPHAESTUS_PROCESS_ID}` });
    suspendedHephaestusProcessId = hephaestus.processId;
    process.kill(hephaestus.processId, 'SIGSTOP');
    expect(refusalOf(await forgeProgram.stop(forgeIn(trackedRepository)))).toBe('hephaestus-still-live');
    process.kill(hephaestus.processId, 'SIGCONT');
    suspendedHephaestusProcessId = null;
  }, SETUP_TIMEOUT_MILLISECONDS);

  test('a machine limit above the CPU count is refused and writes nothing', async () => {
    expect(refusalOf(await forgeProgram.machineLimitSet(forgeIn(trackedRepository), MACHINE_LIMIT_ABOVE_ANY_CPU_COUNT))).toBe('machine-agent-limit-above-cpus');
  });
});
