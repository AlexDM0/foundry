/**
 * Synthetic pipeline facts in the page's board contract, one whole board per artboard state (`docs/design/board.md`, "The pipeline artboards and their
 * fixtures"), by name, so a spec reads `pipelineBoardStateOf('A2-question-open')` and no view keeps fixtures of its own. Every value is example data on
 * the Example Agency board; each state is built when it is asked for. The `mono-` states are a forge over entities: the facts of each entity beside the
 * forge's. Every state the Bridge's pipeline specs drew is here, in the page's contract. Test-only.
 */
import type { BoardDocument, BoardUsageWindowDocument } from '../../@types/board/BoardDocument.ts';
import type { BoardJobDocument }                        from '../../@types/board/BoardJobDocuments.ts';
import type {
  BoardAgentPairDocument,
  BoardAppliedPipelineDocument,
  BoardApplyStateDocument,
  BoardConstitutionDraftDocument,
  BoardDraftEntityFactsDocument,
  BoardEntityFlowDocument,
  BoardFlowEdgeDocument,
  BoardFlowNodeDocument,
  BoardFlowOccupantDocument,
  BoardGateCacheMarkDocument,
  BoardGateProfileRunDocument,
  BoardGateRowDocument,
  BoardInsertSlotDocument,
  BoardPipelineChangeDocument,
  BoardPipelineChoicesDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineEntityDocument,
  BoardPipelineFactsDocument,
  BoardPipelineFlowDocument,
  BoardPipelineGateDocument,
  BoardPipelineSetupDocument,
  BoardResolvedInstructionDocument,
  BoardSetupEditDocument,
  BoardSetupEntityFactsDocument,
  BoardSetupQuestionDocument,
  BoardSetupRecordDocument
} from '../../@types/board/BoardPipelineDocuments.ts';
import type { BoardPageTicketFactsDocument, BoardTicketDocument, BoardTicketFactsDocument } from '../../@types/board/BoardTicketDocuments.ts';
import type {
  BoardDerivedSettingsSource,
  BoardFlowStage,
  BoardGatePhase,
  BoardMergePlacement,
  BoardNodeDialogTarget,
  BoardPipelineAgentRole,
  BoardPipelineNodeMark,
  BoardProfileRunState
} from '../../@types/board/BoardVocabulary.ts';
import { BOARD_FORGE_LEVEL_AGENT_ROLES }               from '../../@types/board/BoardVocabulary.ts';
import type { ProfileLogFollower, TranscriptFollower } from '../@types/BoardServices.ts';
import type { BoardClock }                             from '../shell/BoardClock.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  examplePageTicketFacts,
  exampleTicket
} from './BoardStateFixture.ts';

export type PipelineFixtureName =
  | 'A0'
  | 'A0-unreadable'
  | 'A0b-running'
  | 'A0b-at-billing'
  | 'A0b-stopped'
  | 'A0b-main-moved'
  | 'A0b-recheck'
  | 'A0b-apply-pending'
  | 'A1'
  | 'A3b'
  | 'A3b-anchored-line-edited'
  | 'A2'
  | 'A2-question-open'
  | 'A2-designing'
  | 'A3-constitution-removed'
  | 'A3-fable-xhigh'
  | 'A4'
  | 'A4-committing'
  | 'A4-held'
  | 'A4-refused-unsigned'
  | 'A5'
  | 'A6'
  | 'A6-drawn-changes'
  | 'A6-re-review-removed'
  | 'A6b'
  | 'A7'
  | 'A7-insert-menu-open'
  | 'A7-human-code-review-without-review'
  | 'flow-merge-before-review'
  | 'flow-human-code-review-proposal'
  | 'flow-human-code-review-live'
  | 'flow-re-review-off'
  | 'profile-running'
  | 'profile-timed-out'
  | 'profile-stopped'
  | 'profile-passed'
  | 'header-both-usage-windows'
  | 'header-no-usage-windows'
  | 'mono-design'
  | 'mono-editing'
  | 'mono-live';

export const PIPELINE_FIXTURE_SETUP_ID = 'S1';

export const PIPELINE_FIXTURE_AGENT_JOB_ID = 'J4';

/** The moment a pipeline spec's clock stands at: 2 minutes 40 seconds after the pipeline agent's launch in `A1`. */
export const PIPELINE_FIXTURE_NOW = new Date('2026-11-12T09:30:00Z');

const PIPELINE_AGENT_LAUNCHED_AT = '2026-11-12T09:27:20Z';

/** What the Pipeline view takes beside its facts and route: followers that stream nothing, and a clock that stands still. */
export function pipelineViewServicesOf(followTranscript: TranscriptFollower = () => ({ close: () => undefined })): {
  readonly followTranscript: TranscriptFollower;
  readonly followProfileLog: ProfileLogFollower;
  readonly clock:            BoardClock;
} {
  return {
    followTranscript,
    followProfileLog: () => () => undefined,
    clock:            { now: () => PIPELINE_FIXTURE_NOW, everySecond: () => () => undefined, after: () => () => undefined },
  };
}

export const PIPELINE_CHOICES_FIXTURE: BoardPipelineChoicesDocument = {
  models:  ['haiku', 'sonnet', 'opus', 'fable'],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
};

/** The pipeline agent's default pair as the forge serves it. */
export const PIPELINE_AGENT_DEFAULTS_FIXTURE: BoardAgentPairDocument = { model: 'opus', effort: 'high' };

const WORKER_PAIR = { model: 'opus', effort: 'medium', instructions: null } as const;

const RE_REVIEWER_PAIR = { model: 'sonnet', effort: 'high', instructions: null } as const;

const WORKER_SETTINGS: BoardAgentPairDocument = { model: 'opus', effort: 'medium' };

const RE_REVIEWER_SETTINGS: BoardAgentPairDocument = { model: 'sonnet', effort: 'high' };

const FIXTURE_THRESHOLD_LINES = 750;

const FIXTURE_RE_REVIEW_THRESHOLD_STEP_LINES = 50;

const COMMITTED_TICKETS: readonly BoardTicketDocument[] = ['11', '12', '13'].map((ticketId) => exampleTicket({
  id: ticketId, title: `Example committed ticket ${ticketId}`, status: 'committed', updated: '2026-11-12T09:00:00',
}));

const CONSTITUTION_MARKDOWN = [
  '# Example Agency constitution',
  '',
  '## Code',
  '- Use TypeScript in strict mode.',
  '- Name every identifier in full words.',
  '',
  '## Tests',
  '- Put each spec beside its module.',
  '- Never call a real network service in a spec.',
  '',
  '## Commits',
  '- Write one plain subject line per commit.',
  '',
  '## Reviews',
  '- Explain every finding with the file and the line.',
  '',
].join('\n');

const NO_PHASES = { build: [], review: [], merge: [] } as const;

export function exampleGate(name: string, run: string, changes: Partial<BoardPipelineGateDocument> = {}): BoardPipelineGateDocument {
  return {
    name, run, fix: null, runsIn: null, network: [], writes: [], ...changes,
  };
}

/** A pipeline as the forge holds it, everything it leaves out absent, unless the changes say otherwise. */
export function examplePipeline(changes: Partial<BoardPipelineDefinitionDocument> = {}): BoardPipelineDefinitionDocument {
  return {
    version:          5,
    prepare:          [],
    gates:            [],
    phases:           NO_PHASES,
    review:           null,
    airlock:          null,
    constitutionPath: null,
    agents:           {},
    approvals:        {},
    billing:          null,
    reach:            [],
    entities:         null,
    ...changes,
  };
}

const PROPOSED_PIPELINE = examplePipeline({
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile', runsIn: null }],
  gates:   [
    exampleGate('typecheck', 'bun run typecheck'),
    exampleGate('lint', 'bun run lint', { fix: 'bun run lint:fix' }),
    exampleGate('unit-tests', 'bun test'),
    exampleGate('browser-tests', 'bun run test:browser', { network: ['registry.example.com'] }),
  ],
  phases: {
    build:  ['typecheck', 'lint', 'unit-tests'],
    review: ['typecheck', 'lint', 'unit-tests'],
    merge:  ['typecheck', 'unit-tests', 'browser-tests'],
  },
  review:  { name: 'review', reReview: { thresholdLines: FIXTURE_THRESHOLD_LINES } },
  airlock: { reReview: { thresholdLines: FIXTURE_THRESHOLD_LINES } },
  agents:  {
    builder:            WORKER_PAIR,
    reviewer:           WORKER_PAIR,
    reReviewer:         RE_REVIEWER_PAIR,
    conflictReReviewer: RE_REVIEWER_PAIR,
  },
  approvals: { tickets: true, merge: false },
  billing:   { mode: 'subscription' },
});

const MINIMAL_PIPELINE = examplePipeline();

function constitutionEntry(readByRoles: BoardPipelineAgentRole[], applied: boolean): BoardResolvedInstructionDocument {
  return {
    entry: { kind: 'constitution' }, fileName: applied ? 'CONSTITUTION.md' : 'constitution.md', readByRoles, text: CONSTITUTION_MARKDOWN, textIsCut: false,
  };
}

