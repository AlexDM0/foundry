/**
 * The real-system spec of the forge program, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record forge-program` with the
 * program of a forge checkout. It runs that forge under the run's scratch home in a scratch repository, checks what ForgeProgram makes of
 * each answer, and records each one under the example program path. The cases that matter: `version --json`, `init` and `update`, which
 * this forge refuses with `--json` and so write nothing, and a program that is not there. The forge's install version stamps the recording;
 * the Bun cache the forge's Bun writes in the scratch home is removed after.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { realProcessRun, type ProcessRun, type ProgramRunAnswer }   from '../../lib/process-run/ProcessRun.ts';
import { environmentCopy, forgeProgramToRecordFrom, homeDirectory } from '../../services/Environment.ts';
import { recordAnswer, recordSystemVersion }                        from '../../testing/BoundaryRecordings.ts';
import { runCallShapeOf }                                           from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath }                from '../../testing/ScratchRoot.ts';

import { createForgeProgram, type ForgeProgramTarget }                                                   from './ForgeProgram.ts';
import { EXAMPLE_FORGE_PROGRAM_PATH, MISSING_FORGE_PROGRAM_PATH, RECORDING_NAME_OF_FORGE_PROGRAM_STAGE } from './testing/RecordedForgeProgram.ts';

const RECORDING_NAME = RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['forge-before-versioned-answers'];
const GIT_TIMEOUT_MILLISECONDS = 30_000;

/** Where Bun keeps its transpiler cache under a home folder on macOS. */
const BUN_CACHE_FOLDER_IN_HOME = 'Library';

let scratchRepository = '';
let bunCacheFolderWasThere = false;

interface RecordingProcessRun extends ProcessRun {
  readonly lastAnswer: () => ProgramRunAnswer | null;
}

function forgeProgramToRun(): string {
  const forgeProgram = forgeProgramToRecordFrom();
  if (forgeProgram === null) throw new Error('Name the forge program to record from: GAIA_RECORDING_FORGE_PROGRAM=<path> bun run record forge-program.');
  return forgeProgram;
}

/** Runs the real forge in place of the example program and records each answer under the call shape ForgeProgram made. */
function recordingProcessRun(): RecordingProcessRun {
  const processRun = realProcessRun(environmentCopy);
  let lastAnswer: ProgramRunAnswer | null = null;
  return {
    run: async (request) => {
      const program = request.program === EXAMPLE_FORGE_PROGRAM_PATH ? forgeProgramToRun() : request.program;
      const answer  = await processRun.run({ ...request, program });
      recordAnswer(RECORDING_NAME, runCallShapeOf(request.program, request.programArguments), answer);
      lastAnswer = answer;
      return answer;
    },
    startOwned: (request) => {
      throw new Error(`The forge-program recording starts nothing owned, and was asked to start ${request.program}.`);
    },
    startDetached: (request) => {
      throw new Error(`The forge-program recording starts nothing detached, and was asked to start ${request.program}.`);
    },
    lastAnswer: () => lastAnswer,
  };
}

function forgeInTheScratchRepository(program: string | null): ForgeProgramTarget {
  return { root: scratchRepository, program };
}

beforeAll(async () => {
  bunCacheFolderWasThere = existsSync(join(homeDirectory(), BUN_CACHE_FOLDER_IN_HOME));
  scratchRepository      = createScratchDirectory('forge-repository');
  const gitInit = await realProcessRun(environmentCopy).run({
    program: 'git', programArguments: ['init', '--quiet'], workingDirectory: scratchRepository, timeoutMilliseconds: GIT_TIMEOUT_MILLISECONDS
  });
  expect(gitInit).toMatchObject({ verdict: 'finished', exitCode: 0 });
});

afterAll(() => {
  removeScratchPath(scratchRepository);
  if (!bunCacheFolderWasThere) removeScratchPath(join(homeDirectory(), BUN_CACHE_FOLDER_IN_HOME));
});

describe('the forge program of a forge checkout', () => {
  test('answers version --json at exit 0 with its code and install versions and no answerVersion, which Gaia does not understand', async () => {
    const processRun = recordingProcessRun();
    const verdict    = await createForgeProgram({ processRun, settingsProgramPath: () => EXAMPLE_FORGE_PROGRAM_PATH }).version(forgeInTheScratchRepository(null));
    expect(verdict).toEqual({ verdict: 'answer-not-understood', reason: 'other-answer-version', exitCode: 0 });
    const answer = processRun.lastAnswer();
    if (answer?.verdict !== 'finished') throw new Error(`version --json answered ${JSON.stringify(answer)}`);
    const versions = JSON.parse(answer.standardOutput) as Record<string, unknown>;
    expect(versions).toEqual({ codeVersion: expect.any(String), installVersion: expect.any(Number) });
    recordSystemVersion(RECORDING_NAME, `install version ${String(versions['installVersion'])}`);
  });

  test('refuses init and update with --json at exit 1, with nothing Gaia understands on standard output', async () => {
    const processRun   = recordingProcessRun();
    const forgeProgram = createForgeProgram({ processRun, settingsProgramPath: () => null });
    const forge        = forgeInTheScratchRepository(EXAMPLE_FORGE_PROGRAM_PATH);
    expect(await forgeProgram.init(forge, 'Example Project')).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 });
    expect(processRun.lastAnswer()).toMatchObject({ verdict: 'finished', exitCode: 1, standardOutput: '' });
    expect(await forgeProgram.update(forge)).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 });
    expect(processRun.lastAnswer()).toMatchObject({ verdict: 'finished', exitCode: 1, standardOutput: '' });
  });

  test('answers program-not-found, naming the path, for a forge program that is not there', async () => {
    const processRun = recordingProcessRun();
    const verdict    = await createForgeProgram({ processRun, settingsProgramPath: () => null }).version(forgeInTheScratchRepository(MISSING_FORGE_PROGRAM_PATH));
    expect(verdict).toEqual({ verdict: 'program-not-found', program: MISSING_FORGE_PROGRAM_PATH });
  });
});
