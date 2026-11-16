/**
 * The pipeline facts of the board state (PLAN 9.1). What matters: the stored pipeline as its reading says, with its newest Apply; the setup
 * facts (counts, the agent job's state, the constitution's HTML, its outline counting `##` lines and top-level `-` items, each annotation
 * with the index of the line it anchors, the roles reading the constitution, and a held Apply's blocking files and the ticket holding
 * main); the flow's stage, its question markers and its change list; the live occupants on the node of each job's step, a review
 * catching up with main on the merge before review (Q5) and a filing draft on ticket creation, never the constitution commit job; every
 * model and effort in order (Q9); and each gate's cache mark from its newest run in a phase, a job's or a profile's, by log order. The main
 * line's texts arrive as a parameter, so no case runs git.
 */
import { describe, expect, test } from 'bun:test';

import type { PipelineReading }     from '../../adapters/pipeline/PipelineFile.ts';
import type { Draft }               from '../../lib/tracker-model/@types/Draft.ts';
import type { GatePhase }           from '../../lib/tracker-model/@types/GatePhase.ts';
import type { GateProfilesReading } from '../../lib/tracker-model/@types/GateProfile.ts';
import type {
  Airlock,
  GateCacheReport,
  GateRunCacheReports,
  Job
} from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                  from '../../lib/tracker-model/@types/LogRecord.ts';
import type { InstructionEntry, Pipeline } from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  MainConstitutionReading,
  PipelineSetup,
  PipelineSetupReading,
  SetupQuestion
} from '../../lib/tracker-model/@types/PipelineSetup.ts';
import type { Task }                  from '../../lib/tracker-model/@types/Task.ts';
import type { Ticket }                from '../../lib/tracker-model/@types/Ticket.ts';
import { Board }                      from '../../lib/tracker-model/Board.ts';
import { createLogger }               from '../../lib/tracker-model/Logger.ts';
import { taskFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import {
  INSTRUCTION_PREVIEW_LIMIT_CHARACTERS,
  PIPELINE_HISTORY_RECORDS_SHOWN,
  pipelineFactsOf,
  type MainLineTexts,
  type PipelineFactsInput
} from './PipelineFactsAssembly.ts';

const AT = '2026-11-12T10:00:00+01:00';

/** A running build job unless the case says otherwise. */
function jobFixture(changes: Partial<Job> & Pick<Job, 'id'>): Job {
  return {
    kind:               'build',
    role:               'builder',
    ticketIds:          [],
    parentJobId:        null,
    attempt:            1,
    target:             'main',
    state:              'running',
    watcherInstance:    1,
    eventCursor:        { instance: 1, sequence: 0 },
    answeredRequestIds: [],
    crashResumes:       0,
    ...changes,
  };
}

const GATE_PHASES_ALL = { build: ['test'], review: ['test'], merge: ['test'] };

/** Review with its re-review, the merge train's re-review and gates in every phase, merge approval off. */
const FULL_PIPELINE: Pipeline = {
  version: 3,
  prepare: [],
  gates:   [{ name: 'test', run: 'bun test' }],
  phases:  GATE_PHASES_ALL,
  review:  { name: 'review', reReview: { thresholdLines: 200 } },
  airlock: { reReview: { thresholdLines: 200 } },
};

const HUMAN_CODE_REVIEW_PIPELINE: Pipeline = { ...FULL_PIPELINE, approvals: { merge: true } };

const MINIMAL_PIPELINE: Pipeline = {
  version: 3, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
};

const CONSTITUTION_MARKDOWN = [
  '# Example Agency constitution',
  '',
  '## Code',
  '- Write full names.',
  '  - Even in loops.',
  '- Keep files small.',
  '',
  '## Commits',
  '- Write full names.',
].join('\n');

const NO_TEXTS: MainLineTexts = { textOf: () => null, mainConstitution: () => ({ verdict: 'absent' }), mainMovedByCommitsOf: () => 0 };

function setupRecordOf(changes: Partial<PipelineSetup> = {}): PipelineSetup {
  return {
    formatVersion:   1,
    setupId:         'S1',
    mode:            'setup',
    baseContentHash: null,
    stepStates:      {
      billing: 'done', research: 'done', constitution: 'in-progress', design: 'not-started', apply: 'not-started'
    },
    currentStep:                'constitution',
    billing:                    { mode: 'subscription' },
    agentJobId:                 'J4',
    snapshotCommit:             '1'.repeat(40),
    readyToContinue:            [],
    findings:                   [],
    questions:                  [],
    constitution:               null,
    draft:                      null,
    draftRevision:              0,
    edits:                      [],
    replacesUnreadablePipeline: false,
    applyRequest:               null,
    nextNumbers:                { finding: 1, question: 1, edit: 1 },
    extra:                      [],
    ...changes,
  };
}

function questionOf(questionId: string, subject: SetupQuestion['subject'], answered = false): SetupQuestion {
  return {
    questionId,
    step:        'design',
    subject,
    question:    'Example question?',
    context:     '',
    options:     [{ letter: 'a', text: 'Yes' }, { letter: 'b', text: 'No' }],
    recommended: ['a'],
    multiple:    false,
    answer:      answered ? { letters: ['a'], answeredAt: AT } : null,
  };
}

interface ExampleBoard {
  jobs?:       Job[];
  tickets?:    Ticket[];
  tasks?:      Task[];
  drafts?:     Draft[];
  logRecords?: LogRecord[];
}

function inputOf(changes: Partial<PipelineFactsInput> = {}, example: ExampleBoard = {}): PipelineFactsInput {
  const logRecords = example.logRecords ?? [];
  const board = new Board({
    progress: {
      trackerId: 'example-tracker-id', project: 'Example Agency', startedAt: AT, view: { kind: 'auto' }, nextTaskId: 9, tasks: example.tasks ?? [], jobs: example.jobs ?? [],
    },
    tickets:          example.tickets ?? [],
    epics:            [],
    drafts:           example.drafts ?? [],
    logger:           createLogger(() => undefined),
    storedLogRecords: logRecords,
  });
  return {
    board,
    pipelineReading:      { verdict: 'readable', pipeline: FULL_PIPELINE },
    pipelineFileText:     '{"version": 2}\n',
    pipelineSetupReading: { verdict: 'absent' },
    gateProfilesReading:  { verdict: 'absent' },
    logRecords,
    mainLine:             'main',
    mainLineTexts:        NO_TEXTS,
    renderMarkdown:       (markdown) => `<rendered>${markdown}</rendered>`,
    instructionPathOf:    (pipeline, entry) => {
      if (entry.kind === 'constitution') return pipeline?.constitution?.path ?? '.forge/briefs/defaults/constitution.md';
      return entry.kind === 'default-brief' ? `.forge/briefs/defaults/${entry.role}.md` : entry.path;
    },
    defaultSettingsOf: () => ({ model: 'opus', effort: 'medium' }),
    generatedAt:       new Date(AT),
    ...changes,
  };
}

function launchedRecordOf(job: Job, at: string): LogRecord {
  return {
    kind:   'job-launched',
    at,
    jobId:  job.id,
    fields: {
      kind: job.kind, role: job.role, ticketIds: job.ticketIds, attempt: job.attempt, target: job.target, parentJobId: job.parentJobId
    },
  };
}

describe('the stored pipeline', () => {
  test('a readable pipeline carries its content hash, its text and its newest Apply, counted from the first', () => {
    const applied = (constitutionCommit: string | null, at: string): LogRecord => ({
      kind:    'pipeline-applied',
      at,
      setupId: 'S1',
      fields:  {
        revision: 3, resumesBoard: false, changedFields: [], newFields: [], removedFields: [], constitutionCommit
      },
    });
    const facts = pipelineFactsOf(inputOf({}, { logRecords: [applied(null, '2026-11-11T09:00:00+01:00'), applied('a'.repeat(40), AT)] }));
    expect(facts.pipeline).toMatchObject({
      readingVerdict: 'readable',
      fileText:       '{"version": 2}\n',
      application:    {
        appliedRevision: 2, appliedAt: AT, appliedBy: 'user', constitutionCommit: 'a'.repeat(40)
      },
    });
    expect(facts.pipeline.readingVerdict === 'readable' && facts.pipeline.contentHash.length > 0).toBe(true);
  });

  test('a pipeline only the gate verbs wrote has no Apply; an older or malformed file carries its text and draws nothing', () => {
    expect(pipelineFactsOf(inputOf()).pipeline).toMatchObject({ readingVerdict: 'readable', application: null });
    const unreadable = (pipelineReading: PipelineReading) => pipelineFactsOf(inputOf({ pipelineReading }));
    expect(unreadable({ verdict: 'older' }).pipeline).toEqual({ readingVerdict: 'older', fileText: '{"version": 2}\n' });
    const malformed = unreadable({ verdict: 'malformed', reason: 'Example reason' });
    expect(malformed.pipeline).toEqual({ readingVerdict: 'malformed', reason: 'Example reason', fileText: '{"version": 2}\n' });
    expect(unreadable({ verdict: 'absent' }).pipeline).toEqual({ readingVerdict: 'absent' });
    expect(unreadable({ verdict: 'absent' }).pipelineFlow).toBeNull();
  });
});

describe('the setup facts', () => {
  test('count the findings, answered questions, prepare steps, gates and User\'s kept edits, with the agent job\'s state', () => {
    const record = setupRecordOf({
      findings: [
        {
          findingId: 'F1', topic: 'stack', label: 'Bun', value: null, sourcePaths: [], script: null, needsRecheck: false
        },
        {
          findingId:   'F2',
          topic:       'scripts',
          label:       'test',
          value:       null,
          sourcePaths: [],
          script:      {
            name: 'test', run: 'bun test', meaning: 'Example tests', gateCandidate: 'gate', needs: []
          },
          needsRecheck: false,
        },
      ],
      questions: [questionOf('Q1', null, true), questionOf('Q2', null), { ...questionOf('Q3', null, true), step: 'research' }],
      draft:     { ...FULL_PIPELINE, prepare: [{ name: 'install', run: 'bun install' }] },
      edits:     [
        {
          editId: 'E1', by: 'user', field: 'review', summary: 'Example', undone: false
        },
        {
          editId: 'E2', by: 'user', field: 'airlock', summary: 'Example', undone: true
        },
        {
          editId: 'E3', by: 'agent', field: 'gate:test', summary: 'Example', undone: false
        },
      ],
    });
    const facts = pipelineFactsOf(inputOf({
      pipelineSetupReading: { verdict: 'readable', setup: record },
      mainLineTexts:        { ...NO_TEXTS, mainMovedByCommitsOf: (snapshotCommit) => (snapshotCommit === '1'.repeat(40) ? 3 : 0) },
    }, {
      jobs: [jobFixture({
        id: 'J4', kind: 'pipeline-agent', role: 'pipeline-agent', target: null
      })]
    }));
    expect(facts.pipelineSetup).toMatchObject({
      summary: {
        stackItemCount: 1, scriptCount: 1, answeredResearchQuestionCount: 1, prepareStepCount: 1, gateCountByPhase: { build: 1, review: 1, merge: 1 }, userEditsKeptCount: 1,
      },
      openQuestionCount:  1,
      agentJobState:      'running',
      mainMovedByCommits: 3,
      constitutionHtml:   null,
      applyState:         null,
    });
    expect(pipelineFactsOf(inputOf({ pipelineSetupReading: { verdict: 'readable', setup: record } })).pipelineSetup?.agentJobState).toBeNull();
  });

  test('the constitution is rendered, outlined by its ## lines and top-level - items, and each annotation carries its line index', () => {
    const record = setupRecordOf({
      constitution: {
        markdown:    CONSTITUTION_MARKDOWN,
        annotations: [
          {
            lineText: '- Write full names.', occurrence: 2, kind: 'research', path: null
          },
          {
            lineText: '- Keep files small.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
          },
          {
            lineText: '- Keep files small.', occurrence: 2, kind: 'research', path: null
          },
        ],
        draftedFrom: { contributing: true, research: true, installedDefault: false },
        baseBlob:    null,
        revision:    1,
      },
    });
    const setup = pipelineFactsOf(inputOf({ pipelineSetupReading: { verdict: 'readable', setup: record } })).pipelineSetup;
    expect(setup?.constitutionHtml).toBe(`<rendered>${CONSTITUTION_MARKDOWN}</rendered>`);
    expect(setup?.constitutionOutline).toEqual({ sectionCount: 2, ruleCount: 3 });
    expect(setup?.annotations.map(({ lineText, lineIndex }) => [lineText, lineIndex])).toEqual([['- Write full names.', 8], ['- Keep files small.', 5]]);
  });

  test('name the roles whose instruction lists hold the constitution, from the draft', () => {
    const draft: Pipeline = {
      ...MINIMAL_PIPELINE,
      agents: { builder: { instructions: [{ kind: 'default-brief', role: 'builder' }] }, productOwner: { instructions: [{ kind: 'constitution' }] } },
    };
    const setup = pipelineFactsOf(inputOf({ pipelineSetupReading: { verdict: 'readable', setup: setupRecordOf({ draft }) } })).pipelineSetup;
    expect(setup?.readByRoles).toContain('productOwner');
    expect(setup?.readByRoles).not.toContain('builder');
  });

  test('a held Apply carries the blocking files of its newest held record and the ticket whose Airlock job holds main', () => {
    const held = (blockingFiles: string[]): LogRecord => ({
      kind: 'pipeline-apply-held', at: AT, setupId: 'S1', fields: { reason: 'dirty-checkout', blockingFiles }
    });
    const record = setupRecordOf({
      applyRequest: {
        draftRevision: 2, resumesBoard: false, commitJobId: null, state: 'held', reason: 'dirty-checkout'
      },
    });
    const airlockJob = jobFixture({
      id:        'J7',
      kind:      'merge',
      role:      null,
      ticketIds: ['014'],
      state:     'merging',
      airlock:   {
        target: 'main', targetTip: '2'.repeat(40), branchTip: '3'.repeat(40), phase: 'gating'
      }
    });
    const facts = pipelineFactsOf(inputOf(
      { pipelineSetupReading: { verdict: 'readable', setup: record } },
      { jobs: [airlockJob], logRecords: [held(['old.md']), held(['CONSTITUTION.md'])] },
    ));
    expect(facts.pipelineSetup?.applyState).toEqual({
      draftRevision: 2, resumesBoard: false, commitJobId: null, state: 'held', reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'], ticketIdHoldingMain: '014',
    });
  });
});

describe('the flow', () => {
  test('is a proposal in a first setup, an edit in an update, live with no record, and absent while a record has no draft', () => {
    const stageOf = (setup: PipelineSetup | null) => {
      const pipelineSetupReading: PipelineSetupReading = setup === null ? { verdict: 'absent' } : { verdict: 'readable', setup };
      return pipelineFactsOf(inputOf({ pipelineSetupReading })).pipelineFlow?.toolbarStage ?? null;
    };
    expect(stageOf(setupRecordOf({ draft: MINIMAL_PIPELINE }))).toBe('proposal');
    expect(stageOf(setupRecordOf({ mode: 'update', draft: FULL_PIPELINE }))).toBe('editing');
    expect(stageOf(null)).toBe('live');
    expect(stageOf(setupRecordOf())).toBeNull();
  });

  test('lists each changed field with the newest edit that is not undone, and a constitution main does not hold', () => {
    const draft: Pipeline = { ...FULL_PIPELINE, review: { name: 'review' } };
    const record = setupRecordOf({
      mode:  'update',
      draft,
      edits: [
        {
          editId: 'E1', by: 'agent', field: 'review', summary: 'Example', undone: false
        },
        {
          editId: 'E2', by: 'user', field: 'review', summary: 'Example', undone: false
        },
        {
          editId: 'E3', by: 'user', field: 'review', summary: 'Example', undone: true
        },
      ],
      constitution: {
        markdown: CONSTITUTION_MARKDOWN, annotations: [], draftedFrom: { contributing: true, research: true, installedDefault: false }, baseBlob: null, revision: 1
      },
    });
    const changeListWith = (mainConstitution: MainConstitutionReading) => pipelineFactsOf(inputOf({
      pipelineSetupReading: { verdict: 'readable', setup: record },
      mainLineTexts:        { ...NO_TEXTS, mainConstitution: () => mainConstitution },
    })).pipelineFlow?.changeList;
    expect(changeListWith({ verdict: 'absent' })).toEqual([
      { field: 'review', changeKind: 'changed', editId: 'E2' },
      { field: 'constitution', changeKind: 'changed', editId: null },
    ]);
    expect(changeListWith({ verdict: 'read', constitution: { path: 'CONSTITUTION.md', markdown: CONSTITUTION_MARKDOWN, blob: 'b'.repeat(40) } })).toEqual([
      { field: 'review', changeKind: 'changed', editId: 'E2' },
    ]);
  });

  test('marks a node with the questions on it, by node id or kind, and each gates node with the questions on its gates', () => {
    const record = setupRecordOf({
      draft:     FULL_PIPELINE,
      questions: [
        questionOf('Q1', { kind: 'node', reference: 'builder' }),
        questionOf('Q2', { kind: 'gate', reference: 'test' }),
        questionOf('Q3', { kind: 'node', reference: 'review' }),
      ],
    });
    const nodes = pipelineFactsOf(inputOf({ pipelineSetupReading: { verdict: 'readable', setup: record } })).pipelineFlow?.nodes ?? [];
    const questionIdsOf = (nodeId: string) => nodes.find((node) => node.nodeId === nodeId)?.questionIds;
    expect([questionIdsOf('builder'), questionIdsOf('review'), questionIdsOf('gates-build'), questionIdsOf('gates-merge'), questionIdsOf('merge-before-review')])
      .toEqual([['Q1'], ['Q3'], ['Q2'], ['Q2'], []]);
  });

  test('resolves each instruction entry to its file name and its text on main, cut at the preview limit', () => {
    const longText = 'x'.repeat(INSTRUCTION_PREVIEW_LIMIT_CHARACTERS + 1);
    const instructions: InstructionEntry[] = [{ kind: 'constitution' }, { kind: 'file', path: 'docs/long.md' }];
    const pipeline: Pipeline = { ...FULL_PIPELINE, constitution: { path: 'CONSTITUTION.md' }, agents: { builder: { instructions } } };
    const facts = pipelineFactsOf(inputOf({
      pipelineReading: { verdict: 'readable', pipeline },
      mainLineTexts:   { ...NO_TEXTS, textOf: (path) => (path === 'docs/long.md' ? longText : null) },
    }));
    const entries = facts.pipelineFlow?.nodes.find((node) => node.nodeId === 'builder')?.instructionEntries ?? [];
    expect(entries.map(({ fileName, text, textIsCut }) => ({ fileName, length: text?.length ?? null, textIsCut })))
      .toEqual([
        { fileName: 'CONSTITUTION.md', length: null, textIsCut: false },
        { fileName: 'long.md', length: INSTRUCTION_PREVIEW_LIMIT_CHARACTERS, textIsCut: true },
      ]);
  });

  test('names the tickets in flight, which take the new pipeline at their next gate run', () => {
    const tickets = [
      ticketFixture({ id: '001', status: 'pending' }),
      ticketFixture({ id: '002', status: 'in-progress' }),
      ticketFixture({ id: '003', status: 'in-review' }),
      ticketFixture({ id: '004', status: 'delivered' }),
    ];
    expect(pipelineFactsOf(inputOf({}, { tickets })).pipelineFlow?.ticketIdsInFlight).toEqual(['002', '003']);
  });
});

describe('the live occupants', () => {
  const airlockOf = (phase: Airlock['phase']): Airlock => ({
    target: 'main', targetTip: '2'.repeat(40), branchTip: '3'.repeat(40), phase
  });

  function nodeOfTicket(pipeline: Pipeline, jobs: Job[], ticketId: string): string | undefined {
    const facts = pipelineFactsOf(inputOf({ pipelineReading: { verdict: 'readable', pipeline } }, { jobs }));
    return facts.pipelineFlow?.occupants.find((occupant) => occupant.occupantId === ticketId)?.nodeId;
  }

  test('a build job stands on the builder, on the build gates while gating', () => {
    expect(nodeOfTicket(FULL_PIPELINE, [jobFixture({ id: 'J1', ticketIds: ['001'] })], '001')).toBe('builder');
    expect(nodeOfTicket(FULL_PIPELINE, [jobFixture({ id: 'J1', ticketIds: ['001'], state: 'gating' })], '001')).toBe('gates-build');
    expect(nodeOfTicket(MINIMAL_PIPELINE, [jobFixture({ id: 'J1', ticketIds: ['001'], state: 'gating' })], '001')).toBe('builder');
  });

  test('a review job catching up with main sits on the merge before review, then on review, its gates and its re-review', () => {
    const reviewJob = (changes: Partial<Job>): Job => jobFixture({
      id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['002'], ...changes
    });
    expect(nodeOfTicket(FULL_PIPELINE, [reviewJob({ state: 'preparing' })], '002')).toBe('merge-before-review');
    expect(nodeOfTicket(FULL_PIPELINE, [reviewJob({})], '002')).toBe('review');
    expect(nodeOfTicket(FULL_PIPELINE, [reviewJob({ state: 'gating' })], '002')).toBe('gates-review');
    expect(nodeOfTicket(FULL_PIPELINE, [reviewJob({ role: 're-reviewer' })], '002')).toBe('re-review');
  });

  test('a job merging main stands on the merge before User\'s code review, on its re-review while a conflict re-reviewer judges it', () => {
    const mergingMain = jobFixture({
      id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['002'], state: 'merging-main'
    });
    const reReviewer = jobFixture({
      id: 'J3', kind: 'merge-agent', role: 'conflict-re-reviewer', ticketIds: ['002'], parentJobId: 'J2'
    });
    expect(nodeOfTicket(HUMAN_CODE_REVIEW_PIPELINE, [mergingMain], '002')).toBe('merge-before-human-code-review');
    const facts = pipelineFactsOf(inputOf({ pipelineReading: { verdict: 'readable', pipeline: HUMAN_CODE_REVIEW_PIPELINE } }, { jobs: [mergingMain, reReviewer] }));
    expect(facts.pipelineFlow?.occupants.map(({ occupantId, nodeId, jobId }) => ({ occupantId, nodeId, jobId }))).toEqual([
      { occupantId: '002', nodeId: 're-review-before-human-code-review', jobId: 'J2' },
    ]);
  });

  test('an Airlock job stands where its phase is, and the constitution commit job is no occupant', () => {
    const mergeJob = (phase: NonNullable<Job['airlock']>['phase']): Job[] => [jobFixture({
      id: 'J5', kind: 'merge', role: null, ticketIds: ['005'], state: 'merging', airlock: airlockOf(phase)
    })];
    expect(['merge-in', 'resolving', 're-reviewing', 'gating', 'fixing', 'landing'].map((phase) => nodeOfTicket(FULL_PIPELINE, mergeJob(phase as 'merge-in'), '005')))
      .toEqual(['merge-in-airlock', 'merge-in-airlock', 're-review-in-airlock', 'gates-merge', 'merge-in-airlock', 'fast-forward-main']);
    const commitJob = jobFixture({
      id: 'J6', kind: 'constitution-commit', role: null, ticketIds: [], state: 'merging', airlock: airlockOf('committing')
    });
    expect(pipelineFactsOf(inputOf({}, { jobs: [commitJob] })).pipelineFlow?.occupants).toEqual([]);
  });

  test('a filing draft being written and a draft ticket its product owner filed sit on ticket creation, since their start', () => {
    const productOwner = jobFixture({
      id: 'J7', kind: 'product-owner', role: 'product-owner', target: null
    });
    const draft: Draft = {
      id:                 'D3',
      title:              'Example basket',
      request:            'Example request',
      openedAt:           '2026-11-12T09:00:00+01:00',
      claim:              { owner: 'J7', claimedAt: '2026-11-12T09:10:00+01:00' },
      notes:              [],
      questions:          [],
      nextNoteNumber:     1,
      nextQuestionNumber: 1,
      extra:              [],
    };
    const unclaimed: Draft = { ...draft, id: 'D4', claim: null };
    const facts = pipelineFactsOf(inputOf({}, {
      jobs:       [productOwner],
      drafts:     [draft, unclaimed],
      tickets:    [ticketFixture({ id: '009', status: 'draft', filedByJob: 'J7' })],
      logRecords: [launchedRecordOf(productOwner, '2026-11-12T09:05:00+01:00')],
    }));
    expect(facts.pipelineFlow?.occupants).toEqual([
      {
        occupantKind: 'draft', occupantId: 'D3', nodeId: 'ticket-creation', jobId: 'J7', since: '2026-11-12T09:10:00+01:00'
      },
      {
        occupantKind: 'ticket', occupantId: '009', nodeId: 'ticket-creation', jobId: 'J7', since: '2026-11-12T09:05:00+01:00'
      },
    ]);
  });

  test('a job\'s tickets stand there since its newest launch, and a ticket queued with no job waits for the merge train', () => {
    const buildJob = jobFixture({ id: 'J1', ticketIds: ['001'] });
    const facts = pipelineFactsOf(inputOf({}, {
      jobs:  [buildJob],
      tasks: [taskFixture({
        id: 5, ticket: '005', status: 'reviewed', mergeQueued: true
      })],
      tickets:    [ticketFixture({ id: '001', status: 'in-progress' }), ticketFixture({ id: '005', status: 'in-review', task: 5 })],
      logRecords: [
        launchedRecordOf(buildJob, '2026-11-12T09:00:00+01:00'),
        launchedRecordOf(buildJob, '2026-11-12T09:30:00+01:00'),
        {
          kind: 'merge-queued', at: '2026-11-12T09:45:00+01:00', ticketId: '005', fields: { target: 'main' }
        },
      ],
    }));
    expect(facts.pipelineFlow?.occupants.map(({ occupantId, nodeId, since }) => ({ occupantId, nodeId, since }))).toEqual([
      { occupantId: '001', nodeId: 'builder', since: '2026-11-12T09:30:00+01:00' },
      { occupantId: '005', nodeId: 'ready-for-airlock', since: '2026-11-12T09:45:00+01:00' },
    ]);
  });

  test('a proposal or an edit has no occupants', () => {
    const facts = pipelineFactsOf(inputOf(
      { pipelineSetupReading: { verdict: 'readable', setup: setupRecordOf({ mode: 'update', draft: FULL_PIPELINE }) } },
      { jobs: [jobFixture({ id: 'J1', ticketIds: ['001'] })] },
    ));
    expect(facts.pipelineFlow?.occupants).toEqual([]);
  });
});

describe('the choices, profile runs and history', () => {
  test('every model and effort in their order (Q9)', () => {
    expect(pipelineFactsOf(inputOf()).pipelineChoices).toEqual({ models: ['haiku', 'sonnet', 'opus', 'fable'], efforts: ['low', 'medium', 'high', 'xhigh', 'max'] });
  });

  test('the pipeline agent\'s default pair, as the launch resolves it, with no draft to name one', () => {
    const facts = pipelineFactsOf(inputOf({ defaultSettingsOf: (role) => (role === 'pipelineAgent' ? { model: 'fable', effort: 'max' } : { model: 'haiku', effort: 'low' }) }));
    expect(facts.pipelineAgentDefaults).toEqual({ model: 'fable', effort: 'max' });
  });

  test('each stored profile run as its state and elapsed time; none from a file the board cannot use', () => {
    const gateProfilesReading: GateProfilesReading = {
      verdict:  'readable',
      profiles: {
        formatVersion: 1,
        nextRunNumber: 2,
        runs:          [{
          profileRunId:        'P1',
          setupId:             null,
          phase:               'build',
          gate:                { name: 'test', run: 'bun test' },
          gateHash:            'h',
          prepare:             [],
          state:               'passed',
          stopRequested:       false,
          elapsedMilliseconds: 1200,
        }],
        extra: [],
      },
    };
    expect(pipelineFactsOf(inputOf({ gateProfilesReading })).profileRuns).toEqual([{
      profileRunId: 'P1', gateName: 'test', phase: 'build', state: 'passed', elapsedMilliseconds: 1200, cacheReport: null
    }]);
    expect(pipelineFactsOf(inputOf({ gateProfilesReading: { verdict: 'malformed', reason: 'Example' } })).profileRuns).toEqual([]);
  });

  describe('the gates\' cache marks', () => {
    function gateRanRecordOf(phase: GatePhase, gates: GateRunCacheReports['gates']): LogRecord {
      return {
        kind:   'gate-ran',
        at:     AT,
        fields: {
          tree: 'example-tree', outcome: 'passed', cached: false, cacheReports: { phase, gates }
        }
      };
    }

    function profiledRecordOf(gateName: string, phase: GatePhase): LogRecord {
      return {
        kind:         'gate-profiled',
        at:           AT,
        profileRunId: 'P1',
        fields:       {
          gateName, phase, state: 'passed', elapsedMilliseconds: 400
        }
      };
    }

    function profilesReadingOf(gateName: string, phase: GatePhase, cacheReport: GateCacheReport | null): GateProfilesReading {
      return {
        verdict:  'readable',
        profiles: {
          formatVersion: 1,
          nextRunNumber: 2,
          runs:          [{
            profileRunId:        'P1',
            setupId:             null,
            phase,
            gate:                { name: gateName, run: 'bun run verify' },
            gateHash:            'h',
            prepare:             [],
            state:               'passed',
            stopRequested:       false,
            elapsedMilliseconds: 400,
            ...(cacheReport === null ? {} : { cacheReport }),
          }],
          extra: [],
        },
      };
    }

    test('mark each gate whose newest job run reported a hit, a partial or a miss in its phase, and no gate that reported nothing', () => {
      const logRecords = [
        gateRanRecordOf('build', [{ gateName: 'verify', cacheReport: 'miss' }, { gateName: 'lint', cacheReport: 'hit' }]),
        gateRanRecordOf('build', [{ gateName: 'verify', cacheReport: 'hit' }, { gateName: 'lint', cacheReport: null }]),
        gateRanRecordOf('merge', [{ gateName: 'audit', cacheReport: 'partial' }]),
      ];

      expect(pipelineFactsOf(inputOf({ logRecords })).gateCacheMarks).toEqual([
        { gateName: 'verify', phase: 'build', cacheReport: 'hit' },
        { gateName: 'audit', phase: 'merge', cacheReport: 'partial' },
      ]);
    });

    test('take the run that ended last, a profile run or a job\'s, and keep a profile\'s mark the log does not name', () => {
      const gateProfilesReading = profilesReadingOf('verify', 'build', 'partial');
      const jobRun = gateRanRecordOf('build', [{ gateName: 'verify', cacheReport: 'hit' }]);
      const profiled = profiledRecordOf('verify', 'build');
      const marksOf = (logRecords: LogRecord[]) => pipelineFactsOf(inputOf({ logRecords, gateProfilesReading })).gateCacheMarks;

      expect([marksOf([]), marksOf([profiled, jobRun]), marksOf([jobRun, profiled])]).toEqual([
        [{ gateName: 'verify', phase: 'build', cacheReport: 'partial' }],
        [{ gateName: 'verify', phase: 'build', cacheReport: 'hit' }],
        [{ gateName: 'verify', phase: 'build', cacheReport: 'partial' }],
      ]);
    });

    test('mark nothing on a board whose gates never reported', () => {
      const unreported: LogRecord = { kind: 'gate-ran', at: AT, fields: { tree: 'example-tree', outcome: 'passed', cached: false } };
      expect(pipelineFactsOf(inputOf({ logRecords: [unreported], gateProfilesReading: profilesReadingOf('verify', 'build', null) })).gateCacheMarks).toEqual([]);
    });
  });

  test('the newest pipeline records first, without a setup\'s own steps, and no more than the list shows', () => {
    const resumed: LogRecord = { kind: 'overseer-set', at: AT, fields: { state: 'running' } };
    const finding: LogRecord = {
      kind: 'pipeline-finding-recorded', at: AT, setupId: 'S1', fields: { findingId: 'F1', topic: 'stack' }
    };
    const removed = (name: string): LogRecord => ({ kind: 'pipeline-gate-removed', at: AT, fields: { name } });
    const records = [...Array.from({ length: PIPELINE_HISTORY_RECORDS_SHOWN }, (_unused, i) => removed(`gate-${String(i)}`)), finding, resumed];
    const history = pipelineFactsOf(inputOf({}, { logRecords: records })).pipelineHistory;
    expect(history).toHaveLength(PIPELINE_HISTORY_RECORDS_SHOWN);
    expect(history[0]).toEqual(resumed);
    expect(history.some((record) => record.kind === 'pipeline-finding-recorded')).toBe(false);
  });
});