function defaultBriefEntry(role: BoardPipelineAgentRole, readByRoles: BoardPipelineAgentRole[]): BoardResolvedInstructionDocument {
  return {
    entry: { kind: 'default-brief', role }, fileName: `${role}.md`, readByRoles, text: `Example default brief of the ${role} role.`, textIsCut: false,
  };
}

/** The node-to-dialog table as the forge's flow graph applies it. */
function exampleDialogTargetOf(node: Partial<BoardFlowNodeDocument> & Pick<BoardFlowNodeDocument, 'nodeKind'>): BoardNodeDialogTarget | null {
  switch (node.nodeKind) {
    case 'ticket-creation':
    case 'builder':
      return 'agent-step';
    case 'review':
      return 'review-step';
    case 're-review':
      return node.role === 'reReviewer' ? 'review-step-re-review' : 'merge-step-re-review';
    case 'merge-main-into-tree':
      return node.mergePlacement === 'before-review' ? null : 'merge-step';
    case 'gates':
      return 'gates-tab';
    default:
      return null;
  }
}

function exampleNode(changes: Partial<BoardFlowNodeDocument> & Pick<BoardFlowNodeDocument, 'nodeId' | 'nodeKind'>): BoardFlowNodeDocument {
  return {
    dialogTarget:       exampleDialogTargetOf(changes),
    role:               null,
    settings:           null,
    instructionEntries: [],
    derivedFrom:        null,
    mergePlacement:     null,
    phase:              null,
    conditional:        false,
    thresholdLines:     null,
    switchState:        null,
    gateChips:          [],
    mark:               'unchanged',
    questionIds:        [],
    ...changes,
  };
}

const CONSTITUTION_READERS: BoardPipelineAgentRole[] = ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'];

const REVIEWER_BRIEF_READERS: BoardPipelineAgentRole[] = ['reviewer', 'reReviewer', 'conflictReReviewer'];

const PRODUCT_OWNER_BRIEF = defaultBriefEntry('productOwner', ['productOwner']);

function mergeNode(nodeId: string, mergePlacement: BoardMergePlacement, derivedFrom: BoardDerivedSettingsSource, mark: BoardPipelineNodeMark): BoardFlowNodeDocument {
  return exampleNode({
    nodeId, nodeKind: 'merge-main-into-tree', mergePlacement, derivedFrom, settings: WORKER_SETTINGS, mark,
  });
}

/** A re-reviewer's resolved list, as the forge's flow graph gives every role node: the constitution, the reviewer's brief, its own. */
function reReviewerEntriesOf(role: 'reReviewer' | 'conflictReReviewer', applied: boolean): BoardResolvedInstructionDocument[] {
  return [constitutionEntry(CONSTITUTION_READERS, applied), defaultBriefEntry('reviewer', REVIEWER_BRIEF_READERS), defaultBriefEntry(role, [role])];
}

function reReviewNode(nodeId: string, role: 'reReviewer' | 'conflictReReviewer', thresholdLines: number, mark: BoardPipelineNodeMark, applied: boolean): BoardFlowNodeDocument {
  return exampleNode({
    nodeId, nodeKind: 're-review', role, settings: RE_REVIEWER_SETTINGS, conditional: true, thresholdLines, mark, instructionEntries: reReviewerEntriesOf(role, applied),
  });
}

function withNodeChanged(flow: BoardPipelineFlowDocument, nodeId: string, changes: Partial<BoardFlowNodeDocument>): BoardPipelineFlowDocument {
  return { ...flow, nodes: flow.nodes.map((node) => (node.nodeId === nodeId ? { ...node, ...changes } : node)) };
}

function forwardEdge(from: string, to: string, changes: Partial<BoardFlowEdgeDocument> = {}): BoardFlowEdgeDocument {
  return {
    from, to, tone: 'forward', labelKind: null, active: false, ...changes,
  };
}

function rollbackEdge(from: string, to: string, labelKind: BoardFlowEdgeDocument['labelKind']): BoardFlowEdgeDocument {
  return forwardEdge(from, to, { tone: 'rollback', labelKind });
}

const GATE_PHASES: readonly BoardGatePhase[] = ['build', 'review', 'merge'];

function gateRowsOf(pipeline: Pick<BoardPipelineDefinitionDocument, 'prepare' | 'gates' | 'phases'>, mark: BoardPipelineNodeMark): BoardPipelineFlowDocument['gateRows'] {
  const rowsOfPhase = (phase: BoardGatePhase): BoardGateRowDocument[] => {
    const gateNames = pipeline.phases[phase];
    if (gateNames.length === 0) return [];
    const prepareRows: BoardGateRowDocument[] = pipeline.prepare.map((step) => ({
      rowKind: 'prepare', name: step.name, run: step.run, fix: null, runsIn: null, network: [], alsoInPhases: [], mark,
    }));
    const gateRows = gateNames.map((gateName): BoardGateRowDocument => {
      const gate = pipeline.gates.find((candidate) => candidate.name === gateName);
      return {
        rowKind:      'gate',
        name:         gateName,
        run:          gate?.run ?? '',
        fix:          gate?.fix ?? null,
        runsIn:       gate?.runsIn ?? null,
        network:      gate?.network ?? [],
        alsoInPhases: GATE_PHASES.filter((other) => other !== phase && pipeline.phases[other].includes(gateName)),
        mark,
      };
    });
    return [...prepareRows, ...gateRows];
  };
  return { build: rowsOfPhase('build'), review: rowsOfPhase('review'), merge: rowsOfPhase('merge') };
}

interface FlowShape {
  readonly pipeline:        Pick<BoardPipelineDefinitionDocument, 'prepare' | 'gates' | 'phases' | 'review' | 'airlock'>;
  readonly stage:           BoardFlowStage;
  readonly mark:            BoardPipelineNodeMark;
  readonly humanCodeReview: boolean;
  readonly applied:         boolean;
}

/** The nodes, edges and slots of a pipeline, as the forge's flow graph would draw them for the shape given. */
function flowOf(shape: FlowShape, changes: Partial<BoardPipelineFlowDocument> = {}): BoardPipelineFlowDocument {
  const {
    pipeline, mark, humanCodeReview, applied
  } = shape;
  const { review } = pipeline;
  const reviewReReview = review?.reReview ?? null;
  const airlockReReview = pipeline.airlock?.reReview ?? null;
  const chipsOf = (phase: BoardGatePhase): BoardFlowNodeDocument['gateChips'] => pipeline.phases[phase].map((gateName) => ({ gateName, mark }));
  const lastWorker = review === null ? 'builder' : 'last-worker';
  const nodes: BoardFlowNodeDocument[] = [
    exampleNode({
      nodeId: 'ticket-creation', nodeKind: 'ticket-creation', role: 'productOwner', settings: WORKER_SETTINGS, mark, instructionEntries: [PRODUCT_OWNER_BRIEF],
    }),
    exampleNode({
      nodeId: 'human-ticket-review', nodeKind: 'human-ticket-review', switchState: 'on', mark
    }),
    exampleNode({
      nodeId:             'builder',
      nodeKind:           'builder',
      role:               'builder',
      settings:           WORKER_SETTINGS,
      mark,
      instructionEntries: [constitutionEntry(CONSTITUTION_READERS, applied), defaultBriefEntry('builder', ['builder'])],
    }),
    ...(pipeline.phases.build.length === 0 ? [] : [exampleNode({
      nodeId: 'gates-build', nodeKind: 'gates', phase: 'build', gateChips: chipsOf('build'), mark,
    })]),
    ...(review === null ? [] : [
      exampleNode({ ...mergeNode('merge-before-review', 'before-review', 'builder', mark), gateChips: chipsOf('build') }),
      exampleNode({
        nodeId:             'review',
        nodeKind:           'review',
        role:               'reviewer',
        settings:           WORKER_SETTINGS,
        mark,
        instructionEntries: [constitutionEntry(CONSTITUTION_READERS, applied), defaultBriefEntry('reviewer', REVIEWER_BRIEF_READERS)],
      }),
      exampleNode({
        nodeId: 'gates-review', nodeKind: 'gates', phase: 'review', gateChips: chipsOf('review'), mark,
      }),
      ...(reviewReReview === null ? [] : [reReviewNode('re-review', 'reReviewer', reviewReReview.thresholdLines, mark, applied)]),
    ]),
    ...(humanCodeReview ? [
      mergeNode('merge-before-human-code-review', 'before-human-code-review', lastWorker, mark),
      ...(airlockReReview === null ? [] : [exampleNode({
        nodeId:             're-review-before-human-code-review',
        nodeKind:           're-review',
        role:               'conflictReReviewer',
        settings:           RE_REVIEWER_SETTINGS,
        conditional:        true,
        thresholdLines:     airlockReReview.thresholdLines,
        instructionEntries: reReviewerEntriesOf('conflictReReviewer', applied),
        mark,
      })]),
      exampleNode({
        nodeId: 'gates-review-again', nodeKind: 'gates', phase: review === null ? 'build' : 'review', gateChips: chipsOf(review === null ? 'build' : 'review'), mark,
      }),
    ] : []),
    exampleNode({
      nodeId: 'human-code-review', nodeKind: 'human-code-review', switchState: humanCodeReview ? 'on' : 'off', mark
    }),
    ...(humanCodeReview ? [] : [exampleNode({ nodeId: 'ready-for-airlock', nodeKind: 'ready-for-airlock', mark })]),
    exampleNode({ nodeId: 'airlock', nodeKind: 'airlock', mark }),
    exampleNode({
      nodeId: 'merge-in-airlock', nodeKind: 'merge-main-into-tree', mergePlacement: 'airlock', derivedFrom: lastWorker, settings: WORKER_SETTINGS, mark,
    }),
    ...(airlockReReview === null ? [] : [reReviewNode('re-review-in-airlock', 'conflictReReviewer', airlockReReview.thresholdLines, mark, applied)]),
    ...(pipeline.phases.merge.length === 0 ? [] : [exampleNode({
      nodeId: 'gates-merge', nodeKind: 'gates', phase: 'merge', gateChips: chipsOf('merge'), mark,
    })]),
    exampleNode({ nodeId: 'fast-forward-main', nodeKind: 'fast-forward-main', mark }),
  ];
  const nodeIds = nodes.map((node) => node.nodeId).filter((nodeId) => nodeId !== 'airlock');
  const live = shape.stage === 'live';
  const edges: BoardFlowEdgeDocument[] = [
    ...nodeIds.slice(1).map((nodeId, i) => forwardEdge(nodeIds[i] ?? '', nodeId, {
      active:    live,
      labelKind: nodeIds[i] === 'merge-before-review' ? 'all-green' : null,
    })),
    ...(pipeline.phases.build.length === 0 ? [] : [rollbackEdge('gates-build', 'builder', 'red-builder-fixes')]),
    ...(review === null ? [] : [
      rollbackEdge('merge-before-review', 'builder', 'conflict-or-red-builder-fixes'),
      rollbackEdge('gates-review', 'review', 'red-reviewer-fixes'),
    ]),
    ...(reviewReReview === null ? [] : [forwardEdge('re-review', 'gates-review', { tone: 'loop', labelKind: 'gates-again-after-re-review' })]),
    ...(pipeline.phases.merge.length === 0 ? [] : [rollbackEdge('gates-merge', 'merge-in-airlock', 'red-last-worker-fixes')]),
  ];
  return {
    nodes,
    edges,
    insertSlots:       [],
    occupants:         [],
    gateRows:          gateRowsOf(pipeline, mark),
    changeList:        [],
    ticketIdsInFlight: [],
    toolbarStage:      shape.stage,
    entityFlows:       null,
    ...changes,
  };
}

