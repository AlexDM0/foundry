/**
 * The control contract a monitor sends to `POST /api/v3/commands`: the nine kinds, each body and each answer, under `controlVersion` 3,
 * forge 3.0's. What matters: the list of kinds is exact both ways against `CONTROL_CONTRACT_KINDS`, and each body is both the package's
 * `ForgeControlCommand` and forge's own command, which the typecheck holds; every applied kind answers 200
 * `{controlVersion: 3, outcome, result}` with the outcome `done` or `nothing-to-do`; a body of a contract kind with a field of the wrong
 * type, or none, answers 400 and writes nothing, also where the applier would not check the field; a refused command answers 409 and the
 * install hold 423, each `{controlVersion: 3, refusal, fields, text}` with the refusal's code, its facts (none for 400 and 423) and the
 * sentence the command line prints, also where the API's sentence differs. A change here raises the system version in `forge-contracts`.
 */
import { existsSync, readFileSync } from 'node:fs';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';
import type { ForgeControlCommand } from 'forge-contracts/ForgeControlCommand';

import { MachineLimitsFile }                             from '../../../src/adapters/machine-limits/MachineLimitsFile.ts';
import { OperationRefusalWordingUtil }                   from '../../../src/adapters/utils/OperationRefusalWordingUtil.ts';
import { CONCURRENCY_LIMIT_CEILING_AGENTS }              from '../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import { localStoreLayoutOf }                            from '../../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                              from '../../../src/services/tracker/Workspace.ts';
import type { ControlCommandOf }                         from '../../../src/shared/@types/ControlCommand.ts';
import { OperationRefusal, type OperationRefusalDetail } from '../../../src/shared/OperationRefusal.ts';
import { CONTROL_CONTRACT_KINDS }                        from '../../../src/shared/constants/HephaestusApiContracts.ts';
import { fakeAgentAdapter }                              from '../../../src/testing/FakeAgentAdapter.ts';
import { useRecordedGit }                                from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                        from '../../../src/testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                     from '../../../src/testing/ToolGuard.ts';
import { boardStoreIn }                                  from '../../BoardStoreOf.ts';
import { createArgumentParser }                          from '../../arguments/ArgumentParser.ts';
import { BY_HAND_COMMAND_KINDS }                         from '../../constants/JobVerbs.ts';
import { createCapturedCommandContext }                  from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }        from '../../testing/InitializedScratchRepository.ts';
import {
  COMMAND_ROUTE_KINDS,
  MALFORMED_BODY_TEXT,
  answerControlCommand,
  type CommandRouteRequest
} from './CommandRoute.ts';

const FROZEN_NOW = new Date('2026-11-12T10:00:00+01:00');
const MACHINE_AGENT_CEILING = 4;

type ContractKind = (typeof CONTROL_CONTRACT_KINDS)[number];

/** A body of the kind as the package and as forge both spell it, so a change to either side's shape fails the typecheck. */
type ContractBody<Kind extends ContractKind> = Extract<ForgeControlCommand, { kind: Kind }> & ControlCommandOf<Kind>;


/** Each kind of the control contract, its body as a monitor sends it, and the outcomes its answer may carry. */
const CONTRACT_BODIES: { readonly [Kind in ForgeControlCommand['kind']]: { body: ContractBody<Kind>; outcomes: readonly string[] } } = {
  'hephaestus-pause':          { body: { kind: 'hephaestus-pause' }, outcomes: ['done', 'nothing-to-do'] },
  'hephaestus-unpause':        { body: { kind: 'hephaestus-unpause' }, outcomes: ['done', 'nothing-to-do'] },
  'hephaestus-stop':           { body: { kind: 'hephaestus-stop', now: false }, outcomes: ['done'] },
  'hephaestus-restart':        { body: { kind: 'hephaestus-restart', now: true }, outcomes: ['done'] },
  'talos-restart':             { body: { kind: 'talos-restart' }, outcomes: ['done', 'nothing-to-do'] },
  'concurrency-set':           { body: { kind: 'concurrency-set', limit: 3 }, outcomes: ['done', 'nothing-to-do'] },
  'job-stop-all':              { body: { kind: 'job-stop-all', mode: 'wind-down' }, outcomes: ['done', 'nothing-to-do'] },
  'machine-agent-limit-set':   { body: { kind: 'machine-agent-limit-set', limit: 2 }, outcomes: ['done'] },
  // The runtime answers its version in the recorded run, as the fake agent's program.
  'machine-agent-program-set': { body: { kind: 'machine-agent-program-set', vendor: fakeAgentAdapter().vendor, programPath: process.execPath }, outcomes: ['done'] },
  'interrupted-work-resume':   { body: { kind: 'interrupted-work-resume', target: 'network-outage' }, outcomes: ['nothing-to-do'] },
};

