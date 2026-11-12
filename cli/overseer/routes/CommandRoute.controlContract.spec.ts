/**
 * Control contract 1, which a monitor such as Gaia reads `contracts.control` for: the seven kinds, each body and each answer. What matters:
 * the list of kinds is exact both ways against `CONTROL_CONTRACT_KINDS`; every applied kind answers 200 `{controlVersion: 1, outcome}` with
 * the outcome `done` or `nothing-to-do`; a body of a contract kind with a field of the wrong type answers 400; a refused command answers 409
 * and the install hold 423, each `{controlVersion: 1, refusal, text}` with the refusal's code and its sentence. A change here raises
 * `contracts.control` in `src/shared/constants/OverseerApiContracts.ts`.
 */
import { existsSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { MachineLimitsFile }                              from '../../../src/adapters/machine-limits/MachineLimitsFile.ts';
import { CONTROL_COMMAND_KINDS }                          from '../../../src/services/control/ControlService.ts';
import { CONTROL_CONTRACT_KINDS }                         from '../../../src/shared/constants/OverseerApiContracts.ts';
import { useRecordedGit }                                 from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                         from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../../src/testing/ToolGuard.ts';
import { createArgumentParser }                           from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                   from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }         from '../../testing/InitializedScratchRepository.ts';
import { answerControlCommand, type CommandRouteRequest } from './CommandRoute.ts';

const FROZEN_NOW = new Date('2026-11-12T10:00:00+01:00');
const MACHINE_AGENT_CEILING = 4;

/** Each kind of control contract 1, its body as a monitor sends it, and the outcomes its answer may carry. */
const CONTRACT_BODIES: Readonly<Record<(typeof CONTROL_CONTRACT_KINDS)[number], { body: Record<string, unknown>; outcomes: readonly string[] }>> = {
  'overseer-pause':          { body: { kind: 'overseer-pause' }, outcomes: ['done', 'nothing-to-do'] },
  'overseer-resume':         { body: { kind: 'overseer-resume' }, outcomes: ['done', 'nothing-to-do'] },
  'overseer-stop':           { body: { kind: 'overseer-stop', now: false }, outcomes: ['done'] },
  'overseer-restart':        { body: { kind: 'overseer-restart', now: true }, outcomes: ['done'] },
  'concurrency-set':         { body: { kind: 'concurrency-set', limit: 3 }, outcomes: ['done', 'nothing-to-do'] },
  'job-stop-all':            { body: { kind: 'job-stop-all', mode: 'wind-down' }, outcomes: ['done', 'nothing-to-do'] },
  'machine-agent-limit-set': { body: { kind: 'machine-agent-limit-set', limit: 2 }, outcomes: ['done'] },
};

/** A body of each kind whose field has the wrong type; the runtime kinds and the limits take only that field. */
const MALFORMED_BODIES: readonly Record<string, unknown>[] = [
  { kind: 'overseer-stop', now: 'yes' },
  { kind: 'overseer-restart', now: 1 },
  { kind: 'machine-agent-limit-set', limit: 'two' },
];

const recordedGit = useRecordedGit();
let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('control-contract', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function routeRequest(launchesHeld = false): CommandRouteRequest {
  return {
    commandArguments:    createArgumentParser([]),
    context:             createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW }),
    launchesHeld:        () => launchesHeld,
    onRuntimeCommand:    () => undefined,
    wake:                () => undefined,
    machineAgentCeiling: MACHINE_AGENT_CEILING,
  };
}

describeWhenGitIsRecorded('control contract 1', () => {
  test('names exactly the seven kinds of the contract, each a kind the control service applies', () => {
    expect(Object.keys(CONTRACT_BODIES).sort()).toEqual([...CONTROL_CONTRACT_KINDS].sort());
    expect(CONTROL_CONTRACT_KINDS.filter((kind) => !(CONTROL_COMMAND_KINDS as readonly string[]).includes(kind))).toEqual([]);
  });

  for (const [kind, { body, outcomes }] of Object.entries(CONTRACT_BODIES)) {
    test(`${kind} answers 200 with control version 1 and an outcome of the contract`, async () => {
      const answer = await answerControlCommand(body, routeRequest());
      expect(answer.status).toBe(200);
      const answerBody = answer.body as Record<string, unknown>;
      expect(answerBody['controlVersion']).toBe(1);
      expect(outcomes).toContain(String(answerBody['outcome']));
    });
  }

  test('a body of a contract kind with a field of the wrong type answers 400 with its code and sentence', async () => {
    for (const body of MALFORMED_BODIES) {
      expect(await answerControlCommand(body, routeRequest())).toEqual({ status: 400, body: { controlVersion: 1, refusal: 'malformed-body', text: expect.any(String) }, });
    }
  });

  test('a machine agent limit above the CPU count answers 409 with its code and sentence, and writes nothing', async () => {
    const request = routeRequest();
    const answer = await answerControlCommand({ kind: 'machine-agent-limit-set', limit: MACHINE_AGENT_CEILING + 1 }, request);
    expect(answer).toEqual({ status: 409, body: { controlVersion: 1, refusal: 'machine-agent-limit-above-cpus', text: expect.stringContaining('CPUs') }, });
    const monitorFolder = request.context.platformPorts.dataFolders.monitorFolderOf(request.context.homeDirectory);
    expect(existsSync(MachineLimitsFile.pathIn(monitorFolder))).toBe(false);
  });

  test('a board kind of the contract while launches are held answers 423 with its code and sentence', async () => {
    const heldAnswer = { controlVersion: 1, refusal: 'launches-held-by-install-change', text: expect.stringContaining('update') };
    expect(await answerControlCommand({ kind: 'concurrency-set', limit: 3 }, routeRequest(true))).toEqual({ status: 423, body: heldAnswer });
  });
});