function proposalFlow(changes: Partial<BoardPipelineFlowDocument> = {}): BoardPipelineFlowDocument {
  return flowOf({
    pipeline: PROPOSED_PIPELINE, stage: 'proposal', mark: 'proposed', humanCodeReview: false, applied: false,
  }, changes);
}

function liveFlow(changes: Partial<BoardPipelineFlowDocument> = {}): BoardPipelineFlowDocument {
  return flowOf({
    pipeline: PROPOSED_PIPELINE, stage: 'live', mark: 'unchanged', humanCodeReview: false, applied: true,
  }, changes);
}

/** The minimal pipeline: no review, so no merge before review, and the + slots after the Builder and in the train. */
function minimalFlow(changes: Partial<BoardPipelineFlowDocument> = {}): BoardPipelineFlowDocument {
  const nodes: BoardFlowNodeDocument[] = [
    exampleNode({
      nodeId: 'ticket-creation', nodeKind: 'ticket-creation', role: 'productOwner', settings: WORKER_SETTINGS
    }),
    exampleNode({ nodeId: 'human-ticket-review', nodeKind: 'human-ticket-review', switchState: 'on' }),
    exampleNode({
      nodeId: 'builder', nodeKind: 'builder', role: 'builder', settings: WORKER_SETTINGS, instructionEntries: [defaultBriefEntry('builder', ['builder'])],
    }),
    exampleNode({ nodeId: 'airlock', nodeKind: 'airlock' }),
    exampleNode({
      nodeId: 'merge-in-airlock', nodeKind: 'merge-main-into-tree', mergePlacement: 'airlock', derivedFrom: 'builder', settings: WORKER_SETTINGS,
    }),
    exampleNode({ nodeId: 'fast-forward-main', nodeKind: 'fast-forward-main' }),
  ];
  const insertSlots: BoardInsertSlotDocument[] = [
    { slotId: 'after-builder', after: 'builder', offeredSteps: ['build-gates', 'review', 'human-code-review'] },
    { slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['merge-gates', 'airlock-re-review'] },
  ];
  return {
    nodes,
    edges: [
      forwardEdge('ticket-creation', 'human-ticket-review'),
      forwardEdge('human-ticket-review', 'builder'),
      forwardEdge('builder', 'merge-in-airlock'),
      forwardEdge('merge-in-airlock', 'fast-forward-main'),
    ],
    insertSlots,
    occupants:         [],
    gateRows:          { build: [], review: [], merge: [] },
    changeList:        [],
    ticketIdsInFlight: [],
    toolbarStage:      'editing',
    entityFlows:       null,
    ...changes,
  };
}

const ANCHORED_LINE = '- Use TypeScript in strict mode.';

function constitutionDraft(changes: Partial<BoardConstitutionDraftDocument> = {}): BoardConstitutionDraftDocument {
  return {
    markdown:    CONSTITUTION_MARKDOWN,
    annotations: [
      {
        lineText: ANCHORED_LINE, occurrence: 1, kind: 'research', path: 'tsconfig.json',
      },
      {
        lineText: '- Put each spec beside its module.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md',
      },
      {
        lineText: '- Write one plain subject line per commit.', occurrence: 1, kind: 'installed-default', path: null,
      },
    ],
    draftedFrom: { contributing: true, research: true, installedDefault: false },
    revision:    3,
    ...changes,
  };
}

function setupQuestion(changes: Partial<BoardSetupQuestionDocument> & Pick<BoardSetupQuestionDocument, 'questionId' | 'step'>): BoardSetupQuestionDocument {
  return {
    subject:     null,
    question:    'Should the example browser tests run before every merge?',
    context:     'They need the example registry and take four minutes.',
    options:     [{ letter: 'a', text: 'Yes, in the merge phase' }, { letter: 'b', text: 'No, leave them out' }],
    recommended: ['a'],
    multiple:    false,
    answer:      null,
    ...changes,
  };
}

const PIPELINE_AGENT_JOB = exampleAgentJob({
  id: PIPELINE_FIXTURE_AGENT_JOB_ID, kind: 'pipeline-agent', role: 'pipeline-agent', ticketIds: [], launchedAt: PIPELINE_AGENT_LAUNCHED_AT
});

const ANSWERED_RESEARCH_QUESTION = setupQuestion({
  questionId: 'Q1',
  step:       'research',
  subject:    { kind: 'finding', reference: 'F6' },
  question:   'Is the example dev server a gate?',
  answer:     { form: 'letters', letters: ['b'], answeredAt: '2026-11-12T09:20:00' },
});

const OPEN_DESIGN_QUESTION = setupQuestion({ questionId: 'Q3', step: 'design', subject: { kind: 'gate', reference: 'browser-tests' } });

function exampleEdit(changes: Partial<BoardSetupEditDocument> & Pick<BoardSetupEditDocument, 'editId' | 'field'>): BoardSetupEditDocument {
  return {
    by: 'user', summary: '', undone: false, batch: null, ...changes,
  };
}

const USER_EDITS: readonly BoardSetupEditDocument[] = [
  exampleEdit({
    editId: 'E1', by: 'agent', field: 'gate:typecheck', summary: 'Example: typecheck runs in every phase.'
  }),
  exampleEdit({ editId: 'E2', field: 'role:reviewer', summary: 'Example: the reviewer runs on opus.' }),
  exampleEdit({ editId: 'E3', field: 'approval:tickets', summary: 'Example: User readies each draft.' }),
];

/** The proposal's changes against the smallest pipeline: E1, E2 and E3 made three of them, so those rows have an Undo. */
const PROPOSAL_CHANGES: readonly BoardPipelineChangeDocument[] = [
  { field: 'prepare:install', changeKind: 'new', editId: null },
  { field: 'gate:typecheck', changeKind: 'new', editId: 'E1' },
  { field: 'gate:lint', changeKind: 'new', editId: null },
  { field: 'gate:unit-tests', changeKind: 'new', editId: null },
  { field: 'gate:browser-tests', changeKind: 'new', editId: null },
  { field: 'review', changeKind: 'new', editId: null },
  { field: 'airlock', changeKind: 'new', editId: null },
  { field: 'role:reviewer', changeKind: 'changed', editId: 'E2' },
  { field: 'approval:tickets', changeKind: 'changed', editId: 'E3' },
];

