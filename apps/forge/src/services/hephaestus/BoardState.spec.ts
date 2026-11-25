/**
 * agent-dashboard's `GET /api/summary` document. What matters: `summaryOf` answers `summaryVersion: 3` in exactly the shape
 * `testing/fixtures/summary-v3.json` holds, so a change to the shape agent-dashboard reads fails here. A new shape is a new version and a
 * new fixture, never an edit of this one. The state carries each open ticket's forecast, its targets named by the reading's merge
 * forecasting and `null` without one; the launch slots, as many as the concurrency counts; each job's newest launch stamp, `null` when the
 * log lost it; and the picture limits, `null` when the agent takes no pictures. It carries the pipeline facts beside them, and a second
 * state read whose main tip has not moved runs no `git show` for the instruction texts (`docs/reference/hephaestus-api.md`, "Cost of a
 * state read"): git answers from the recorded answers of `src/testing/RecordedGit.ts`, and a stage fails a call it does not hold, which
 * counts the calls.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { JobLiveFactsWithSilence }                           from '../../adapters/@types/BoardStateParts.ts';
import type { FullStatusDocument }                                from '../../adapters/@types/StatusDocument.ts';
import type { LogRecord }                                         from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                                          from '../../lib/tracker-model/@types/Pipeline.ts';
import type { MergeTargetOf }                                     from '../../lib/tracker-model/AirlockClaims.ts';
import { PICTURE_SIZE_LIMIT_BYTES, PICTURES_PER_MESSAGE_LIMIT }   from '../../shared/constants/HephaestusLimits.ts';
import { boardFixture, ticketFixture }                            from '../../testing/BoardFixtures.ts';
import { EXAMPLE_AGENT_FACTS }                                    from '../../testing/ExampleAgentFacts.ts';
import { GIT_CALL_SHAPES, RECORDED_PLACEHOLDERS, useRecordedGit } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }         from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                              from '../../testing/ToolGuard.ts';
import {
  BoardStateAssembly,
  type BoardState,
  type BoardStateReading,
  type MergeForecasting,
  type PipelineSources
} from './BoardState.ts';
import { LaunchSettings } from './LaunchSettings.ts';
import { MainLineReads }  from './MainLineReads.ts';
import { liveJobFixture } from './testing/LiveJobFixture.ts';

const recordedGit = useRecordedGit();

/** The assembly spreads the status document untouched, and no case here reads a field of it. */
const UNREAD_STATUS_DOCUMENT = {} as FullStatusDocument;

const SUMMARY_FIXTURE_PATH = join(import.meta.dir, 'testing', 'fixtures', 'summary-v3.json');

const EXAMPLE_STATE = {
  ticketCountByStatus: { committed: 1, 'in-progress': 1 },
  page:                { payload: {}, tickets: [] },
  jobs:                [{
    id: 'J1', kind: 'build', ticketIds: ['001'], state: 'running', role: 'builder', attempt: 1, live: { tokens: 1200, toolCalls: 4 }
  }],
  decisions:  [{ id: 'D1' }],
  incidents:  [],
  notices:    [{ kind: 'new-code' }],
  mergeQueue: { queuedTicketIds: [], slots: [] },
  hephaestus: {
    state: 'serving', paused: false, url: 'http://127.0.0.1:4100/', generation: 2, codeVersion: 'code-example', installVersion: 17, restartWarning: null
  },
  usage: { resetsAt: null, window: null, windows: [] },
} as unknown as BoardState;

describe('BoardStateAssembly.questionHistoryOf', () => {
  test('keeps every decision and incident record and the records of session jobs alone, a pipeline agent\'s among them', () => {
    const at = '2026-10-29T20:00:00+01:00';
    const records = [
      {
        kind:   'job-launched',
        at,
        jobId:  'J1',
        fields: {
          kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
        }
      },
      {
        kind:   'job-launched',
        at,
        jobId:  'J2',
        fields: {
          kind: 'product-owner', role: 'product-owner', ticketIds: [], attempt: 1, target: null, parentJobId: null
        }
      },
      {
        kind:   'job-launched',
        at,
        jobId:  'J3',
        fields: {
          kind: 'pipeline-agent', role: 'pipeline-agent', ticketIds: [], attempt: 1, target: null, parentJobId: null
        }
      },
      {
        kind: 'job-ended', at, jobId: 'J1', fields: { outcome: 'built' }
      },
      {
        kind: 'job-ended', at, jobId: 'J2', fields: { outcome: 'closed' }
      },
      {
        kind: 'decision-answered', at, decisionId: 'E1', fields: { answer: { 'Which?': 'Both' } }
      },
      {
        kind: 'incident-defaulted', at, incidentId: 'I1', fields: { move: 'ticket-park', cause: 'turn-closed' }
      },
      {
        kind: 'ticket-committed', at, ticketId: '005', fields: {}
      },
    ] as unknown as Parameters<typeof BoardStateAssembly.questionHistoryOf>[0];
    expect(BoardStateAssembly.questionHistoryOf(records).map((record) => ('jobId' in record ? `${record.kind} ${record.jobId}` : record.kind))).toEqual([
      'job-launched J2', 'job-launched J3', 'job-ended J2', 'decision-answered', 'incident-defaulted'
    ]);
  });
});

