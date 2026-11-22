/**
 * ForgeProgram over the recorded forge program, one answer set per stage: a forge checkout recorded before it answers in versioned JSON,
 * and a forge that answers F8 recorded with every verb done, and with every verb refused. What matters: the call each verb makes and where,
 * the program PLAN 8.2 picks, a refusal's code and sentence passed through unchanged, and an answer Gaia does not understand named so.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import type { ProcessRun }                           from '../../lib/process-run/ProcessRun.ts';
import { recordedForgeVersionsOf }                   from '../../testing/BoundaryRecordings.ts';
import { recordedRunsOf, runCallShapeOf }            from '../../testing/RecordedRuns.ts';
import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';

import { createForgeProgram, type ForgeProgramTarget } from './ForgeProgram.ts';
import {
  EXAMPLE_FORGE_PROGRAM_PATH,
  MISSING_FORGE_PROGRAM_PATH,
  RECORDING_NAME_OF_FORGE_PROGRAM_STAGE,
  recordedForgeProgramRunOf,
  type ForgeProgramStage,
} from './testing/RecordedForgeProgram.ts';

/** The forge the F8 answers were recorded from, as the recording's stamp names it. */
const RECORDED_FORGE_VERSIONS = recordedForgeVersionsOf(RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['every-verb-done']);

const EXAMPLE_CONTRACTS = { summary: 3, monitor: 6, control: 3 };

let forgeRoot = '';

beforeAll(() => {
  forgeRoot = createScratchDirectory('example-project');
});

afterAll(() => {
  removeScratchPath(forgeRoot);
});

function registeredForge(program: string | null = EXAMPLE_FORGE_PROGRAM_PATH): ForgeProgramTarget {
  return { root: forgeRoot, program };
}

function forgeProgramAt(stage: ForgeProgramStage, settingsProgramPath: string | null = null) {
  const processRun = recordedForgeProgramRunOf(stage);
  return { processRun, forgeProgram: createForgeProgram({ processRun, settingsProgramPath: () => settingsProgramPath }) };
}

/** The recorded forge program, also noting the working directory of each call: the recorded call shape leaves it out. */
function forgeProgramNotingWorkingDirectories(stage: ForgeProgramStage) {
  const recordedRun = recordedForgeProgramRunOf(stage);
  const workingDirectories: string[] = [];
  const processRun: ProcessRun = {
    run: (request) => {
      workingDirectories.push(request.workingDirectory);
      return recordedRun.run(request);
    },
    startOwned: (request) => {
      workingDirectories.push(request.workingDirectory);
      return recordedRun.startOwned(request);
    },
    startDetached: (request) => {
      workingDirectories.push(request.workingDirectory);
      return recordedRun.startDetached(request);
    },
  };
  return {
    forgeProgram:       createForgeProgram({ processRun, settingsProgramPath: () => null }),
    callShapesAnswered: recordedRun.callShapesAnswered,
    workingDirectories,
  };
}

/** The refusal document the refused recording holds for a call shape, read from the recording itself. */
function recordedRefusalOf(programArguments: readonly string[]): { readonly verdict: 'refused'; readonly refusal: string; readonly text: string } {
  const callShape = runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, programArguments);
  const recorded  = recordedRunsOf(RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['every-verb-refused']).find((run) => run.callShape === callShape);
  if (recorded?.answer.verdict !== 'finished') throw new Error(`The refused recording holds no finished run for ${callShape}`);
  const { refusal, text } = JSON.parse(recorded.answer.standardOutput) as { refusal: string; text: string };
  return { verdict: 'refused', refusal, text };
}

describe('a forge checkout that does not answer in versioned JSON yet (recorded)', () => {
  test('answers version --json without answerVersion, which is an answer not understood, at exit 0', async () => {
    const { forgeProgram } = forgeProgramAt('forge-before-versioned-answers');
    expect(await forgeProgram.version(registeredForge())).toEqual({ verdict: 'answer-not-understood', reason: 'other-answer-version', exitCode: 0 });
  });

  test('refuses init and update with --json on standard error only, which is an answer not understood, at exit 1', async () => {
    const { forgeProgram } = forgeProgramAt('forge-before-versioned-answers');
    expect(await forgeProgram.init(registeredForge(), 'Example Project')).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 });
    expect(await forgeProgram.update(registeredForge())).toEqual({ verdict: 'answer-not-understood', reason: 'no-json', exitCode: 1 });
  });

  test('answers program-not-found with the path it tried for a forge program that is not there', async () => {
    const { forgeProgram } = forgeProgramAt('forge-before-versioned-answers');
    expect(await forgeProgram.version(registeredForge(MISSING_FORGE_PROGRAM_PATH))).toEqual({ verdict: 'program-not-found', program: MISSING_FORGE_PROGRAM_PATH });
  });
});