function setupRecord(changes: Partial<BoardSetupRecordDocument> = {}): BoardSetupRecordDocument {
  return {
    setupId:    PIPELINE_FIXTURE_SETUP_ID,
    mode:       'setup',
    stepStates: {
      billing: 'done', research: 'done', entities: null, constitution: 'done', design: 'in-progress', apply: 'not-started',
    },
    currentStep:     'design',
    billing:         { mode: 'subscription' },
    agentJobId:      PIPELINE_FIXTURE_AGENT_JOB_ID,
    snapshotCommit:  '1111111111111111111111111111111111111111',
    readyToContinue: [],
    findings:        [
      {
        findingId: 'F1', topic: 'stack', label: 'Language', value: 'TypeScript', sourcePaths: ['tsconfig.json'], script: null, needsRecheck: false,
      },
      {
        findingId: 'F2', topic: 'conventions', label: 'Specs', value: 'beside their module', sourcePaths: ['CONTRIBUTING.md'], script: null, needsRecheck: false,
      },
      {
        findingId:   'F3',
        topic:       'scripts',
        label:       'typecheck',
        value:       null,
        sourcePaths: ['package.json'],
        script:      {
          name: 'typecheck', run: 'bun run typecheck', meaning: 'Checks the example types.', gateCandidate: 'gate', needs: [],
        },
        needsRecheck: false,
      },
      {
        findingId:   'F4',
        topic:       'scripts',
        label:       'browser-tests',
        value:       null,
        sourcePaths: ['package.json'],
        script:      {
          name: 'browser-tests', run: 'bun run test:browser', meaning: 'Runs the example browser tests.', gateCandidate: 'unsure', needs: ['network'],
        },
        needsRecheck: false,
      },
    ],
    questions:                  [ANSWERED_RESEARCH_QUESTION],
    constitution:               constitutionDraft(),
    draft:                      PROPOSED_PIPELINE,
    draftRevision:              7,
    edits:                      [...USER_EDITS],
    replacesUnreadablePipeline: false,
    check:                      null,
    entities:                   null,
    ...changes,
  };
}

function setupFacts(record: BoardSetupRecordDocument, changes: Partial<BoardPipelineSetupDocument> = {}): BoardPipelineSetupDocument {
  const { constitution } = record;
  return {
    record,
    summary: {
      stackItemCount:                record.findings.filter((finding) => finding.topic === 'stack').length,
      scriptCount:                   record.findings.filter((finding) => finding.script !== null).length,
      answeredResearchQuestionCount: record.questions.filter((question) => question.step === 'research' && question.answer !== null).length,
      prepareStepCount:              record.draft?.prepare.length ?? 0,
      gateCountByPhase:              {
        build:  record.draft?.phases.build.length ?? 0,
        review: record.draft?.phases.review.length ?? 0,
        merge:  record.draft?.phases.merge.length ?? 0,
      },
      userEditsKeptCount: record.edits.filter((edit) => edit.by === 'user' && !edit.undone).length,
    },
    openQuestionCount:   record.questions.filter((question) => question.answer === null).length,
    agentJobState:       'running',
    mainMovedByCommits:  0,
    constitutionHtml:    constitution === null ? null : '<h1>Example Agency constitution</h1>',
    constitutionOutline: constitution === null ? null : { sectionCount: 4, ruleCount: 6 },
    annotations:         constitution === null ? [] : constitution.annotations,
    readByRoles:         ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'],
    applyState:          null,
    entities:            null,
    draftEntities:       {},
    applyRefusal:        null,
    entityRefusals:      [],
    ...changes,
  };
}

const APPLIED_PIPELINE: BoardAppliedPipelineDocument = {
  readingVerdict:  'readable',
  pipeline:        PROPOSED_PIPELINE,
  contentHash:     'example-content-hash-0001',
  fileText:        `${JSON.stringify(PROPOSED_PIPELINE, null, 2)}\n`,
  application:     { appliedRevision: 2, appliedAt: '2026-11-12T10:30:00', constitutionCommit: '2222222222222222222222222222222222222222' },
  entityPipelines: {},
};

const MINIMAL_APPLIED_PIPELINE: BoardAppliedPipelineDocument = {
  readingVerdict:  'readable',
  pipeline:        MINIMAL_PIPELINE,
  contentHash:     'example-content-hash-0002',
  fileText:        `${JSON.stringify(MINIMAL_PIPELINE)}\n`,
  application:     null,
  entityPipelines: {},
};

/** The pipeline facts of a board with no pipeline, no setup and no flow, unless the changes say otherwise. */
function pipelineFactsOf(changes: Partial<BoardPipelineFactsDocument>): BoardPipelineFactsDocument {
  return {
    applied:          { readingVerdict: 'absent' },
    setup:            null,
    flow:             null,
    profileRuns:      [],
    gateCacheMarks:   [],
    stepRunTimes:     [],
    history:          [],
    choices:          PIPELINE_CHOICES_FIXTURE,
    agentDefaults:    PIPELINE_AGENT_DEFAULTS_FIXTURE,
    entityAssignment: null,
    ...changes,
  };
}

/**
 * The base board with three more committed tickets, a limit of two, the pipeline facts given, and the worker effort, rework threshold,
 * re-review step and re-reviewers' default briefs the forge serves for its pipeline dialogs.
 */
function pipelineBoardState(pipelineChanges: Partial<BoardPipelineFactsDocument>, changes: Partial<BoardDocument> = {}): BoardDocument {
  const base = boardStateFixture();
  const tickets = [...base.page.tickets, ...COMMITTED_TICKETS];
  return boardStateFixture({
    pipeline: pipelineFactsOf(pipelineChanges),
    limits:   {
      ...base.limits,
      workerEffort:               WORKER_SETTINGS.effort,
      reworkRoundThresholdLines:  FIXTURE_THRESHOLD_LINES,
      reReviewThresholdStepLines: FIXTURE_RE_REVIEW_THRESHOLD_STEP_LINES,
      defaultInstructionsOfRole:  {
        ...base.limits.defaultInstructionsOfRole,
        reReviewer:         [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'reReviewer' }],
        conflictReReviewer: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'reviewer' }, { kind: 'default-brief', role: 'conflictReReviewer' }],
      },
    },
    concurrency: { limit: 2, agentsInFlight: 0 },
    page:        { ...base.page, tickets, facts: { ...base.page.facts, tickets: tickets.map(examplePageTicketFacts) } },
    ...changes,
  });
}

function setupState(
  record: BoardSetupRecordDocument,
  factChanges: Partial<BoardPipelineSetupDocument> = {},
  pipelineChanges: Partial<BoardPipelineFactsDocument> = {},
  changes: Partial<BoardDocument> = {},
): BoardDocument {
  return pipelineBoardState({ setup: setupFacts(record, factChanges), ...pipelineChanges }, changes);
}

function applyState(changes: Partial<BoardApplyStateDocument> & Pick<BoardApplyStateDocument, 'state'>): BoardApplyStateDocument {
  return {
    draftRevision: 7, resumesBoard: true, reason: null, blockingFiles: [], ticketIdHoldingMain: null, ...changes,
  };
}

function profileRun(state: BoardProfileRunState, elapsedMilliseconds: number | null): BoardGateProfileRunDocument {
  return {
    profileRunId: 'P1', entity: null, gateName: 'browser-tests', phase: 'merge', state, elapsedMilliseconds, cacheReport: null,
  };
}

function profileState(state: BoardProfileRunState, elapsedMilliseconds: number | null): BoardDocument {
  return setupState(setupRecord(), {}, { flow: proposalFlow(), profileRuns: [profileRun(state, elapsedMilliseconds)] });
}

const LIVE_OCCUPANTS: readonly BoardFlowOccupantDocument[] = [
  {
    occupantKind: 'draft', occupantId: 'D3', nodeId: 'ticket-creation', jobId: 'J7', since: '2026-11-12T11:40:00',
  },
  {
    occupantKind: 'ticket', occupantId: '14', nodeId: 'builder', jobId: 'J12', since: '2026-11-12T11:20:00',
  },
  {
    occupantKind: 'ticket', occupantId: '15', nodeId: 'merge-before-review', jobId: 'J13', since: '2026-11-12T11:50:00',
  },
  {
    occupantKind: 'ticket', occupantId: '12', nodeId: 'gates-build', jobId: null, since: '2026-11-12T11:58:00',
  },
];

const EDITING_CHANGES: readonly BoardPipelineChangeDocument[] = [
  { field: 'role:reviewer', changeKind: 'changed', editId: 'E2' },
  { field: 'gate:browser-tests', changeKind: 'new', editId: 'E4' },
  { field: 'gate:lint', changeKind: 'removed', editId: 'E5' },
];

