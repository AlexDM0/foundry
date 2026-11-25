/**
 * A scratch board's `BoardState`, assembled by `BoardStateAssembly` as Hephaestus assembles it: a committed ticket in an epic, an
 * in-progress ticket with its row and a live build job, a decision, an incident, an open draft, an open pipeline setup with its
 * draft, and pipeline records, one of a kind the contract does not declare among them.
 */
import type { JobLiveFactsWithSilence } from '../../../adapters/@types/BoardStateParts.ts';
import type { FullStatusDocument }      from '../../../adapters/@types/StatusDocument.ts';
import type { Decision }                from '../../../lib/tracker-model/@types/Decision.ts';
import type { Draft }                   from '../../../lib/tracker-model/@types/Draft.ts';
import type { Incident }                from '../../../lib/tracker-model/@types/Incident.ts';
import type { LogRecord }               from '../../../lib/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                from '../../../lib/tracker-model/@types/Pipeline.ts';
import type { PipelineSetup }           from '../../../lib/tracker-model/@types/PipelineSetup.ts';
import {
  boardFixture,
  epicFixture,
  taskFixture,
  ticketFixture
} from '../../../testing/BoardFixtures.ts';
import { EXAMPLE_AGENT_FACTS }                 from '../../../testing/ExampleAgentFacts.ts';
import type { BoardDocumentSource }            from '../BoardDocumentAssembly.ts';
import { BoardStateAssembly, type BoardState } from '../BoardState.ts';
import { liveJobFixture }                      from './LiveJobFixture.ts';

const AT = '2026-11-19T10:00:00+01:00';

export const BOARD_STATE_FIXTURE_PIPELINE: Pipeline = {
  version: 5,
  prepare: [{ name: 'install', run: 'bun install' }],
  gates:   [{ name: 'test', run: 'bun test', network: ['registry.example.com'] }],
  phases:  { build: ['test'], review: ['test'], merge: ['test'] },
  review:  { name: 'review', reReview: { thresholdLines: 40 } },
  agents:  { builder: { model: 'opus', effort: 'high', instructions: [{ kind: 'constitution' }] } },
};

const SETUP: PipelineSetup = {
  formatVersion:   4,
  setupId:         'S1',
  mode:            'update',
  baseContentHash: 'example-content-hash',
  stepStates:      {
    agent: 'done', billing: 'done', research: 'done', constitution: 'done', design: 'in-progress', apply: 'not-started'
  },
  currentStep:     'design',
  billing:         { mode: 'api', maxBudgetUsd: 12 },
  agent:           { vendor: 'example-agent', program: { follows: 'machine' } },
  agentJobId:      null,
  snapshotCommit:  '1'.repeat(40),
  readyToContinue: ['design'],
  findings:        [{
    findingId:   'F1',
    topic:       'scripts',
    label:       'Unit tests',
    value:       null,
    sourcePaths: ['package.json'],
    script:      {
      name: 'test', run: 'bun test', meaning: 'Runs the unit tests.', gateCandidate: 'gate', needs: []
    },
    needsRecheck: false,
  }],
  questions: [{
    questionId:  'Q1',
    step:        'design',
    subject:     { kind: 'gate', reference: 'test' },
    question:    'Does the test gate need the network?',
    context:     'It installs packages.',
    options:     [{ letter: 'a', text: 'Yes' }, { letter: 'b', text: 'No' }],
    recommended: ['a'],
    multiple:    false,
    answer:      { letters: ['a'], answeredAt: AT },
  }],
  constitution: {
    markdown:    '## Names\n- Write full names.',
    annotations: [{
      lineText: '- Write full names.', occurrence: 1, kind: 'research', path: 'CONTRIBUTING.md'
    }],
    draftedFrom: { contributing: true, research: true, installedDefault: false },
    baseBlob:    null,
    revision:    2,
  },
  draft:         { ...BOARD_STATE_FIXTURE_PIPELINE, gates: [...BOARD_STATE_FIXTURE_PIPELINE.gates, { name: 'lint', run: 'bun run lint' }] },
  draftRevision: 3,
  edits:         [{
    editId: 'E1', by: 'user', field: 'gate:lint', summary: 'Adds the lint gate.', undone: false
  }],
  replacesUnreadablePipeline: false,
  applyRequest:               null,
  nextNumbers:                { finding: 2, question: 2, edit: 2 },
  extra:                      [],
};

const DECISION: Decision = {
  id:        'E1',
  kind:      'agent-question',
  ticketIds: ['002'],
  jobId:     'J1',
  askedBy:   'builder',
  requestId: 'request-example',
  questions: [{
    question:    'Which format?',
    header:      'Format',
    multiSelect: false,
    options:     [
      {
        label: 'CSV', description: 'Comma separated', isRecommended: true, touches: ['src/export.ts']
      },
      { label: 'JSON', description: 'One document', isRecommended: false },
    ],
  }],
  context:  'The export needs a format.',
  openedAt: AT,
};

