/**
 * Control contract 1, which a monitor such as Gaia reads `contracts.control` for: the seven kinds, each body and each answer. What matters:
 * the list of kinds is exact both ways against `CONTROL_CONTRACT_KINDS`; every applied kind answers 200 `{controlVersion: 1, outcome,
 * result}` with the outcome `done` or `nothing-to-do`; a body of a contract kind with a field of the wrong type, or none, answers 400 and
 * writes nothing, also where the applier would not check the field; a refused command answers 409 and the install hold 423, each
 * `{controlVersion: 1, refusal, text}` with the refusal's code and its sentence. A change here raises `contracts.control` in
 * `src/shared/constants/OverseerApiContracts.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { MachineLimitsFile }                              from '../../../src/adapters/machine-limits/MachineLimitsFile.ts';
import { CONCURRENCY_LIMIT_CEILING_AGENTS }               from '../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import { CONTROL_COMMAND_KINDS }                          from '../../../src/services/control/ControlService.ts';
import { requireWorkspace }                               from '../../../src/services/tracker/Workspace.ts';
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

/** A body of each kind with a field: the field of the wrong type, or missing. */
const MALFORMED_BODIES: readonly Record<string, unknown>[] = [
  { kind: 'overseer-stop', now: 'yes' },
  { kind: 'overseer-restart', now: 1 },
  { kind: 'machine-agent-limit-set', limit: 'two' },
  { kind: 'machine-agent-limit-set' },
  { kind: 'concurrency-set', limit: 'three' },
  { kind: 'concurrency-set' },
  { kind: 'job-stop-all', mode: 'fresh' },
  { kind: 'job-stop-all' },
];

const recordedGit = useRecordedGit();
let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('control-contract', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function progressFilePath(): string {
  return requireWorkspace(repositoryDirectory).progressFilePath;
}

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
      // `result` is the applier's own record, outside the contract.
      expect(answer).toEqual({ status: 200, body: { controlVersion: 1, outcome: expect.any(String), result: expect.anything() } });
      expect(outcomes).toContain(String((answer.body as Record<string, unknown>)['outcome']));
    });
  }

  test('a body of a contract kind with a field of the wrong type or none answers 400 with its code and sentence, and writes nothing', async () => {
    const progressBefore = readFileSync(progressFilePath(), 'utf8');
    for (const body of MALFORMED_BODIES) {
      const malformedAnswer = { status: 400, body: { controlVersion: 1, refusal: 'malformed-body', text: expect.any(String) } };
      expect(await answerControlCommand(body, routeRequest()), JSON.stringify(body)).toEqual(malformedAnswer);
    }
    expect(readFileSync(progressFilePath(), 'utf8')).toBe(progressBefore);
  });

  test('a concurrency limit outside 1 to the ceiling answers 409 with its code and sentence, and writes nothing', async () => {
    const progressBefore = readFileSync(progressFilePath(), 'utf8');
    for (const limit of [0, 2.5, CONCURRENCY_LIMIT_CEILING_AGENTS + 1]) {
      const refusedBody = { controlVersion: 1, refusal: 'concurrency-limit-out-of-range', text: expect.stringContaining(`from 1 to ${CONCURRENCY_LIMIT_CEILING_AGENTS}`) };
      expect(await answerControlCommand({ kind: 'concurrency-set', limit }, routeRequest())).toEqual({ status: 409, body: refusedBody });
    }
    expect(readFileSync(progressFilePath(), 'utf8')).toBe(progressBefore);
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