function updateRecord(changes: Partial<BoardSetupRecordDocument> = {}): BoardSetupRecordDocument {
  return setupRecord({
    setupId:    'S2',
    mode:       'update',
    stepStates: {
      billing: 'done', research: 'done', entities: null, constitution: 'done', design: 'done', apply: 'not-started',
    },
    currentStep: 'apply',
    agentJobId:  null,
    questions:   [],
    ...changes,
  });
}

function editingState(changeList: readonly BoardPipelineChangeDocument[]): BoardDocument {
  return setupState(updateRecord(), { agentJobState: null }, {
    applied: APPLIED_PIPELINE,
    flow:    flowOf({
      pipeline: PROPOSED_PIPELINE, stage: 'editing', mark: 'unchanged', humanCodeReview: false, applied: true,
    }, { changeList: [...changeList], ticketIdsInFlight: ['14', '15'] }),
  });
}

/** A6 as drawn: typecheck's run line changed, lint removed, a new merge gate a11y, and Human code review switched on. */
const DRAWN_DRAFT = examplePipeline({
  ...PROPOSED_PIPELINE,
  gates: [
    exampleGate('typecheck', 'bun run typecheck --incremental'),
    exampleGate('unit-tests', 'bun test'),
    exampleGate('browser-tests', 'bun run test:browser', { network: ['registry.example.com'] }),
    exampleGate('a11y', 'bun run a11y'),
  ],
  phases: {
    build:  ['typecheck', 'unit-tests'],
    review: ['typecheck', 'unit-tests'],
    merge:  ['typecheck', 'unit-tests', 'browser-tests', 'a11y'],
  },
  approvals: { tickets: true, merge: true },
});

/** The draft with the removed lint gate still in its phases, since a removed gate stays drawn until Apply. */
const DRAWN_FLOW_PIPELINE = examplePipeline({
  ...DRAWN_DRAFT,
  gates:  [...DRAWN_DRAFT.gates, exampleGate('lint', 'bun run lint', { fix: 'bun run lint:fix' })],
  phases: { ...DRAWN_DRAFT.phases, build: ['typecheck', 'lint', 'unit-tests'], review: ['typecheck', 'lint', 'unit-tests'] },
});

const DRAWN_GATE_MARKS: Readonly<Record<string, BoardPipelineNodeMark>> = { typecheck: 'changed', lint: 'removed', a11y: 'new' };

const DRAWN_EDITS: readonly BoardSetupEditDocument[] = [
  exampleEdit({ editId: 'E10', field: 'gate:typecheck', summary: 'Example: typecheck runs incrementally.' }),
  exampleEdit({ editId: 'E11', field: 'gate:lint', summary: 'Example: lint no longer gates a ticket.' }),
  exampleEdit({ editId: 'E12', field: 'gate:a11y', summary: 'Example: a11y runs in the merge phase.' }),
  exampleEdit({ editId: 'E13', field: 'approval:merge', summary: 'Example: User reviews the code before it merges.' }),
];

const DRAWN_CHANGES: readonly BoardPipelineChangeDocument[] = [
  { field: 'gate:typecheck', changeKind: 'changed', editId: 'E10' },
  { field: 'gate:lint', changeKind: 'removed', editId: 'E11' },
  { field: 'gate:a11y', changeKind: 'new', editId: 'E12' },
  { field: 'approval:merge', changeKind: 'changed', editId: 'E13' },
];

function markOfGate(gateName: string): BoardPipelineNodeMark {
  return Object.hasOwn(DRAWN_GATE_MARKS, gateName) ? DRAWN_GATE_MARKS[gateName] ?? 'unchanged' : 'unchanged';
}

/** The flow with each gate chip and gate row marked by its change, and the Human code review switch marked changed. */
function withDrawnMarks(flow: BoardPipelineFlowDocument): BoardPipelineFlowDocument {
  const rowsOf = (rows: readonly BoardGateRowDocument[]): BoardGateRowDocument[] => rows.map((row) => (row.rowKind === 'gate' ? { ...row, mark: markOfGate(row.name) } : row));
  return {
    ...flow,
    nodes: flow.nodes.map((node) => ({
      ...node,
      gateChips: node.gateChips.map((chip) => ({ ...chip, mark: markOfGate(chip.gateName) })),
      ...(node.nodeKind === 'human-code-review' ? { mark: 'changed' as const } : {}),
    })),
    gateRows: { build: rowsOf(flow.gateRows.build), review: rowsOf(flow.gateRows.review), merge: rowsOf(flow.gateRows.merge) },
  };
}

function drawnChangesState(): BoardDocument {
  return setupState(updateRecord({ draft: DRAWN_DRAFT, edits: [...DRAWN_EDITS] }), { agentJobState: null }, {
    applied: APPLIED_PIPELINE,
    flow:    withDrawnMarks(flowOf({
      pipeline: DRAWN_FLOW_PIPELINE, stage: 'editing', mark: 'unchanged', humanCodeReview: true, applied: true,
    }, { changeList: [...DRAWN_CHANGES], ticketIdsInFlight: ['14', '17', '12', '9', '7'] })),
  });
}

/** The merge train's re-review removed: its node is not drawn, its + comes back, and the Changes tab lists it. */
function reReviewRemovedState(): BoardDocument {
  const draft = examplePipeline({ ...PROPOSED_PIPELINE, airlock: { reReview: null } });
  const edits: BoardSetupEditDocument[] = [{
    editId: 'E14', by: 'user', field: 'airlock', summary: 'Example: the merge train runs no re-review.', undone: false, batch: null,
  }];
  return setupState(updateRecord({ draft, edits }), { agentJobState: null }, {
    applied: APPLIED_PIPELINE,
    flow:    flowOf({
      pipeline: draft, stage: 'editing', mark: 'unchanged', humanCodeReview: false, applied: true,
    }, {
      changeList:  [{ field: 'airlock', changeKind: 'removed', editId: 'E14' }],
      insertSlots: [{ slotId: 'airlock', after: 'merge-in-airlock', offeredSteps: ['merge-gates', 'airlock-re-review'] }],
    }),
  });
}

function minimalState(): BoardDocument {
  return setupState(updateRecord({ draft: MINIMAL_PIPELINE }), { agentJobState: null }, {
    applied: APPLIED_PIPELINE,
    flow:    minimalFlow({ changeList: [{ field: 'review', changeKind: 'removed', editId: 'E6' }, { field: 'airlock', changeKind: 'removed', editId: 'E7' }] }),
  });
}

function usageState(windows: readonly BoardUsageWindowDocument[]): BoardDocument {
  return pipelineBoardState({ applied: APPLIED_PIPELINE, flow: liveFlow() }, { usage: { resetsAt: null, window: null, windows } });
}

export function exampleEntity(kind: BoardPipelineEntityDocument['kind'], home: string[], changes: Partial<BoardPipelineEntityDocument> = {}): BoardPipelineEntityDocument {
  return {
    kind,
    home,
    summary:          null,
    constitutionPath: null,
    prepare:          [],
    gates:            [],
    phases:           NO_PHASES,
    review:           null,
    agents:           {},
    whitelist:        [],
    reach:            [],
    dependsOn:        [],
    concurrency:      null,
    ...changes,
  };
}

/** An app that crosses into the design system, the design system as a whitelisted package with a review, and the root kept for a person. */
const WEB_ENTITY = exampleEntity('app', ['/apps/web'], {
  summary:   'The Example Agency storefront.',
  prepare:   [{ name: 'install', run: 'bun install --frozen-lockfile', runsIn: '/' }],
  gates:     [exampleGate('typecheck', 'bun run typecheck'), exampleGate('unit-tests', 'bun test')],
  phases:    { build: ['typecheck', 'unit-tests'], review: ['typecheck', 'unit-tests'], merge: ['typecheck', 'unit-tests'] },
  review:    { name: 'review', reReview: null },
  agents:    { builder: WORKER_PAIR, reviewer: WORKER_PAIR },
  whitelist: ['design-system'],
  dependsOn: ['design-system'],
});

const DESIGN_SYSTEM_ENTITY = exampleEntity('package', ['/packages/design-system'], {
  summary:          'The Example Agency components.',
  constitutionPath: '/packages/design-system/CONSTITUTION.md',
  gates:            [exampleGate('typecheck', 'bun run typecheck')],
  phases:           { build: ['typecheck'], review: ['typecheck'], merge: ['typecheck'] },
  review:           { name: 'review', reReview: null },
});

const ROOT_ENTITY = exampleEntity('root', ['/']);

const MONOREPO_PIPELINE = examplePipeline({
  airlock:   { reReview: { thresholdLines: FIXTURE_THRESHOLD_LINES } },
  agents:    { productOwner: WORKER_PAIR },
  approvals: { tickets: true, merge: false },
  billing:   { mode: 'subscription' },
  entities:  { 'web': WEB_ENTITY, 'design-system': DESIGN_SYSTEM_ENTITY, 'root': ROOT_ENTITY },
});