describe('BoardStateAssembly.endedJobsOf', () => {
  test('answers each ended job with its launch and newest ending, oldest first, a reopened job once in its newest ending\'s place', () => {
    const records = [
      {
        kind:   'job-launched',
        at:     '2026-10-29T20:00:00+01:00',
        jobId:  'J1',
        fields: {
          kind: 'assistant', role: 'assistant', ticketIds: [], attempt: 1, target: null, parentJobId: null
        }
      },
      {
        kind:   'job-launched',
        at:     '2026-10-29T20:00:01+01:00',
        jobId:  'J5',
        fields: {
          kind: 'merge', role: null, ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
        }
      },
      {
        kind: 'job-ended', at: '2026-10-29T20:00:02+01:00', jobId: 'J1', fields: { outcome: 'stopped', cause: 'hephaestus-stopped' }
      },
      {
        kind: 'job-ended', at: '2026-10-29T20:00:03+01:00', jobId: 'J5', fields: { outcome: 'landed', commit: 'c0ffee' }
      },
      {
        kind: 'job-ended', at: '2026-10-29T20:00:04+01:00', jobId: 'J1', fields: { outcome: 'stopped' }
      },
    ] as unknown as Parameters<typeof BoardStateAssembly.endedJobsOf>[0];
    expect(BoardStateAssembly.endedJobsOf(records)).toEqual([
      {
        id: 'J5', kind: 'merge', role: null, ticketIds: ['001'], target: 'main', attempt: 1, state: 'ended', outcome: 'landed', cause: null, endedAt: '2026-10-29T20:00:03+01:00'
      },
      {
        id:        'J1',
        kind:      'assistant',
        role:      'assistant',
        ticketIds: [],
        target:    null,
        attempt:   1,
        state:     'ended',
        outcome:   'stopped',
        cause:     null,
        endedAt:   '2026-10-29T20:00:04+01:00'
      },
    ]);
  });
});

describe('BoardStateAssembly.summaryOf', () => {
  test('answers summaryVersion 3 exactly as the fixture holds it', () => {
    const fixture: unknown = JSON.parse(readFileSync(SUMMARY_FIXTURE_PATH, 'utf8'));
    expect(BoardStateAssembly.summaryOf(EXAMPLE_STATE, 'Example Agency', ['002'])).toEqual(fixture as ReturnType<typeof BoardStateAssembly.summaryOf>);
  });
});

const EXAMPLE_PIPELINE: Pipeline = {
  version: 5, prepare: [], gates: [{ name: 'test', run: 'bun test' }], phases: { build: ['test'], review: ['test'], merge: ['test'] }
};

const NO_PIPELINE_SOURCES: PipelineSources = {
  pipelineReading:      { verdict: 'readable', pipeline: EXAMPLE_PIPELINE },
  pipelineFileText:     `${JSON.stringify(EXAMPLE_PIPELINE)}\n`,
  pipelineSetupReading: { verdict: 'absent' },
  gateProfilesReading:  { verdict: 'absent' },
  mainLine:             null,
  mainLineTexts:        BoardStateAssembly.NO_MAIN_LINE_TEXTS,
};

