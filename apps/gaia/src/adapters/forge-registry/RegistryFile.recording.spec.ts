/**
 * The real-system spec of the forges' registry, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record forge-registry`. It
 * brings five scratch boards under one scratch home into the presences Gaia shows (two serving, one crashed, one stopped, one never
 * started), then records the registry the forge wrote, with the run's paths, tracker ids, ports and process ids replaced by examples.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join }                      from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun }                        from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy }                       from '../../services/Environment.ts';
import { recordAnswer, recordSystemVersion }     from '../../testing/BoundaryRecordings.ts';
import { createScratchForge, type ScratchForge } from '../../testing/ScratchForge.ts';
import { scratchRoot }                           from '../../testing/ScratchRoot.ts';

import { RegistryFile, registryFilePathIn }           from './RegistryFile.ts';
import { REGISTRY_RECORDING, type RegistryBoardName } from './testing/RecordedRegistry.ts';

const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const GIT_TIMEOUT_MILLISECONDS = 30_000;
const CRASH_LOOK_INTERVAL_MILLISECONDS = 250;
const CRASH_LOOKS = 240;
/** Where a board keeps the record of each Talos it started, the newest under the highest number. */
const TALOS_RECORDS_FOLDER = join('.forge', 'talos');
const TALOS_RECORD_NAME_PATTERN = /^talos-(\d+)\.json$/;

let scratchForge: ScratchForge;
const repositoryOf = new Map<RegistryBoardName, string>();
const drawnTrackerIdOf = new Map<RegistryBoardName, string>();

async function boardIn(board: RegistryBoardName): Promise<string> {
  const { project, root, trackerId } = REGISTRY_RECORDING.boards[board];
  const repository = await scratchForge.createRepository(board);
  repositoryOf.set(board, repository);
  scratchForge.exampleValueFor({ drawn: repository, example: root });
  const initialised = await scratchForge.runForDocument(repository, ['init', '--project', project, '--no-hooks', '--json']);
  drawnTrackerIdOf.set(board, String(initialised['trackerId']));
  scratchForge.exampleValueFor({ drawn: String(initialised['trackerId']), example: trackerId });
  return repository;
}

function newestTalosProcessIdIn(repository: string): number {
  const talosRecordsFolder = join(repository, TALOS_RECORDS_FOLDER);
  const startNumbers = readdirSync(talosRecordsFolder).flatMap((fileName) => {
    const startNumber = TALOS_RECORD_NAME_PATTERN.exec(fileName)?.[1];
    return startNumber === undefined ? [] : [Number(startNumber)];
  });
  const newestRecord = JSON.parse(readFileSync(join(talosRecordsFolder, `talos-${Math.max(...startNumbers)}.json`), 'utf8')) as { talos: { processId: number } | null };
  if (newestRecord.talos === null) throw new Error(`The newest Talos record of ${repository} names no process.`);
  return newestRecord.talos.processId;
}

/** Kills the board's Talos from outside while its Hephaestus serves: the forge records the crash of Talos in the registry and ends. */
async function crashedBoard(board: RegistryBoardName): Promise<void> {
  const presenceStateOfTheBoard = (): unknown => {
    const presence = scratchForge.registryEntryOf(drawnTrackerIdOf.get(board) ?? '')?.['presence'] as { state?: unknown } | undefined;
    return presence?.state;
  };
  process.kill(newestTalosProcessIdIn(repositoryOf.get(board) ?? ''), 'SIGKILL');
  for (let look = 0; look < CRASH_LOOKS && presenceStateOfTheBoard() !== 'crashed'; look++) await Bun.sleep(CRASH_LOOK_INTERVAL_MILLISECONDS);
  expect(presenceStateOfTheBoard()).toBe('crashed');
}

async function startedBoard(board: RegistryBoardName, hephaestusNumber: number): Promise<void> {
  const repository = repositoryOf.get(board) ?? await boardIn(board);
  const started = await scratchForge.runForDocument(repository, ['start', '--json']);
  const example = REGISTRY_RECORDING.hephaestusProcesses[hephaestusNumber];
  if (example === undefined) throw new Error(`No example Hephaestus numbered ${hephaestusNumber}.`);
  scratchForge.exampleValueFor({ drawn: new URL(String(started['url'])).host, example: example.address });
  const hephaestus = scratchForge.registryEntryOf(String(started['trackerId']))?.['hephaestus'] as { processId: number } | undefined;
  if (hephaestus === undefined) throw new Error(`The registry names no Hephaestus for ${board} after its start.`);
  scratchForge.exampleValueFor({ drawn: `"processId": ${hephaestus.processId}`, example: `"processId": ${example.processId}` });
}

beforeAll(async () => {
  scratchForge = createScratchForge(REGISTRY_RECORDING.recordingName);
  const agency = await boardIn('example-agency');
  const gitRemote = await realProcessRun(environmentCopy).run({
    program: 'git', programArguments: ['remote', 'add', 'origin', REGISTRY_RECORDING.agencyGitOrigin], workingDirectory: agency, timeoutMilliseconds: GIT_TIMEOUT_MILLISECONDS,
  });
  expect(gitRemote).toMatchObject({ verdict: 'finished', exitCode: 0 });
  await startedBoard('example-agency', 0);
  await startedBoard('example-bookshop', 1);
  await crashedBoard('example-bookshop');
  await startedBoard('example-clinic', 2);
  await scratchForge.runForDocument(repositoryOf.get('example-clinic') ?? '', ['stop', '--json']);
  await boardIn('example-dairy');
  await startedBoard('example-estate', 3);
  const { installVersion, codeVersion } = await scratchForge.runForDocument(agency, ['version', '--json']);
  recordSystemVersion(REGISTRY_RECORDING.recordingName, `install version ${String(installVersion)}, code ${String(codeVersion)}`);
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  await scratchForge.remove();
}, SETUP_TIMEOUT_MILLISECONDS);

describe('the registry a forge writes', () => {
  test('names five boards in the order they were registered, Hephaestus last written with its token file, and the program of each', async () => {
    const registryPath = registryFilePathIn(scratchForge.home());
    const reading = await new RegistryFile(registryPath).read();
    expect(reading).toMatchObject({ verdict: 'readable' });
    expect(reading.verdict === 'readable' ? reading.forges.map(({ project, hephaestus }) => [project, hephaestus !== null]) : []).toEqual([
      ['Example Agency', true],
      ['Example Bookshop', true],
      ['Example Clinic', false],
      ['Example Dairy', false],
      ['Example Estate', true],
    ]);
    expect(reading.verdict === 'readable' ? reading.forges.map(({ presence }) => presence?.state ?? null) : []).toEqual(['serving', 'crashed', 'stopped', null, 'serving']);
    const registryText = scratchForge.exampleTextOf(readFileSync(registryPath, 'utf8'));
    expect(registryText).not.toContain(scratchRoot());
    expect(registryText).not.toContain(join('.claude', 'worktrees'));
    recordAnswer(REGISTRY_RECORDING.recordingName, REGISTRY_RECORDING.callShape, JSON.parse(registryText) as unknown);
  });
});