/** Each entity as the single pipeline its flow is drawn from: its own steps and review, the forge's merge train and approvals. */
function entityPipelineOf(entity: BoardPipelineEntityDocument): BoardPipelineDefinitionDocument {
  return examplePipeline({
    prepare:   entity.prepare,
    gates:     entity.gates,
    phases:    entity.phases,
    review:    entity.review,
    airlock:   MONOREPO_PIPELINE.airlock,
    approvals: { tickets: true, merge: false },
  });
}

function entityFlowsOf(stage: BoardFlowStage, mark: BoardPipelineNodeMark, applied: boolean): Record<string, BoardEntityFlowDocument> {
  return Object.fromEntries(Object.entries(MONOREPO_PIPELINE.entities ?? {}).map(([entityKey, entity]) => {
    const flow = flowOf({
      pipeline: entityPipelineOf(entity), stage, mark, humanCodeReview: false, applied,
    });
    return [entityKey, {
      nodes: flow.nodes, edges: flow.edges, insertSlots: flow.insertSlots, gateRows: flow.gateRows
    }] as const;
  }));
}

/** The forge's flow, which holds no gate, with each entity's flow beside it. */
/**
 * The entity's pipeline as the forge serves it: the entity's own steps, review, constitution, reach and agents, with the forge's merge
 * train, approvals, billing and forge-level agents.
 */
function servedEntityPipelineOf(pipeline: BoardPipelineDefinitionDocument, entity: BoardPipelineEntityDocument): BoardPipelineDefinitionDocument {
  const forgeLevelAgents = Object.fromEntries(Object.entries(pipeline.agents).filter(([role]) => (BOARD_FORGE_LEVEL_AGENT_ROLES as readonly string[]).includes(role)));
  return examplePipeline({
    prepare:          entity.prepare,
    gates:            entity.gates,
    phases:           entity.phases,
    review:           entity.review,
    airlock:          pipeline.airlock,
    constitutionPath: entity.constitutionPath,
    agents:           { ...forgeLevelAgents, ...entity.agents },
    approvals:        pipeline.approvals,
    billing:          pipeline.billing,
    reach:            entity.reach,
  });
}

function servedEntityPipelinesOf(pipeline: BoardPipelineDefinitionDocument): Record<string, BoardPipelineDefinitionDocument> {
  return Object.fromEntries(Object.entries(pipeline.entities ?? {}).map(([entityKey, entity]) => [entityKey, servedEntityPipelineOf(pipeline, entity)]));
}

/** The entities that depend on one, directly or through another, as the forge serves them. */
function servedDependentKeysOf(entities: Readonly<Record<string, BoardPipelineEntityDocument>>, entityKey: string): string[] {
  const reachedKeys = new Set([entityKey]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [candidateKey, candidate] of Object.entries(entities)) {
      if (!reachedKeys.has(candidateKey) && candidate.dependsOn.some((dependencyKey) => reachedKeys.has(dependencyKey))) {
        reachedKeys.add(candidateKey);
        grew = true;
      }
    }
  }
  return Object.keys(entities).filter((candidateKey) => candidateKey !== entityKey && reachedKeys.has(candidateKey));
}

/** Each entity of a draft as the forge serves it: its pipeline as it would run, and every entity that consumes it. */
export function servedDraftEntitiesOf(draft: BoardPipelineDefinitionDocument): Record<string, BoardDraftEntityFactsDocument> {
  const entities = draft.entities ?? {};
  return Object.fromEntries(Object.entries(entities).map(([entityKey, entity]) => [entityKey, {
    effectivePipeline:   servedEntityPipelineOf(draft, entity),
    dependentEntityKeys: servedDependentKeysOf(entities, entityKey),
  }]));
}

function monorepoFlowOf(stage: BoardFlowStage, mark: BoardPipelineNodeMark, applied: boolean, changes: Partial<BoardPipelineFlowDocument> = {}): BoardPipelineFlowDocument {
  return flowOf({
    pipeline: MONOREPO_PIPELINE, stage, mark, humanCodeReview: false, applied,
  }, { entityFlows: entityFlowsOf(stage, mark, applied), ...changes });
}

const MONOREPO_APPLIED_PIPELINE: BoardAppliedPipelineDocument = {
  readingVerdict:  'readable',
  pipeline:        MONOREPO_PIPELINE,
  contentHash:     'example-content-hash-0004',
  fileText:        `${JSON.stringify({ ...MONOREPO_PIPELINE, version: 5 }, null, 2)}\n`,
  application:     { appliedRevision: 1, appliedAt: '2026-11-12T10:30:00', constitutionCommit: '4444444444444444444444444444444444444444' },
  entityPipelines: servedEntityPipelinesOf(MONOREPO_PIPELINE),
};

/** A profile of the web entity's typecheck while the design system's typecheck of the same phase keeps its own newest run. */
const MONOREPO_PROFILE_RUNS: readonly BoardGateProfileRunDocument[] = [
  {
    profileRunId: 'P1', entity: 'design-system', gateName: 'typecheck', phase: 'build', state: 'passed', elapsedMilliseconds: 18_000, cacheReport: 'hit',
  },
  {
    profileRunId: 'P2', entity: 'web', gateName: 'typecheck', phase: 'build', state: 'running', elapsedMilliseconds: null, cacheReport: null,
  },
];

const MONOREPO_CACHE_MARKS: readonly BoardGateCacheMarkDocument[] = [{
  entity: 'design-system', gateName: 'typecheck', phase: 'build', cacheReport: 'hit'
}];

const WEB_SETUP_JOB_ID = 'J5';

function setupEntityFacts(changes: Partial<BoardSetupEntityFactsDocument> = {}): BoardSetupEntityFactsDocument {
  return {
    summary: {
      stackItemCount: 0, scriptCount: 0, answeredResearchQuestionCount: 0, prepareStepCount: 0, gateCountByPhase: { build: 0, review: 0, merge: 0 },
    },
    openQuestionCount:   0,
    agentJobState:       null,
    constitutionHtml:    null,
    constitutionOutline: null,
    annotations:         [],
    readByRoles:         ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'],
    ...changes,
  };
}

/** A setup over the three entities at its design step: the web entity's session runs and asks about a gate; the root has no part yet. */
function monorepoDesignState(): BoardDocument {
  const webQuestion = setupQuestion({ questionId: 'Q4', step: 'design', subject: { kind: 'gate', reference: 'unit-tests' } });
  const record = setupRecord({
    stepStates: {
      billing: 'done', research: 'done', entities: 'done', constitution: 'done', design: 'in-progress', apply: 'not-started',
    },
    draft:    MONOREPO_PIPELINE,
    edits:    [],
    entities: {
      'web': {
        agentJobId: WEB_SETUP_JOB_ID, findings: [], questions: [webQuestion], constitution: constitutionDraft(), check: null,
      },
      'design-system': {
        agentJobId: null, findings: [], questions: [], constitution: null, check: null,
      },
    },
  });
  const webFacts = setupEntityFacts({
    summary: {
      stackItemCount: 0, scriptCount: 0, answeredResearchQuestionCount: 0, prepareStepCount: 1, gateCountByPhase: { build: 2, review: 2, merge: 2 },
    },
    openQuestionCount:   1,
    agentJobState:       'running',
    constitutionHtml:    '<h1>Example Agency constitution</h1>',
    constitutionOutline: { sectionCount: 4, ruleCount: 6 },
    annotations:         constitutionDraft().annotations,
  });
  const designSystemFacts = setupEntityFacts({
    summary: {
      stackItemCount: 0, scriptCount: 0, answeredResearchQuestionCount: 0, prepareStepCount: 0, gateCountByPhase: { build: 1, review: 1, merge: 1 },
    },
  });
  const flow = monorepoFlowOf('proposal', 'proposed', false);
  const webFlow = flow.entityFlows?.['web'];
  const entityFlows = webFlow === undefined ? flow.entityFlows : {
    ...flow.entityFlows,
    web: { ...webFlow, nodes: webFlow.nodes.map((node) => (node.nodeId === 'gates-build' ? { ...node, questionIds: ['Q4'] } : node)) },
  };
  const entities = { 'web': webFacts, 'design-system': designSystemFacts, 'root': setupEntityFacts() };
  return setupState(record, { entities, draftEntities: servedDraftEntitiesOf(MONOREPO_PIPELINE) }, { flow: { ...flow, entityFlows } });
}

/** The product owner's draft, a builder in web and one in the design system, web's ticket in the Airlock, and a ticket queued with no job. */
const MONOREPO_LIVE_OCCUPANTS: readonly BoardFlowOccupantDocument[] = [
  {
    occupantKind: 'draft', occupantId: 'D3', nodeId: 'ticket-creation', jobId: 'J7', since: '2026-11-12T11:40:00',
  },
  {
    occupantKind: 'ticket', occupantId: '21', nodeId: 'builder', jobId: 'J21', since: '2026-11-12T11:20:00',
  },
  {
    occupantKind: 'ticket', occupantId: '22', nodeId: 'builder', jobId: 'J22', since: '2026-11-12T11:50:00',
  },
  {
    occupantKind: 'ticket', occupantId: '19', nodeId: 'merge-in-airlock', jobId: 'J19', since: '2026-11-12T11:58:00',
  },
  {
    occupantKind: 'ticket', occupantId: '23', nodeId: 'ready-for-airlock', jobId: null, since: '2026-11-12T11:55:00',
  },
];

