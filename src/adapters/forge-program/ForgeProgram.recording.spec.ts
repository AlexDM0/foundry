/**
 * The real-system spec of the forge program, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record forge-program` with the
 * program of a forge checkout that does not answer F8 yet. It runs that forge through `ScratchForge`, under a scratch home in a scratch
 * repository with `FORGE_ROOT` pinned to it, checks what ForgeProgram makes of each answer, and records each one under the example program
 * path. The cases that matter: `version --json`, `init` and `update`, which this forge refuses with `--json` and so write nothing, and a
 * program that is not there. The forge's install version stamps the recording.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { recordSystemVersion }                                      from '../../testing/BoundaryRecordings.ts';
import { createScratchForge, forgeProgramToRun, type ScratchForge } from '../../testing/ScratchForge.ts';

import { createForgeProgram, type ForgeProgramTarget }                                                   from './ForgeProgram.ts';
import { forgeProgramRecordingRun, type ForgeProgramRecordingRun }                                       from './testing/ForgeProgramRecording.ts';
import { EXAMPLE_FORGE_PROGRAM_PATH, MISSING_FORGE_PROGRAM_PATH, RECORDING_NAME_OF_FORGE_PROGRAM_STAGE } from './testing/RecordedForgeProgram.ts';

const RECORDING_NAME = RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['forge-before-versioned-answers'];
const SETUP_TIMEOUT_MILLISECONDS = 180_000;

let scratchForge: ScratchForge;
let recordingRun: ForgeProgramRecordingRun;
let scratchRepository = '';

function forgeInTheScratchRepository(program: string | null): ForgeProgramTarget {
  return { root: scratchRepository, program };
}

beforeAll(async () => {
  scratchForge      = createScratchForge(RECORDING_NAME);
  scratchRepository = await scratchForge.createRepository('forge-repository');
  recordingRun      = forgeProgramRecordingRun({ recordingName: RECORDING_NAME, scratchForge, program: forgeProgramToRun(RECORDING_NAME) });
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  recordingRun.recordAnswers();
  await scratchForge.remove();
}, SETUP_TIMEOUT_MILLISECONDS);

describe('the forge program of a forge checkout', () => {
  test('answers version --json at exit 0 with its code and install versions and no answerVersion, which Gaia does not understand', async () => {
    const forgeProgram = createForgeProgram({ processRun: recordingRun, settingsProgramPath: () => EXAMPLE_FORGE_PROGRAM_PATH });
    const verdict      = await forgeProgram.version(forgeInTheScratchRepository(null));
    expect(verdict).toEqual({ verdict: 'answer-not-understood', reason: 'other-answer-version', exitCode: 0 });
    const answer = recordingRun.lastAnswer();
    if (answer?.verdict !== 'finished') throw new Error(`version --json answered ${JSON.stringify(answer)}`);
    const versions = JSON.parse(answer.standardOutput) as Record<string, unknown>;
    expect(versions).toEqual({ codeVersion: expect.any(String), installVersion: expect.any(Number) });
    recordSystemVersion(RECORDING_NAME, `install version ${String(versions['installVersion'])}`);
  });

  test('refuses init and update with --json at exit 1, with nothing Gaia understands on standard output', async () => {
    const forgeProgram = createForgeProgram({ processRun: recordingRun, settingsProgramPath: () => null });
    const forge        = forgeInTheScratchRepository(EXAMPLE_FORGE_PROGRAM_PATH);
    expect(await forgeProgram.init(forge, 'Example Project')).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 });
    expect(recordingRun.lastAnswer()).toMatchObject({ verdict: 'finished', exitCode: 1, standardOutput: '' });
    expect(await forgeProgram.update(forge)).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 });
    expect(recordingRun.lastAnswer()).toMatchObject({ verdict: 'finished', exitCode: 1, standardOutput: '' });
  });

  test('answers program-not-found, naming the path, for a forge program that is not there', async () => {
    const forgeProgram = createForgeProgram({ processRun: recordingRun, settingsProgramPath: () => null });
    const verdict      = await forgeProgram.version(forgeInTheScratchRepository(MISSING_FORGE_PROGRAM_PATH));
    expect(verdict).toEqual({ verdict: 'program-not-found', program: MISSING_FORGE_PROGRAM_PATH });
  });
});