const INCIDENT: Incident = {
  id:              'I1',
  kind:            'blocked',
  ticketIds:       ['002'],
  jobId:           'J1',
  facts:           { reason: 'The registry is down.' },
  defaultMove:     'ticket-park',
  deliveredInTurn: null,
  openedAt:        AT,
};

const DRAFT: Draft = {
  id:        'D1',
  title:     'Example export',
  request:   'Export the orders of Example Agency.',
  openedAt:  AT,
  claim:     null,
  notes:     [],
  questions: [{
    id:          'Q1',
    question:    'Which orders?',
    context:     '',
    options:     [{ letter: 'a', text: 'All' }],
    multiple:    false,
    recommended: ['a'],
    answer:      null,
    followUps:   [],
  }],
  nextNoteNumber:     1,
  nextQuestionNumber: 2,
  extra:              [],
};

const LOG_RECORDS: LogRecord[] = [
  {
    kind:   'job-launched',
    at:     AT,
    jobId:  'J1',
    fields: {
      kind: 'build', role: 'builder', ticketIds: ['002'], attempt: 1, target: 'main', parentJobId: null
    },
  },
  { kind: 'pipeline-gate-added', at: AT, fields: { name: 'test', run: 'bun test' } },
  {
    kind: 'pipeline-setup-opened', at: AT, setupId: 'S1', fields: { mode: 'update', replacesUnreadablePipeline: false }
  },
  {
    kind:       'decision-opened',
    at:         AT,
    decisionId: 'E1',
    fields:     { kind: 'agent-question', ticketIds: ['002'] }
  },
];

const LIVE_FACTS: JobLiveFactsWithSilence = {
  jobId:                  'J1',
  calls:                  12,
  callBudget:             200,
  tokens:                 48_000,
  toolCalls:              30,
  lastToolCall:           { toolName: 'Edit', startedAt: AT, running: true },
  subagents:              [],
  toolCallsWithSubagents: 30,
  turn:                   'mid-turn',
  messagesWaiting:        0,
  lastLine:               null,
  usageWindow:            null,
  silentSweeps:           1,
};

/** The status document carries far more; the board document reads only its project and its confinement. */
const STATUS_DOCUMENT = { project: 'Example Agency', confinement: 'confined' } as FullStatusDocument;

/** The scratch board's reading as the board document reads it: its state, the Board it was read from, and the reading's moment. */
export function boardDocumentSourceFixture(): BoardDocumentSource {
  const { board, progress, tickets } = boardFixture({
    tasks: [taskFixture({
      id: 1, ticket: '002', status: 'in-progress', start: AT, history: [{ status: 'committed', at: AT }, { status: 'in-progress', at: AT }]
    })],
    tickets: [
      ticketFixture({
        id: '001', status: 'committed', priority: 'high', epics: ['example-checkout'], model: 'opus', contentHash: '0123456789abcdef'
      }),
      ticketFixture({
        id: '002', status: 'in-progress', dependsOn: ['001'], task: 1, started: AT
      }),
    ],
    epics:         [epicFixture()],
    drafts:        [DRAFT],
    pipeline:      BOARD_STATE_FIXTURE_PIPELINE,
    pipelineSetup: { verdict: 'readable', setup: SETUP },
  });
  progress.jobs = [liveJobFixture({ id: 'J1', ticketIds: ['002'], interruption: 'network-outage' })];
  progress.decisions = [DECISION];
  progress.incidents = [INCIDENT];
  const state = BoardStateAssembly.boardStateOf({
    statusDocument: STATUS_DOCUMENT,
    board,
    progress,
    tickets,
    epics:          [epicFixture()],
    drafts:         [DRAFT],
    logRecords:     LOG_RECORDS,
    generatedAt:    new Date(AT),
    liveFactsOf:    () => LIVE_FACTS,
    notices:        [{ kind: 'attribution-found', ticketId: '002' }, 'not a notice'],
    hephaestus:     {
      state: 'serving', paused: false, url: null, generation: 2, codeVersion: 'code-example', installVersion: 36, restartWarning: null
    },
    usage: {
      resetsAt: null,
      window:   null,
      windows:  [{
        window: 'five_hour', lengthHours: 5, utilization: 40, resetsAt: AT
      }]
    },
    mergeForecasting:   null,
    agentTakesPictures: true,
    agent:              { ...EXAMPLE_AGENT_FACTS },
    pipelineSources:    {
      pipelineReading:      { verdict: 'readable', pipeline: BOARD_STATE_FIXTURE_PIPELINE },
      pipelineFileText:     `${JSON.stringify(BOARD_STATE_FIXTURE_PIPELINE)}\n`,
      pipelineSetupReading: { verdict: 'readable', setup: SETUP },
      gateProfilesReading:  { verdict: 'absent' },
      mainLine:             null,
      mainLineTexts:        BoardStateAssembly.NO_MAIN_LINE_TEXTS,
    },
  });
  return {
    state, board, logRecords: LOG_RECORDS, now: new Date(AT)
  };
}

export function boardStateFixture(): BoardState {
  return boardDocumentSourceFixture().state;
}