/** Each job of a live monorepo with the entity the forge set at its launch; the product owner's job names none. */
const MONOREPO_LIVE_JOBS: readonly BoardJobDocument[] = [
  exampleAgentJob({
    id: 'J7', kind: 'product-owner', role: 'product-owner', ticketIds: [],
  }),
  exampleAgentJob({ id: 'J21', ticketIds: ['21'], entity: 'web' }),
  exampleAgentJob({ id: 'J22', ticketIds: ['22'], entity: 'design-system' }),
  exampleAgentJob({
    id: 'J19', kind: 'merge', role: null, ticketIds: ['19'], entity: 'web',
  }),
];

/** The facts the forge serves for a ticket an agent has picked up, and for a delivered one. */
const PICKED_UP_FACTS: BoardTicketFactsDocument = {
  resolvedPriority: 'normal', settlesADependency: false, isClosed: false, noAgentHasPickedItUp: false, reviewRound: null, isRepeatReview: false,
};

const DELIVERED_FACTS: BoardTicketFactsDocument = { ...PICKED_UP_FACTS, settlesADependency: true, isClosed: true };

/**
 * The tickets of the monorepo boards: web's builds and its ticket in the Airlock, web's ticket 22 crossing into the design system in its
 * package build, the design system's ticket queued for the Airlock, web's committed ticket that waits for a slot, and web's delivered one.
 */
const MONOREPO_TICKETS: readonly BoardTicketDocument[] = [
  exampleTicket({
    id: '21', title: 'Example web build', status: 'in-progress', entity: 'web', facts: PICKED_UP_FACTS,
  }),
  exampleTicket({
    id: '22', title: 'Example crossing build', status: 'in-progress', entity: 'web', facts: PICKED_UP_FACTS,
  }),
  exampleTicket({
    id: '19', title: 'Example web landing', status: 'in-progress', entity: 'web', facts: PICKED_UP_FACTS,
  }),
  exampleTicket({
    id: '23', title: 'Example design system landing', status: 'in-progress', entity: 'design-system', facts: PICKED_UP_FACTS,
  }),
  exampleTicket({
    id: '24', title: 'Example web ready', status: 'committed', entity: 'web',
  }),
  exampleTicket({
    id:        '18',
    title:     'Example web delivered',
    status:    'delivered',
    entity:    'web',
    delivered: '2026-11-12T08:00:00',
    facts:     DELIVERED_FACTS,
  }),
];

const MONOREPO_TICKET_FACTS: readonly BoardPageTicketFactsDocument[] = [
  { ...examplePageTicketFacts({ id: '21', status: 'in-progress' }), entity: 'web' },
  { ...examplePageTicketFacts({ id: '22', status: 'in-progress' }), entity: 'web', stage: { name: 'package-build', entity: 'design-system' } },
  { ...examplePageTicketFacts({ id: '19', status: 'in-progress' }), entity: 'web' },
  { ...examplePageTicketFacts({ id: '23', status: 'in-progress' }), entity: 'design-system' },
  { ...examplePageTicketFacts({ id: '24', status: 'committed' }), entity: 'web' },
  { ...examplePageTicketFacts({ id: '18', status: 'delivered' }), entity: 'web' },
];

/** The page with the monorepo's tickets beside the base board's, and web's committed ticket first in line. */
function withMonorepoTickets(board: BoardDocument): BoardDocument {
  const { page } = board;
  return {
    ...board,
    page: {
      ...page,
      tickets: [...page.tickets, ...MONOREPO_TICKETS],
      facts:   { ...page.facts, tickets: [...page.facts.tickets, ...MONOREPO_TICKET_FACTS], readyTickets: [{ id: '24', isHeld: false }] },
    },
  };
}

/** Web holds at most one job at once, so its committed ticket waits for a slot while its build runs. */
const MONOREPO_LIVE_DEFINITION = examplePipeline({ ...MONOREPO_PIPELINE, entities: { ...MONOREPO_PIPELINE.entities, web: { ...WEB_ENTITY, concurrency: 1 } } });

const MONOREPO_LIVE_PIPELINE: BoardAppliedPipelineDocument = {
  ...MONOREPO_APPLIED_PIPELINE,
  pipeline:        MONOREPO_LIVE_DEFINITION,
  entityPipelines: servedEntityPipelinesOf(MONOREPO_LIVE_DEFINITION),
};

function monorepoLiveState(): BoardDocument {
  return withMonorepoTickets(pipelineBoardState({
    applied:        MONOREPO_LIVE_PIPELINE,
    flow:           monorepoFlowOf('live', 'unchanged', true, { occupants: [...MONOREPO_LIVE_OCCUPANTS], ticketIdsInFlight: ['21', '22', '19'] }),
    profileRuns:    [...MONOREPO_PROFILE_RUNS],
    gateCacheMarks: [...MONOREPO_CACHE_MARKS],
  }, {
    jobs:        [...MONOREPO_LIVE_JOBS],
    concurrency: { limit: 2, agentsInFlight: 2 },
    launchSlots: { limit: 2, slotJobIds: ['J21', 'J22'], inProgressTicketIdsWithoutJob: [] },
  }));
}

/** The edits of an update over entities: merge approval at the forge, web's typecheck, and a copy of web's unit tests to the design system. */
const MONOREPO_EDITS: readonly BoardSetupEditDocument[] = [
  {
    editId: 'E1', by: 'user', field: 'approval:merge', summary: '', undone: false, batch: null,
  },
  {
    editId: 'E2', by: 'user', field: 'entity:web/gate:typecheck', summary: 'Example: typecheck runs incrementally.', undone: false, batch: null,
  },
  {
    editId: 'E3', by: 'user', field: 'entity:design-system/gate:unit-tests', summary: 'Copied gates from web', undone: false, batch: 'E3',
  },
  {
    editId: 'E4', by: 'user', field: 'entity:design-system/phase-order:build', summary: 'Copied gates from web', undone: false, batch: 'E3',
  },
];

const MONOREPO_EDITED_DRAFT = examplePipeline({
  ...MONOREPO_PIPELINE,
  approvals: { tickets: true, merge: true },
  entities:  {
    'web':           { ...WEB_ENTITY, gates: [exampleGate('typecheck', 'bun run typecheck --incremental'), exampleGate('unit-tests', 'bun test')] },
    'design-system': {
      ...DESIGN_SYSTEM_ENTITY,
      gates:  [...DESIGN_SYSTEM_ENTITY.gates, exampleGate('unit-tests', 'bun test')],
      phases: { ...DESIGN_SYSTEM_ENTITY.phases, build: ['typecheck', 'unit-tests'] },
    },
    'root': ROOT_ENTITY,
  },
});

/** An update of the pipeline over entities: four changes in three levels, two of them one copy, and two tickets in flight. */
function monorepoEditingState(): BoardDocument {
  const record = updateRecord({ draft: MONOREPO_EDITED_DRAFT, draftRevision: 4, edits: [...MONOREPO_EDITS] });
  const changeList: BoardPipelineChangeDocument[] = [
    { field: 'approval:merge', changeKind: 'changed', editId: 'E1' },
    { field: 'entity:web/gate:typecheck', changeKind: 'changed', editId: 'E2' },
    { field: 'entity:design-system/gate:unit-tests', changeKind: 'new', editId: 'E3' },
    { field: 'entity:design-system/phase-order:build', changeKind: 'changed', editId: 'E4' },
  ];
  const entities = { 'web': setupEntityFacts(), 'design-system': setupEntityFacts(), 'root': setupEntityFacts() };
  return withMonorepoTickets(setupState(record, { agentJobState: null, entities, draftEntities: servedDraftEntitiesOf(MONOREPO_EDITED_DRAFT) }, {
    applied: MONOREPO_APPLIED_PIPELINE,
    flow:    monorepoFlowOf('editing', 'unchanged', true, { changeList, ticketIdsInFlight: ['21', '22'] }),
  }));
}