describe('BoardStateAssembly.boardStateOf', () => {
  const targetOf: MergeTargetOf = (ticket) => (ticket.group === undefined ? 'main' : `group-${ticket.group}`);

  function readingOf(
    mergeForecasting: MergeForecasting | null,
    logRecords: readonly LogRecord[] = [],
    agentTakesPictures = true,
    pipelineSources: PipelineSources = NO_PIPELINE_SOURCES,
  ): BoardStateReading {
    const { board, progress, tickets } = boardFixture({
      tickets:  [ticketFixture({ id: '001', status: 'committed' }), ticketFixture({ id: '002', status: 'committed', dependsOn: ['001'] })],
      pipeline: EXAMPLE_PIPELINE,
    });
    return {
      statusDocument: UNREAD_STATUS_DOCUMENT,
      board,
      progress,
      tickets,
      epics:          [],
      drafts:         [],
      logRecords,
      generatedAt:    new Date('2026-11-10T10:00:00+01:00'),
      liveFactsOf:    () => ({}) as JobLiveFactsWithSilence,
      notices:        [],
      hephaestus:     EXAMPLE_STATE.hephaestus,
      usage:          EXAMPLE_STATE.usage,
      mergeForecasting,
      agentTakesPictures,
      pipelineSources,
      agent:          { ...EXAMPLE_AGENT_FACTS },
    };
  }

  test('carries each open ticket\'s forecast with the targets the merge forecasting names', () => {
    const forecasting: MergeForecasting = { targetOf, branchTreeOf: () => null, forecastsOf: () => ({ againstTarget: {}, pairwiseConflicts: [] }) };
    const { ticketForecasts } = BoardStateAssembly.boardStateOf(readingOf(forecasting));
    expect(ticketForecasts.map((forecast) => forecast.ticketId)).toEqual(['001', '002']);
    expect(ticketForecasts[0]?.steps.at(-1)).toEqual({ kind: 'land', target: 'main' });
    expect(ticketForecasts[0]?.dependents).toEqual([{ ticketId: '002', stillWaitingOnTicketIds: [] }]);
  });

  test('names no target in a forecast when the reading carries no merge forecasting', () => {
    const { ticketForecasts } = BoardStateAssembly.boardStateOf(readingOf(null));
    expect(ticketForecasts[0]?.steps.at(-1)).toEqual({ kind: 'land', target: null });
  });

  function launched(jobId: string, at: string): LogRecord {
    return {
      kind:   'job-launched',
      jobId,
      fields: {
        kind: 'build', role: 'builder', ticketIds: ['001'], attempt: 1, target: 'main', parentJobId: null
      },
      at,
    };
  }

  test('carries the launch slots, as many as the concurrency counts, and the in-progress tickets no job names', () => {
    const reading = readingOf(null);
    reading.progress.jobs = [
      liveJobFixture({ id: 'J1', ticketIds: ['001'] }),
      liveJobFixture({
        id: 'J2', kind: 'assistant', role: 'assistant', target: null
      }),
    ];
    const ticket = reading.board.ticketByReference('002');
    if (ticket !== undefined) ticket.frontmatter.status = 'in-progress';
    const { launchSlots } = BoardStateAssembly.boardStateOf(reading);
    expect(launchSlots).toEqual({ limit: reading.board.concurrency().limit, slotJobIds: ['J1'], inProgressTicketIdsWithoutJob: ['002'] });
    expect(launchSlots.slotJobIds).toHaveLength(reading.board.concurrency().agentsInFlight);
  });

  // A reopened job launches again: the elapsed time shown is the newest launch's.
  test('stamps each job with its newest launch record, and a job whose launch the log lost with null', () => {
    const reading = readingOf(null, [launched('J1', '2026-11-10T09:00:00+01:00'), launched('J1', '2026-11-10T09:30:00+01:00')]);
    reading.progress.jobs = [liveJobFixture({ id: 'J1', ticketIds: ['001'] }), liveJobFixture({ id: 'J2', ticketIds: ['002'] })];
    expect(BoardStateAssembly.boardStateOf(reading).jobs.map(({ id, launchedAt }) => ({ id, launchedAt }))).toEqual([
      { id: 'J1', launchedAt: '2026-11-10T09:30:00+01:00' },
      { id: 'J2', launchedAt: null },
    ]);
  });

  test('serves the picture limits as facts when the agent takes pictures, and null when it does not', () => {
    expect(BoardStateAssembly.boardStateOf(readingOf(null)).pictureLimits).toEqual({
      perMessage:     PICTURES_PER_MESSAGE_LIMIT,
      sizeLimitBytes: PICTURE_SIZE_LIMIT_BYTES,
      mediaTypes:     ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
    });
    expect(BoardStateAssembly.boardStateOf(readingOf(null, [], false)).pictureLimits).toBeNull();
  });

  test('carries the pipeline facts beside the status keys: the stored pipeline, its live flow, every model and effort and the pipeline agent\'s defaults', () => {
    const state = BoardStateAssembly.boardStateOf(readingOf(null));
    expect(state.pipeline.readingVerdict).toBe('readable');
    expect(state.pipelineSetup).toBeNull();
    expect(state.pipelineFlow?.toolbarStage).toBe('live');
    expect(state.profileRuns).toEqual([]);
    expect(state.pipelineChoices).toEqual({ models: ['haiku', 'sonnet', 'opus', 'fable'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'] });
    expect(state.pipelineAgentDefaults).toEqual(LaunchSettings.defaultAgentPairOf('pipelineAgent'));
  });
});

describeWhenGitIsRecorded('the main line texts of a state read', () => {
  const MAIN_LINE = 'main';
  const MAIN_TIP = '2'.repeat(40);
  const BRIEF_PATH = 'docs/example-brief.md';
  const BRIEFED_PIPELINE: Pipeline = { ...EXAMPLE_PIPELINE, agents: { builder: { instructions: [{ kind: 'file', path: BRIEF_PATH }] } } };
  let repositoryDirectory = '';

  beforeEach(() => {
    repositoryDirectory = createScratchDirectory('board-state-main-line');
  });

  afterEach(() => {
    removeScratchDirectory(repositoryDirectory);
  });

  const tipRead = {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${MAIN_LINE}^{commit}`],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { [RECORDED_PLACEHOLDERS.COMMIT]: MAIN_TIP },
  };
  const briefShown = {
    gitArguments: ['show', `${MAIN_TIP}:${BRIEF_PATH}`],
    answeredAs:   GIT_CALL_SHAPES.FILE_ON_BRANCH,
    filledIn:     { [RECORDED_PLACEHOLDERS.TEXT]: 'Example brief of Example Agency.' },
  };

  function stateReadOf(reads: MainLineReads): BoardState {
    const { board, progress, tickets } = boardFixture({ pipeline: BRIEFED_PIPELINE });
    return BoardStateAssembly.boardStateOf({
      statusDocument:     UNREAD_STATUS_DOCUMENT,
      board,
      progress,
      tickets,
      epics:              [],
      drafts:             [],
      logRecords:         [],
      generatedAt:        new Date('2026-11-12T10:00:00+01:00'),
      liveFactsOf:        () => ({}) as JobLiveFactsWithSilence,
      notices:            [],
      hephaestus:         EXAMPLE_STATE.hephaestus,
      usage:              EXAMPLE_STATE.usage,
      mergeForecasting:   null,
      agentTakesPictures: true,
      agent:              { ...EXAMPLE_AGENT_FACTS },
      pipelineSources:    {
        ...NO_PIPELINE_SOURCES,
        pipelineReading: { verdict: 'readable', pipeline: BRIEFED_PIPELINE },
        mainLine:        MAIN_LINE,
        mainLineTexts:   BoardStateAssembly.mainLineTextsOf(reads, repositoryDirectory, MAIN_LINE),
      },
    });
  }

  function builderBriefTextOf(state: BoardState): string | null | undefined {
    return state.pipelineFlow?.nodes.find((node) => node.nodeId === 'builder')?.instructionEntries[0]?.text;
  }

  test('a second state read with the same main tip runs no git show for the instruction texts', async () => {
    const reads = new MainLineReads(repositoryDirectory);

    const first = await recordedGit.playStage([tipRead, briefShown], async () => stateReadOf(reads));
    const second = await recordedGit.playStage([tipRead], async () => stateReadOf(reads));

    expect([builderBriefTextOf(first), builderBriefTextOf(second)]).toEqual(['Example brief of Example Agency.\n', 'Example brief of Example Agency.\n']);
  });

  test('a moved main tip shows the texts again', async () => {
    const reads = new MainLineReads(repositoryDirectory);
    const movedTip = '3'.repeat(40);
    await recordedGit.playStage([tipRead, briefShown], async () => stateReadOf(reads));

    const moved = await recordedGit.playStage([
      { ...tipRead, filledIn: { [RECORDED_PLACEHOLDERS.COMMIT]: movedTip } },
      { ...briefShown, gitArguments: ['show', `${movedTip}:${BRIEF_PATH}`] },
    ], async () => stateReadOf(reads));

    expect(builderBriefTextOf(moved)).toBe('Example brief of Example Agency.\n');
  });
});