/** A body of each kind with a field: the field of the wrong type, or missing. */
const MALFORMED_BODIES: readonly Record<string, unknown>[] = [
  { kind: 'hephaestus-stop', now: 'yes' },
  { kind: 'hephaestus-restart', now: 1 },
  { kind: 'machine-agent-limit-set', limit: 'two' },
  { kind: 'machine-agent-limit-set' },
  { kind: 'machine-agent-program-set', vendor: 'example-agent' },
  { kind: 'concurrency-set', limit: 'three' },
  { kind: 'concurrency-set' },
  { kind: 'job-stop-all', mode: 'fresh' },
  { kind: 'job-stop-all' },
  { kind: 'interrupted-work-resume', target: 'everything' },
  { kind: 'interrupted-work-resume', target: { jobId: 4 } },
  { kind: 'interrupted-work-resume' },
];

function commandLineSentenceOf(detail: OperationRefusalDetail): string {
  return OperationRefusalWordingUtil.messageOf(new OperationRefusal('refused', detail));
}

const recordedGit = useRecordedGit();
let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('control-contract', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function progressRecordPath(): string {
  return localStoreLayoutOf(requireWorkspace(repositoryDirectory)).progressRecordPath;
}

function routeRequest(launchesHeld = false): CommandRouteRequest {
  const context   = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const workspace = requireWorkspace(repositoryDirectory);
  return {
    commandArguments:    createArgumentParser([]),
    context,
    workspace,
    boardStore:          boardStoreIn(context, workspace),
    launchesHeld:        () => launchesHeld,
    onRuntimeCommand:    () => Promise.resolve('done' as const),
    wake:                () => undefined,
    machineAgentCeiling: MACHINE_AGENT_CEILING,
  };
}

describeWhenGitIsRecorded('the control contract', () => {
  test('names exactly the ten kinds of the contract, each a kind the command route takes', () => {
    expect(Object.keys(CONTRACT_BODIES).sort()).toEqual([...CONTROL_CONTRACT_KINDS].sort());
    expect(CONTROL_CONTRACT_KINDS.filter((kind) => !COMMAND_ROUTE_KINDS.includes(kind))).toEqual([]);
  });

  for (const [kind, { body, outcomes }] of Object.entries(CONTRACT_BODIES)) {
    test(`${kind} answers 200 with control version 3 and an outcome of the contract`, async () => {
      const answer = await answerControlCommand(body, routeRequest());
      // `result` is the applier's own record, outside the contract.
      expect(answer).toEqual({ status: 200, body: { controlVersion: 3, outcome: expect.any(String), result: expect.anything() } });
      expect(outcomes).toContain(String((answer.body as Record<string, unknown>)['outcome']));
    });
  }

  test('a body of a contract kind with a field of the wrong type or none answers 400 with its code and sentence, and writes nothing', async () => {
    const progressBefore = readFileSync(progressRecordPath(), 'utf8');
    for (const body of MALFORMED_BODIES) {
      const malformedAnswer = {
        status: 400,
        body:   {
          controlVersion: 3, refusal: 'malformed-body', fields: {}, text: expect.any(String)
        }
      };
      expect(await answerControlCommand(body, routeRequest()), JSON.stringify(body)).toEqual(malformedAnswer);
    }
    expect(readFileSync(progressRecordPath(), 'utf8')).toBe(progressBefore);
  });

  test('a by-hand kind answers 400 malformed-body as any unknown kind, and writes nothing', async () => {
    const progressBefore = readFileSync(progressRecordPath(), 'utf8');
    const malformedAnswer = {
      status: 400,
      body:   {
        controlVersion: 3, refusal: 'malformed-body', fields: {}, text: MALFORMED_BODY_TEXT
      }
    };
    const byHandBodies = [
      {
        kind: 'task-add', name: 'Example row', startsNow: false, movesTheLink: false
      },
      { kind: 'log-note', text: 'Example note' },
      { kind: 'namespace-set', namespace: 'web' },
      { kind: 'ticket-size', ticketReference: '1', size: 'S' },
      { kind: 'ticket-status-set', ticketReference: '1', status: 'abandoned' },
      { kind: 'ticket-unready', ticketReference: '1' },
      { kind: 'epic-remove', key: 'example-checkout' },
    ];
    expect(BY_HAND_COMMAND_KINDS.filter((kind) => COMMAND_ROUTE_KINDS.includes(kind))).toEqual([]);
    for (const body of byHandBodies) expect(await answerControlCommand(body, routeRequest()), body.kind).toEqual(malformedAnswer);
    expect(readFileSync(progressRecordPath(), 'utf8')).toBe(progressBefore);
  });

  test('a concurrency limit outside 1 to the ceiling answers 409 with its code and sentence, and writes nothing', async () => {
    const progressBefore = readFileSync(progressRecordPath(), 'utf8');
    for (const limit of [0, 2.5, CONCURRENCY_LIMIT_CEILING_AGENTS + 1]) {
      const detail: OperationRefusalDetail = { kind: 'concurrency-limit-out-of-range', limit, ceiling: CONCURRENCY_LIMIT_CEILING_AGENTS };
      const refusedBody = {
        controlVersion: 3, refusal: detail.kind, fields: { limit, ceiling: CONCURRENCY_LIMIT_CEILING_AGENTS }, text: commandLineSentenceOf(detail),
      };
      expect(await answerControlCommand({ kind: 'concurrency-set', limit }, routeRequest())).toEqual({ status: 409, body: refusedBody });
    }
    expect(readFileSync(progressRecordPath(), 'utf8')).toBe(progressBefore);
  });

  test('a machine agent limit above the CPU count answers 409 with its code and sentence, and writes nothing', async () => {
    const request = routeRequest();
    const answer = await answerControlCommand({ kind: 'machine-agent-limit-set', limit: MACHINE_AGENT_CEILING + 1 }, request);
    const limit = MACHINE_AGENT_CEILING + 1;
    const detail: OperationRefusalDetail = { kind: 'machine-agent-limit-above-cpus', limit, ceiling: MACHINE_AGENT_CEILING };
    const refusedBody = {
      controlVersion: 3, refusal: detail.kind, fields: { limit, ceiling: MACHINE_AGENT_CEILING }, text: commandLineSentenceOf(detail)
    };
    expect(answer).toEqual({ status: 409, body: refusedBody });
    const monitorFolder = request.context.platformPorts.dataFolders.monitorFolderOf(request.context.homeDirectory);
    expect(existsSync(MachineLimitsFile.pathIn(monitorFolder))).toBe(false);
  });

  test('a board kind of the contract while launches are held answers 423 with its code and sentence', async () => {
    const heldAnswer = {
      controlVersion: 3, refusal: 'launches-held-by-install-change', fields: {}, text: expect.stringContaining('update')
    };
    expect(await answerControlCommand({ kind: 'concurrency-set', limit: 3 }, routeRequest(true))).toEqual({ status: 423, body: heldAnswer });
  });

  test('a resume of work that is not interrupted answers 409 with the refusal\'s code and sentence, and writes nothing', async () => {
    const progressBefore = readFileSync(progressRecordPath(), 'utf8');
    const answer = await answerControlCommand({ kind: 'interrupted-work-resume', target: { jobId: 'J9' } }, routeRequest());
    const detail: OperationRefusalDetail = { kind: 'board-refusal', boardRefusal: { reason: 'unknown-job', jobId: 'J9' } };
    expect(answer).toEqual({
      status: 409,
      body:   {
        controlVersion: 3, refusal: 'unknown-job', fields: { jobId: 'J9' }, text: commandLineSentenceOf(detail)
      }
    });
    expect(readFileSync(progressRecordPath(), 'utf8')).toBe(progressBefore);
  });

  test('a refused command answers the command line\'s sentence where the API\'s sentence differs', async () => {
    const answer = await answerControlCommand({ kind: 'interrupted-work-resume', target: { ticketReference: '999' } }, routeRequest());
    const refusal = new OperationRefusal('refused', { kind: 'no-readable-ticket', reference: '999' });
    expect(OperationRefusalWordingUtil.messageOf(refusal)).not.toBe(OperationRefusalWordingUtil.apiMessageOf(refusal));
    const refusedBody = {
      controlVersion: 3, refusal: 'no-readable-ticket', fields: { reference: '999' }, text: OperationRefusalWordingUtil.messageOf(refusal)
    };
    expect(answer).toEqual({ status: 409, body: refusedBody });
  });

  test('the Assistant\'s switch with no pipeline stored answers 409 assistant-without-pipeline with its sentence, and once one is stored 200', async () => {
    const detail: OperationRefusalDetail = { kind: 'board-refusal', boardRefusal: { reason: 'assistant-without-pipeline' } };
    expect(await answerControlCommand({ kind: 'pipeline-assistant-set', on: true }, routeRequest())).toEqual({
      status: 409,
      body:   {
        controlVersion: 3, refusal: 'assistant-without-pipeline', fields: {}, text: commandLineSentenceOf(detail)
      }
    });

    expect((await answerControlCommand({ kind: 'pipeline-gates-none' }, routeRequest())).status).toBe(200);
    const switchedOn = await answerControlCommand({ kind: 'pipeline-assistant-set', on: true }, routeRequest());
    expect(switchedOn).toMatchObject({ status: 200, body: { controlVersion: 3, outcome: 'done', result: { pipeline: { assistant: true } } } });
    const switchedOff = await answerControlCommand({ kind: 'pipeline-assistant-set', on: false }, routeRequest());
    expect((switchedOff.body as { result: { pipeline: object } }).result.pipeline).not.toHaveProperty('assistant');
  });

  test('the Assistant\'s switch with an on that is not a boolean, or none, answers 400 malformed-body', async () => {
    for (const body of [{ kind: 'pipeline-assistant-set', on: 'yes' }, { kind: 'pipeline-assistant-set' }]) {
      expect(await answerControlCommand(body, routeRequest())).toMatchObject({ status: 400, body: { refusal: 'malformed-body' } });
    }
  });

  test('the kinds of Flint\'s brain, which no forge runs any more, answer 400 malformed-body as any unknown kind', async () => {
    const malformedAnswer = {
      status: 400,
      body:   {
        controlVersion: 3, refusal: 'malformed-body', fields: {}, text: MALFORMED_BODY_TEXT
      }
    };
    for (const kind of ['flint-brain-start', 'flint-brain-stop']) expect(await answerControlCommand({ kind }, routeRequest()), kind).toEqual(malformedAnswer);
  });

});