const FIXTURE_BUILDERS: Readonly<Record<PipelineFixtureName, () => BoardDocument>> = {
  'A0':             () => pipelineBoardState({}),
  'A0-unreadable':  () => pipelineBoardState({ applied: { readingVerdict: 'malformed', reason: 'gates[1] has no run line', fileText: '{ "version": 5 }\n' } }),
  'A0b-running':    () => setupState(setupRecord()),
  'A0b-at-billing': () => setupState(setupRecord({
    stepStates: {
      billing: 'in-progress', research: 'not-started', entities: null, constitution: 'not-started', design: 'not-started', apply: 'not-started',
    },
    currentStep:     'billing',
    findings:        [],
    constitution:    null,
    draft:           null,
    draftRevision:   0,
    edits:           [],
    readyToContinue: [],
    questions:       [],
  })),
  'A0b-stopped':       () => setupState(setupRecord(), { agentJobState: null }),
  'A0b-main-moved':    () => setupState(setupRecord(), { mainMovedByCommits: 3 }),
  'A0b-apply-pending': () => setupState(setupRecord(), { applyState: applyState({ state: 'committing' }) }),
  'A0b-recheck':       () => setupState(setupRecord({
    stepStates: {
      billing: 'done', research: 'in-progress', entities: null, constitution: 'needs-recheck', design: 'needs-recheck', apply: 'not-started',
    },
    currentStep: 'research',
  })),
  'A1': () => setupState(setupRecord({
    stepStates: {
      billing: 'done', research: 'in-progress', entities: null, constitution: 'not-started', design: 'not-started', apply: 'not-started',
    },
    currentStep:     'research',
    constitution:    null,
    draft:           null,
    draftRevision:   0,
    edits:           [],
    readyToContinue: ['research'],
    questions:       [setupQuestion({ questionId: 'Q1', step: 'research', subject: { kind: 'finding', reference: 'F4' } })],
  }), {}, {}, { jobs: [...boardStateFixture().jobs, PIPELINE_AGENT_JOB] }),
  'A3b': () => setupState(setupRecord({
    stepStates: {
      billing: 'done', research: 'done', entities: null, constitution: 'in-progress', design: 'not-started', apply: 'not-started',
    },
    currentStep: 'constitution',
    draft:       null,
  })),
  'A3b-anchored-line-edited': () => {
    const editedMarkdown = CONSTITUTION_MARKDOWN.replace(ANCHORED_LINE, '- Use TypeScript in its strictest mode.');
    const keptAnnotations = constitutionDraft().annotations.filter((annotation) => annotation.lineText !== ANCHORED_LINE);
    return setupState(setupRecord({
      stepStates: {
        billing: 'done', research: 'done', entities: null, constitution: 'in-progress', design: 'not-started', apply: 'not-started',
      },
      currentStep:  'constitution',
      draft:        null,
      constitution: constitutionDraft({ markdown: editedMarkdown, annotations: keptAnnotations, revision: 4 }),
    }));
  },
  'A2':               () => setupState(setupRecord(), {}, { flow: proposalFlow({ changeList: [...PROPOSAL_CHANGES] }) }),
  'A2-question-open': () => {
    const record = setupRecord({ questions: [ANSWERED_RESEARCH_QUESTION, OPEN_DESIGN_QUESTION] });
    return setupState(record, {}, { flow: withNodeChanged(proposalFlow({ changeList: [...PROPOSAL_CHANGES] }), 'gates-merge', { questionIds: ['Q3'] }) });
  },
  'A2-designing':            () => setupState(setupRecord({ draft: null, edits: [] }), {}, { flow: minimalFlow({ toolbarStage: 'proposal' }) }),
  'A3-constitution-removed': () => {
    const builder = { ...WORKER_PAIR, instructions: [{ kind: 'default-brief', role: 'builder' } as const] };
    const draft = examplePipeline({ ...PROPOSED_PIPELINE, agents: { ...PROPOSED_PIPELINE.agents, builder } });
    const flow = withNodeChanged(proposalFlow(), 'builder', { instructionEntries: [defaultBriefEntry('builder', ['builder'])] });
    return setupState(setupRecord({ draft }), { readByRoles: ['reviewer', 'reReviewer', 'conflictReReviewer'] }, { flow });
  },
  'A3-fable-xhigh': () => {
    const fablePair: BoardAgentPairDocument = { model: 'fable', effort: 'xhigh' };
    const draft = examplePipeline({ ...PROPOSED_PIPELINE, agents: { ...PROPOSED_PIPELINE.agents, builder: { ...fablePair, instructions: null } } });
    return setupState(setupRecord({ draft }), {}, { flow: withNodeChanged(proposalFlow(), 'builder', { settings: fablePair }) });
  },
  'A4':            () => setupState(setupRecord(), {}, { flow: proposalFlow() }),
  'A4-committing': () => setupState(setupRecord(), { applyState: applyState({ state: 'committing', ticketIdHoldingMain: '14' }) }, { flow: proposalFlow() }),
  'A4-held':       () => setupState(
    setupRecord(),
    { applyState: applyState({ state: 'held', reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'] }) },
    { flow: proposalFlow() },
  ),
  'A4-refused-unsigned': () => setupState(
    setupRecord(),
    { applyState: applyState({ state: 'refused', reason: 'constitution-commit-unsigned' }) },
    { flow: proposalFlow() },
  ),
  'A5': () => pipelineBoardState({
    applied: APPLIED_PIPELINE,
    flow:    liveFlow({ occupants: [...LIVE_OCCUPANTS], ticketIdsInFlight: ['14', '15', '12'] }),
    history: [
      { kind: 'hephaestus-set', state: 'running', at: '2026-11-12T10:31:00' },
      {
        kind: 'pipeline-gate-added', name: 'browser-tests', run: 'bun run test:browser', at: '2026-11-12T10:29:00'
      },
      {
        kind: 'pipeline-approval-set', approval: 'tickets', state: 'on', at: '2026-11-12T10:28:00'
      },
    ],
  }),
  'A6':                                  () => editingState(EDITING_CHANGES),
  'A6-drawn-changes':                    () => drawnChangesState(),
  'A6-re-review-removed':                () => reReviewRemovedState(),
  'A6b':                                 () => editingState([...EDITING_CHANGES, { field: 'constitution', changeKind: 'changed', editId: 'E8' }]),
  'A7':                                  () => minimalState(),
  'A7-insert-menu-open':                 () => minimalState(),
  'A7-human-code-review-without-review': () => {
    const draft = examplePipeline({ approvals: { merge: true } });
    return setupState(updateRecord({ draft }), { agentJobState: null }, {
      applied: MINIMAL_APPLIED_PIPELINE,
      flow:    flowOf({
        pipeline: draft, stage: 'editing', mark: 'unchanged', humanCodeReview: true, applied: true,
      }, {
        changeList:  [{ field: 'approval:merge', changeKind: 'changed', editId: 'E9' }],
        insertSlots: [{ slotId: 'after-builder', after: 'builder', offeredSteps: ['build-gates', 'review'] }],
      }),
    });
  },
  'flow-merge-before-review':        () => setupState(setupRecord(), {}, { flow: proposalFlow() }),
  'flow-human-code-review-proposal': () => {
    const draft = examplePipeline({ ...PROPOSED_PIPELINE, approvals: { tickets: true, merge: true } });
    return setupState(setupRecord({ draft }), {}, {
      flow: flowOf({
        pipeline: draft, stage: 'proposal', mark: 'proposed', humanCodeReview: true, applied: false,
      }),
    });
  },
  'flow-human-code-review-live': () => {
    const pipeline = examplePipeline({ ...PROPOSED_PIPELINE, approvals: { tickets: true, merge: true } });
    return pipelineBoardState({
      applied: { ...APPLIED_PIPELINE, pipeline },
      flow:    flowOf({
        pipeline, stage: 'live', mark: 'unchanged', humanCodeReview: true, applied: true,
      }, { occupants: [...LIVE_OCCUPANTS] }),
    });
  },
  'flow-re-review-off': () => {
    const draft = examplePipeline({ ...PROPOSED_PIPELINE, review: { name: 'review', reReview: null }, airlock: { reReview: null } });
    return setupState(setupRecord({ draft }), {}, {
      flow: flowOf({
        pipeline: draft, stage: 'proposal', mark: 'proposed', humanCodeReview: false, applied: false,
      }),
    });
  },
  'profile-running':           () => profileState('running', 41_000),
  'profile-timed-out':         () => profileState('timed-out', 600_000),
  'profile-stopped':           () => profileState('stopped', 12_000),
  'profile-passed':            () => profileState('passed', 94_000),
  'header-both-usage-windows': () => usageState([
    {
      window: 'five_hour', lengthHours: 5, utilization: 14, resetsAt: '2026-11-12T15:00:00'
    },
    {
      window: 'seven_day', lengthHours: 168, utilization: 18, resetsAt: '2026-11-16T09:00:00'
    },
  ]),
  'header-no-usage-windows': () => usageState([]),
  'mono-design':             () => monorepoDesignState(),
  'mono-editing':            () => monorepoEditingState(),
  'mono-live':               () => monorepoLiveState(),
};

/** The board of one named pipeline state; each call builds a fresh copy, so a spec may change what it gets. */
/** The board with its pipeline facts changed, for a state the named fixtures lack. */
export function withPipelineFacts(board: BoardDocument, changes: Partial<BoardPipelineFactsDocument>): BoardDocument {
  return { ...board, pipeline: { ...board.pipeline, ...changes } };
}

export function pipelineBoardStateOf(name: PipelineFixtureName): BoardDocument {
  return FIXTURE_BUILDERS[name]();
}
