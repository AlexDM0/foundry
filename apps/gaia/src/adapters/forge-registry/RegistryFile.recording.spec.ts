/**
 * The real-system spec of the forges' registry, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record forge-registry` with the
 * program of a forge that writes F4 and F9. It brings five scratch boards under one scratch home into the states Gaia shows, each with the
 * presence the forge writes: two serving, one crashed (its Overseer killed, then a login item's start that stays off after the crash), one
 * stopped and one never started, then reads the registry the forge wrote and records it, with the paths, tracker ids, ports and process ids
 * this run drew replaced by examples. The forge's install version stamps the recording.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
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
/** The exit of a start the forge's start gate keeps off after a crash (`forge-off-after-crash`). */
const STAYED_OFF_EXIT_CODE = 1;

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

/** Kills the board's Overseer from outside, which writes nothing, then starts it as a login item does: the start gate keeps it off. */
async function crashedBoard(board: RegistryBoardName): Promise<void> {
  const repository = repositoryOf.get(board) ?? '';
  const overseer = scratchForge.registryEntryOf(drawnTrackerIdOf.get(board) ?? '')?.['overseer'] as { processId: number } | undefined;
  if (overseer === undefined) throw new Error(`The registry names no Overseer for ${board} to crash.`);
  process.kill(overseer.processId, 'SIGKILL');
  const stayedOff = await scratchForge.run(repository, ['start', '--started-by', 'login-item', '--json']);
  expect(stayedOff.exitCode).toBe(STAYED_OFF_EXIT_CODE);
}

async function startedBoard(board: RegistryBoardName, overseerNumber: number): Promise<void> {
  const repository = repositoryOf.get(board) ?? await boardIn(board);
  const started = await scratchForge.runForDocument(repository, ['start', '--json']);
  const example = REGISTRY_RECORDING.overseers[overseerNumber];
  if (example === undefined) throw new Error(`No example Overseer numbered ${overseerNumber}.`);
  scratchForge.exampleValueFor({ drawn: new URL(String(started['url'])).host, example: example.address });
  const overseer = scratchForge.registryEntryOf(String(started['trackerId']))?.['overseer'] as { processId: number } | undefined;
  if (overseer === undefined) throw new Error(`The registry names no Overseer for ${board} after its start.`);
  scratchForge.exampleValueFor({ drawn: `"processId": ${overseer.processId}`, example: `"processId": ${example.processId}` });
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
  test('names five boards in the order they were registered, the Overseer last written with its token file, and the program of each', async () => {
    const registryPath = registryFilePathIn(scratchForge.home());
    const reading = await new RegistryFile(registryPath).read();
    expect(reading).toMatchObject({ verdict: 'readable' });
    expect(reading.verdict === 'readable' ? reading.forges.map(({ project, overseer }) => [project, overseer !== null]) : []).toEqual([
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
