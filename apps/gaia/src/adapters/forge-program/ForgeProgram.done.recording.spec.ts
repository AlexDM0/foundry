/**
 * The real-system spec of every forge verb done, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record forge-program-done`
 * with the program of a forge that answers F8. It runs that forge under a scratch home in a scratch repository, through ForgeProgram, and
 * records each answer under the example program path: init, version, the login item added, read and removed, the machine limit set, start,
 * update with the Overseer live and stop. The forge's install version stamps the recording.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { CONTRACT_VERSIONS }                                        from '../../shared/constants/ContractVersions.ts';
import { recordSystemVersion }                                      from '../../testing/BoundaryRecordings.ts';
import { createScratchForge, forgeProgramToRun, type ScratchForge } from '../../testing/ScratchForge.ts';

import { createForgeProgram, type ForgeProgram, type ForgeProgramTarget }    from './ForgeProgram.ts';
import { forgeProgramRecordingRun, type ForgeProgramRecordingRun }           from './testing/ForgeProgramRecording.ts';
import { EXAMPLE_FORGE_PROGRAM_PATH, RECORDING_NAME_OF_FORGE_PROGRAM_STAGE } from './testing/RecordedForgeProgram.ts';

const RECORDING_NAME = RECORDING_NAME_OF_FORGE_PROGRAM_STAGE['every-verb-done'];
const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const EXAMPLE_ROOT = '/Users/example/development/example-project';
const EXAMPLE_TRACKER_ID = 'example-tracker';
const EXAMPLE_OVERSEER_ADDRESS = '127.0.0.1:47213';
const LOWERED_MACHINE_LIMIT = 4;

let scratchForge: ScratchForge;
let recordingRun: ForgeProgramRecordingRun;
let forgeProgram: ForgeProgram;
let forge: ForgeProgramTarget;

beforeAll(async () => {
  scratchForge = createScratchForge(RECORDING_NAME);
  const repository = await scratchForge.createRepository('example-project');
  scratchForge.exampleValueFor({ drawn: repository, example: EXAMPLE_ROOT });
  recordingRun = forgeProgramRecordingRun({ recordingName: RECORDING_NAME, scratchForge, program: forgeProgramToRun(RECORDING_NAME) });
  forgeProgram = createForgeProgram({ processRun: recordingRun, settingsProgramPath: () => null });
  forge        = { root: repository, program: EXAMPLE_FORGE_PROGRAM_PATH };
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  recordingRun.recordAnswers();
  await scratchForge.remove();
}, SETUP_TIMEOUT_MILLISECONDS);

function lastDocument(): Record<string, unknown> {
  const answer = recordingRun.lastAnswer();
  if (answer?.verdict !== 'finished') throw new Error(`the forge answered ${JSON.stringify(answer)}`);
  return JSON.parse(answer.standardOutput) as Record<string, unknown>;
}

describe('a forge that answers F8, every verb done', () => {
  test('init creates the tracker and answers its tracker id, project and root', async () => {
    const verdict = await forgeProgram.init(forge, 'Example Project');
    expect(lastDocument()).toMatchObject({ answerVersion: 2, outcome: 'created', project: 'Example Project' });
    scratchForge.exampleValueFor({ drawn: String(lastDocument()['trackerId']), example: EXAMPLE_TRACKER_ID });
    expect(verdict.verdict).toBe('done');
  });

  test('version answers the code and install versions, the contracts and the monitor folder', async () => {
    expect(await forgeProgram.version(forge)).toMatchObject({
      verdict: 'done',
      answer:  { contracts: { summary: 1, monitor: CONTRACT_VERSIONS.forgeMonitor, control: CONTRACT_VERSIONS.forgeControl } }
    });
    recordSystemVersion(RECORDING_NAME, `install version ${String(lastDocument()['installVersion'])}, code ${String(lastDocument()['codeVersion'])}`);
  });

  test('the login item is added, read as present and removed', async () => {
    expect(await forgeProgram.loginItem(forge, 'add')).toEqual({ verdict: 'done', answer: { loginItem: 'present' } });
    expect(await forgeProgram.loginItem(forge, 'status')).toEqual({ verdict: 'done', answer: { loginItem: 'present' } });
    expect(await forgeProgram.loginItem(forge, 'remove')).toEqual({ verdict: 'done', answer: { loginItem: 'absent' } });
  });

  test('the machine limit is set below the CPU count', async () => {
    expect(await forgeProgram.machineLimitSet(forge, LOWERED_MACHINE_LIMIT)).toEqual({ verdict: 'done', answer: { outcome: 'done', agentLimit: LOWERED_MACHINE_LIMIT } });
  });

  test('start starts the Overseer and answers once its API answers', async () => {
    const verdict = await forgeProgram.start(forge);
    expect(verdict).toMatchObject({ verdict: 'done', answer: { started: true, generation: 1 } });
    scratchForge.exampleValueFor({ drawn: new URL(String(lastDocument()['url'])).host, example: EXAMPLE_OVERSEER_ADDRESS });
  }, SETUP_TIMEOUT_MILLISECONDS);

  test('update with the Overseer live refreshes the install and needs no Baton pass on the same code', async () => {
    expect(await forgeProgram.update(forge)).toMatchObject({ verdict: 'done', answer: { outcome: 'done', batonPass: { outcome: 'not-needed' } } });
  }, SETUP_TIMEOUT_MILLISECONDS);

  test('stop stops the live Overseer', async () => {
    expect(await forgeProgram.stop(forge)).toEqual({ verdict: 'done', answer: { outcome: 'done' } });
  }, SETUP_TIMEOUT_MILLISECONDS);
});