describe('every verb done (recorded)', () => {
  test('start answers done with the started Hephaestus, its code, install version and contracts', async () => {
    const { forgeProgram } = forgeProgramAt('every-verb-done');
    expect(await forgeProgram.start(registeredForge())).toEqual({
      verdict: 'done',
      answer:  {
        started:    true,
        url:        'http://127.0.0.1:47213/',
        generation: 1,
        trackerId:  'example-tracker',
        ...RECORDED_FORGE_VERSIONS,
        contracts:  EXAMPLE_CONTRACTS,
      },
    });
  });

  test('stop, init and update answer done with their outcome and what they report', async () => {
    const { forgeProgram } = forgeProgramAt('every-verb-done');
    expect(await forgeProgram.stop(registeredForge())).toEqual({ verdict: 'done', answer: { outcome: 'done' } });
    expect(await forgeProgram.init(registeredForge(), 'Example Project')).toEqual({
      verdict: 'done',
      answer:  {
        outcome: 'created', trackerId: 'example-tracker', project: 'Example Project', root: '/Users/example/development/example-project'
      },
    });
    expect(await forgeProgram.update(registeredForge())).toEqual({
      verdict: 'done',
      answer:  { outcome: 'done', installVersion: RECORDED_FORGE_VERSIONS.installVersion, restart: { outcome: 'not-needed' } },
    });
  });

  test('version answers done with the code and install versions, the contracts, the Talos protocol version and the monitor folder', async () => {
    const { forgeProgram } = forgeProgramAt('every-verb-done');
    expect(await forgeProgram.version(registeredForge())).toEqual({
      verdict: 'done',
      answer:  {
        ...RECORDED_FORGE_VERSIONS, contracts: EXAMPLE_CONTRACTS, talosProtocolVersion: 2, monitorFolder: '/Users/example/.forge-monitor'
      },
    });
  });

  test('the machine limit answers done with the limit it leaves', async () => {
    const { forgeProgram } = forgeProgramAt('every-verb-done');
    expect(await forgeProgram.machineLimitSet(registeredForge(), 4)).toEqual({ verdict: 'done', answer: { outcome: 'done', agentLimit: 4 } });
  });

  test('each verb runs the forge program with --json in the forge root', async () => {
    const { forgeProgram, callShapesAnswered, workingDirectories } = forgeProgramNotingWorkingDirectories('every-verb-done');
    const forge = registeredForge();
    await forgeProgram.start(forge);
    await forgeProgram.stop(forge);
    await forgeProgram.init(forge, 'Example Project');
    await forgeProgram.update(forge);
    await forgeProgram.version(forge);
    await forgeProgram.machineLimitSet(forge, 4);
    expect(callShapesAnswered()).toEqual([
      runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['start', '--json']),
      runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json']),
      runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['init', '--project', 'Example Project', '--json']),
      runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['update', '--json']),
      runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['version', '--json']),
      runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['machine', 'limit', '4', '--json']),
    ]);
    expect(workingDirectories).toEqual(callShapesAnswered().map(() => forgeRoot));
  });
});

describe('every verb refused (recorded)', () => {
  test('a refusal at exit 1 answers refused with the forge\'s code and sentence unchanged', async () => {
    const { forgeProgram } = forgeProgramAt('every-verb-refused');
    const forge = registeredForge();
    expect(await forgeProgram.start(forge)).toEqual(recordedRefusalOf(['start', '--json']));
    expect(await forgeProgram.stop(forge)).toEqual(recordedRefusalOf(['stop', '--json']));
    expect(await forgeProgram.init(forge, 'Example Project')).toEqual(recordedRefusalOf(['init', '--project', 'Example Project', '--json']));
    expect(await forgeProgram.update(forge)).toEqual(recordedRefusalOf(['update', '--json']));
    expect(await forgeProgram.machineLimitSet(forge, 64)).toEqual(recordedRefusalOf(['machine', 'limit', '64', '--json']));
  });

  test('a refusal keeps the forge\'s own words', async () => {
    const { forgeProgram } = forgeProgramAt('every-verb-refused');
    expect(await forgeProgram.machineLimitSet(registeredForge(), 64)).toEqual({
      verdict: 'refused',
      refusal: 'machine-agent-limit-above-cpus',
      text:    'A machine agent limit of 64 is above the 10 CPUs this machine has, so nothing was written.',
    });
  });
});

describe('the program a verb runs (PLAN 8.2)', () => {
  test('is the registry\'s program for the forge, before the one in the settings', async () => {
    const { forgeProgram, processRun } = forgeProgramAt('every-verb-done', MISSING_FORGE_PROGRAM_PATH);
    expect(await forgeProgram.stop(registeredForge(EXAMPLE_FORGE_PROGRAM_PATH))).toEqual({ verdict: 'done', answer: { outcome: 'done' } });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json'])]);
  });

  test('is the one in the settings when the registry names none', async () => {
    const { forgeProgram, processRun } = forgeProgramAt('every-verb-done', EXAMPLE_FORGE_PROGRAM_PATH);
    expect(await forgeProgram.stop(registeredForge(null))).toEqual({ verdict: 'done', answer: { outcome: 'done' } });
    expect(processRun.callShapesAnswered()).toEqual([runCallShapeOf(EXAMPLE_FORGE_PROGRAM_PATH, ['stop', '--json'])]);
  });

  test('is read from the settings at each verb, so a program chosen later counts from the next verb on', async () => {
    const processRun = recordedForgeProgramRunOf('every-verb-done');
    let settingsProgramPath: string | null = null;
    const forgeProgram = createForgeProgram({ processRun, settingsProgramPath: () => settingsProgramPath });
    expect(await forgeProgram.stop(registeredForge(null))).toEqual({ verdict: 'program-not-found', program: null });
    settingsProgramPath = EXAMPLE_FORGE_PROGRAM_PATH;
    expect(await forgeProgram.stop(registeredForge(null))).toEqual({ verdict: 'done', answer: { outcome: 'done' } });
  });

  test('is not found, and nothing runs, when neither the registry nor the settings name one', async () => {
    const { forgeProgram, processRun } = forgeProgramAt('every-verb-done');
    expect(await forgeProgram.start(registeredForge(null))).toEqual({ verdict: 'program-not-found', program: null });
    expect(processRun.callShapesAnswered()).toEqual([]);
  });
});
