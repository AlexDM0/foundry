/**
 * Synthetic pipeline facts for the Pipeline view's specs: one complete `BoardStateDocument` per designed state, by name, so a spec reads
 * `pipelineBoardStateOf('A2-question-open')` and no view keeps fixtures of its own. Every value is example data on the Example Agency
 * board; each state is built when it is asked for.
 */
import type { Pipeline, PipelineAgentRole } from '../../src/lib/tracker-model/@types/Pipeline.ts';
import type {
  AppliedPipelineFacts,
  ApplyStateFacts,
  GateProfileRunFacts,
  GateProfileRunState,
  PipelineChange,
  DerivedSettingsSource,
  MergePlacement,
  PipelineChoices,
  PipelineFlowEdge,
  PipelineFlowFacts,
  PipelineFlowNode,
  PipelineFlowStage,
  PipelineGateRow,
  PipelineInsertSlot,
  PipelineNodeDialogTarget,
  PipelineNodeMark,
  PipelineOccupant,
  PipelineSetupFacts,
  ResolvedInstructionEntry,
  ResolvedSourceAnnotation
} from '../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type {
  ConstitutionDraft,
  PipelineSetup,
  SetupEdit,
  SetupQuestion
} from '../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { AgentPair }                                             from '../../src/lib/tracker-model/@types/Ticket.ts';
import type { BoardStateDocument, PageTicketDocument, UsageDocument } from '../@types/BoardStateDocument.ts';

import { boardStateFixture } from './BoardStateFixture.ts';

export type PipelineFixtureName =
  | 'A0'
  | 'A0-unreadable'
  | 'A0b-running'
  | 'A0b-stopped'
  | 'A0b-main-moved'
  | 'A0b-recheck'
  | 'A0b-apply-pending'
  | 'A1'
  | 'A3b'
  | 'A3b-anchored-line-edited'
  | 'A2'
  | 'A2-question-open'
  | 'A3-constitution-removed'
  | 'A3-fable-xhigh'
  | 'A4'
  | 'A4-committing'
  | 'A4-held'
  | 'A4-refused-unsigned'
  | 'A5'
  | 'A6'
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
  | 'header-no-usage-windows';

export const PIPELINE_FIXTURE_SETUP_ID = 'S1';

export const PIPELINE_FIXTURE_AGENT_JOB_ID = 'J4';

export const PIPELINE_CHOICES_FIXTURE: PipelineChoices = {
  models:  ['haiku', 'sonnet', 'opus', 'fable'],
  efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
};

const WORKER_PAIR: AgentPair = { model: 'opus', effort: 'medium' };

const RE_REVIEWER_PAIR: AgentPair = { model: 'sonnet', effort: 'high' };

const FIXTURE_THRESHOLD_LINES = 750;

const PENDING_TICKETS: readonly PageTicketDocument[] = ['11', '12', '13'].map((ticketId) => ({
  id: ticketId, title: `Example pending ticket ${ticketId}`, status: 'pending', updated: '2026-11-12T09:00:00', delivered: null, abandonedAt: null,
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

const ANCHORED_LINE = '- Use TypeScript in strict mode.';

const PROPOSED_PIPELINE: Pipeline = {
  version: 2,
  prepare: [{ name: 'install', run: 'bun install --frozen-lockfile' }],
  gates:   [
    { name: 'typecheck', run: 'bun run typecheck' },
    { name: 'lint', run: 'bun run lint', fix: 'bun run lint:fix' },
    { name: 'unit-tests', run: 'bun test' },
    { name: 'browser-tests', run: 'bun run test:browser', network: ['registry.example.com'] },
  ],
  phases: {
    build:  ['typecheck', 'lint', 'unit-tests'],
    review: ['typecheck', 'lint', 'unit-tests'],
    merge:  ['typecheck', 'unit-tests', 'browser-tests'],
  },
  review:  { name: 'review', reReview: { thresholdLines: FIXTURE_THRESHOLD_LINES } },
  airlock: { reReview: { thresholdLines: FIXTURE_THRESHOLD_LINES } },
  agents:  {
    builder:            { model: 'opus', effort: 'medium' },
    reviewer:           { model: 'opus', effort: 'medium' },
    reReviewer:         { model: 'sonnet', effort: 'high' },
    conflictReReviewer: { model: 'sonnet', effort: 'high' },
  },
  approvals: { tickets: true, merge: false },
  billing:   { mode: 'subscription' },
};

const MINIMAL_PIPELINE: Pipeline = {
  version: 2, prepare: [], gates: [], phases: { build: [], review: [], merge: [] },
};

function constitutionEntry(readByRoles: PipelineAgentRole[], applied: boolean): ResolvedInstructionEntry {
  return {
    entry:     { kind: 'constitution' },
    fileName:  applied ? 'CONSTITUTION.md' : 'constitution.md',
    readByRoles,
    text:      CONSTITUTION_MARKDOWN,
    textIsCut: false,
  };
}

function defaultBriefEntry(role: PipelineAgentRole, readByRoles: PipelineAgentRole[]): ResolvedInstructionEntry {
  return {
    entry:     { kind: 'default-brief', role },
    fileName:  `${role}.md`,
    readByRoles,
    text:      `Example default brief of the ${role} role.`,
    textIsCut: false,
  };
}

/** The node-to-dialog table of PLAN 9.1, as the Overseer's flow graph applies it. */
function exampleDialogTargetOf(node: Partial<PipelineFlowNode> & Pick<PipelineFlowNode, 'nodeKind'>): PipelineNodeDialogTarget | null {
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

function exampleNode(changes: Partial<PipelineFlowNode> & Pick<PipelineFlowNode, 'nodeId' | 'nodeKind'>): PipelineFlowNode {
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

const CONSTITUTION_READERS: PipelineAgentRole[] = ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'];

const REVIEWER_BRIEF_READERS: PipelineAgentRole[] = ['reviewer', 'reReviewer', 'conflictReReviewer'];

const PRODUCT_OWNER_BRIEF = defaultBriefEntry('productOwner', ['productOwner']);

function mergeNode(nodeId: string, mergePlacement: MergePlacement, derivedFrom: DerivedSettingsSource, mark: PipelineNodeMark): PipelineFlowNode {
  return exampleNode({
    nodeId, nodeKind: 'merge-main-into-tree', mergePlacement, derivedFrom, settings: WORKER_PAIR, mark,
  });
}

function reReviewNode(nodeId: string, role: PipelineAgentRole, thresholdLines: number, mark: PipelineNodeMark): PipelineFlowNode {
  return exampleNode({
    nodeId, nodeKind: 're-review', role, settings: RE_REVIEWER_PAIR, conditional: true, thresholdLines, mark,
  });
}

function withNodeChanged(flow: PipelineFlowFacts, nodeId: string, changes: Partial<PipelineFlowNode>): PipelineFlowFacts {
  return { ...flow, nodes: flow.nodes.map((node) => (node.nodeId === nodeId ? { ...node, ...changes } : node)) };
}

function resolvedAnnotationsOf(constitution: ConstitutionDraft): ResolvedSourceAnnotation[] {
  const lines = constitution.markdown.split('\n');
  return constitution.annotations.map((annotation) => ({ ...annotation, lineIndex: lines.indexOf(annotation.lineText) }));
}

function forwardEdge(from: string, to: string, changes: Partial<PipelineFlowEdge> = {}): PipelineFlowEdge {
  return {
    edgeId: `${from}->${to}`, from, to, tone: 'forward', labelKind: null, active: false, ...changes,
  };
}

function rollbackEdge(from: string, to: string, labelKind: PipelineFlowEdge['labelKind']): PipelineFlowEdge {
  return forwardEdge(from, to, { tone: 'rollback', labelKind });
}

function gateRowsOf(pipeline: Pipeline, mark: PipelineNodeMark): PipelineFlowFacts['gateRows'] {
  const rowsOfPhase = (phase: keyof Pipeline['phases']): PipelineGateRow[] => {
    const gateNames = pipeline.phases[phase];
    if (gateNames.length === 0) return [];
    const prepareRows: PipelineGateRow[] = pipeline.prepare.map((step) => ({
      rowKind: 'prepare', name: step.name, run: step.run, fix: null, in: null, network: [], alsoInPhases: [], mark,
    }));
    const gateRows = gateNames.map((gateName): PipelineGateRow => {
      const gate = pipeline.gates.find((candidate) => candidate.name === gateName);
      return {
        rowKind:      'gate',
        name:         gateName,
        run:          gate?.run ?? '',
        fix:          gate?.fix ?? null,
        in:           gate?.in ?? null,
        network:      gate?.network ?? [],
        alsoInPhases: (['build', 'review', 'merge'] as const).filter((other) => other !== phase && pipeline.phases[other].includes(gateName)),
        mark,
      };
    });
    return [...prepareRows, ...gateRows];
  };
  return { build: rowsOfPhase('build'), review: rowsOfPhase('review'), merge: rowsOfPhase('merge') };
}

interface FlowShape {
  readonly pipeline:        Pipeline;
  readonly stage:           PipelineFlowStage;
  readonly mark:            PipelineNodeMark;
  readonly humanCodeReview: boolean;
  readonly applied:         boolean;
}

/** The nodes, edges and slots of a pipeline with a review step, as the Overseer's flow graph would draw them for the shape given. */
function flowOf(shape: FlowShape, changes: Partial<PipelineFlowFacts> = {}): PipelineFlowFacts {
  const {
    pipeline, mark, humanCodeReview, applied
  } = shape;
  const { review } = pipeline;
  const reviewReReview = review?.reReview ?? null;
  const airlockReReview = pipeline.airlock?.reReview ?? null;
  const chipsOf = (phase: keyof Pipeline['phases']): PipelineFlowNode['gateChips'] => pipeline.phases[phase].map((gateName) => ({ gateName, mark }));
  const lastWorker = review === undefined ? 'builder' : 'last-worker';
  const nodes: PipelineFlowNode[] = [
    exampleNode({
      nodeId: 'ticket-creation', nodeKind: 'ticket-creation', role: 'productOwner', settings: WORKER_PAIR, mark, instructionEntries: [PRODUCT_OWNER_BRIEF],
    }),
    exampleNode({
      nodeId: 'human-ticket-review', nodeKind: 'human-ticket-review', switchState: 'on', mark
    }),
    exampleNode({
      nodeId:             'builder',
      nodeKind:           'builder',
      role:               'builder',
      settings:           WORKER_PAIR,
      mark,
      instructionEntries: [constitutionEntry(CONSTITUTION_READERS, applied), defaultBriefEntry('builder', ['builder'])],
    }),
    ...(pipeline.phases.build.length === 0 ? [] : [exampleNode({
      nodeId: 'gates-build', nodeKind: 'gates', phase: 'build', gateChips: chipsOf('build'), mark,
    })]),
    ...(review === undefined ? [] : [
      exampleNode({ ...mergeNode('merge-before-review', 'before-review', 'builder', mark), gateChips: chipsOf('build'), }),
      exampleNode({
        nodeId:             'review',
        nodeKind:           'review',
        role:               'reviewer',
        settings:           WORKER_PAIR,
        mark,
        instructionEntries: [constitutionEntry(CONSTITUTION_READERS, applied), defaultBriefEntry('reviewer', REVIEWER_BRIEF_READERS)],
      }),
      exampleNode({
        nodeId: 'gates-review', nodeKind: 'gates', phase: 'review', gateChips: chipsOf('review'), mark,
      }),
      ...(reviewReReview === null ? [] : [reReviewNode('re-review', 'reReviewer', reviewReReview.thresholdLines, mark)]),
    ]),
    ...(humanCodeReview ? [
      mergeNode('merge-before-human-code-review', 'before-human-code-review', lastWorker, mark),
      ...(airlockReReview === null ? [] : [exampleNode({
        nodeId:         're-review-before-human-code-review',
        nodeKind:       're-review',
        role:           'conflictReReviewer',
        settings:       RE_REVIEWER_PAIR,
        conditional:    true,
        thresholdLines: airlockReReview.thresholdLines,
        mark,
      })]),
      exampleNode({
        nodeId: 'gates-review-again', nodeKind: 'gates', phase: review === undefined ? 'build' : 'review', gateChips: chipsOf(review === undefined ? 'build' : 'review'), mark,
      }),
    ] : []),
    exampleNode({
      nodeId: 'human-code-review', nodeKind: 'human-code-review', switchState: humanCodeReview ? 'on' : 'off', mark
    }),
    ...(humanCodeReview ? [] : [exampleNode({ nodeId: 'ready-for-airlock', nodeKind: 'ready-for-airlock', mark })]),
    exampleNode({ nodeId: 'airlock', nodeKind: 'airlock', mark }),
    exampleNode({
      nodeId: 'merge-in-airlock', nodeKind: 'merge-main-into-tree', mergePlacement: 'airlock', derivedFrom: lastWorker, settings: WORKER_PAIR, mark,
    }),
    ...(airlockReReview === null ? [] : [reReviewNode('re-review-in-airlock', 'conflictReReviewer', airlockReReview.thresholdLines, mark)]),
    ...(pipeline.phases.merge.length === 0 ? [] : [exampleNode({
      nodeId: 'gates-merge', nodeKind: 'gates', phase: 'merge', gateChips: chipsOf('merge'), mark,
    })]),
    exampleNode({ nodeId: 'fast-forward-main', nodeKind: 'fast-forward-main', mark }),
  ];
  const nodeIds = nodes.map((node) => node.nodeId).filter((nodeId) => nodeId !== 'airlock');
  const live = shape.stage === 'live';
  const edges: PipelineFlowEdge[] = [
    ...nodeIds.slice(1).map((nodeId, i) => forwardEdge(nodeIds[i] ?? '', nodeId, {
      active:    live,
      labelKind: nodeIds[i] === 'merge-before-review' ? 'all-green' : null,
    })),
    ...(pipeline.phases.build.length === 0 ? [] : [rollbackEdge('gates-build', 'builder', 'red-builder-fixes')]),
    ...(review === undefined ? [] : [
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
    ...changes,
  };
}

function proposalFlow(changes: Partial<PipelineFlowFacts> = {}): PipelineFlowFacts {
  return flowOf({
    pipeline: PROPOSED_PIPELINE, stage: 'proposal', mark: 'proposed', humanCodeReview: false, applied: false,
  }, changes);
}

function liveFlow(changes: Partial<PipelineFlowFacts> = {}): PipelineFlowFacts {
  return flowOf({
    pipeline: PROPOSED_PIPELINE, stage: 'live', mark: 'unchanged', humanCodeReview: false, applied: true,
  }, changes);
}

/** The minimal pipeline (PLAN 6.4): no review, so no merge before review, and the + slots after the Builder and in the train. */
function minimalFlow(changes: Partial<PipelineFlowFacts> = {}): PipelineFlowFacts {
  const builder = exampleNode({
    nodeId: 'builder', nodeKind: 'builder', role: 'builder', settings: WORKER_PAIR, instructionEntries: [defaultBriefEntry('builder', ['builder'])],
  });
  const nodes: PipelineFlowNode[] = [
    exampleNode({
      nodeId: 'ticket-creation', nodeKind: 'ticket-creation', role: 'productOwner', settings: WORKER_PAIR
    }),
    exampleNode({ nodeId: 'human-ticket-review', nodeKind: 'human-ticket-review', switchState: 'on' }),
    builder,
    exampleNode({ nodeId: 'airlock', nodeKind: 'airlock' }),
    exampleNode({
      nodeId: 'merge-in-airlock', nodeKind: 'merge-main-into-tree', mergePlacement: 'airlock', derivedFrom: 'builder', settings: WORKER_PAIR,
    }),
    exampleNode({ nodeId: 'fast-forward-main', nodeKind: 'fast-forward-main' }),
  ];
  const insertSlots: PipelineInsertSlot[] = [
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
    ...changes,
  };
}

function constitutionDraft(changes: Partial<ConstitutionDraft> = {}): ConstitutionDraft {
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
    baseBlob:    null,
    revision:    3,
    ...changes,
  };
}

function setupQuestion(changes: Partial<SetupQuestion> & Pick<SetupQuestion, 'questionId' | 'step'>): SetupQuestion {
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

const ANSWERED_RESEARCH_QUESTION = setupQuestion({
  questionId: 'Q1',
  step:       'research',
  subject:    { kind: 'finding', reference: 'F6' },
  question:   'Is the example dev server a gate?',
  answer:     { letters: ['b'], answeredAt: '2026-11-12T09:20:00' },
});

const OPEN_DESIGN_QUESTION = setupQuestion({ questionId: 'Q3', step: 'design', subject: { kind: 'gate', reference: 'browser-tests' } });

const USER_EDITS: readonly SetupEdit[] = [
  {
    editId: 'E1', by: 'agent', field: 'gate:typecheck', summary: 'Example: typecheck runs in every phase.', undone: false,
  },
  {
    editId: 'E2', by: 'user', field: 'role:reviewer', summary: 'Example: the reviewer runs on opus.', undone: false,
  },
  {
    editId: 'E3', by: 'user', field: 'approval:tickets', summary: 'Example: User readies each draft.', undone: false,
  },
];

function setupRecord(changes: Partial<PipelineSetup> = {}): PipelineSetup {
  return {
    formatVersion:   1,
    setupId:         PIPELINE_FIXTURE_SETUP_ID,
    mode:            'setup',
    baseContentHash: null,
    stepStates:      {
      billing: 'done', research: 'done', constitution: 'done', design: 'in-progress', apply: 'not-started',
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
    applyRequest:               null,
    nextNumbers:                { finding: 5, question: 2, edit: 4 },
    extra:                      [],
    ...changes,
  };
}

function setupFacts(record: PipelineSetup, changes: Partial<PipelineSetupFacts> = {}): PipelineSetupFacts {
  const { constitution } = record;
  return {
    record,
    summary: {
      stackItemCount:        record.findings.filter((finding) => finding.topic === 'stack').length,
      scriptCount:           record.findings.filter((finding) => finding.script !== null).length,
      answeredQuestionCount: record.questions.filter((question) => question.answer !== null).length,
      prepareStepCount:      record.draft?.prepare.length ?? 0,
      gateCountByPhase:      {
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
    annotations:         constitution === null ? [] : resolvedAnnotationsOf(constitution),
    readByRoles:         ['builder', 'reviewer', 'reReviewer', 'conflictReReviewer'],
    applyState:          null,
    ...changes,
  };
}

const ABSENT_PIPELINE: AppliedPipelineFacts = { readingVerdict: 'absent' };

const APPLIED_PIPELINE: AppliedPipelineFacts = {
  readingVerdict: 'readable',
  pipeline:       PROPOSED_PIPELINE,
  contentHash:    'example-content-hash-0001',
  fileText:       `${JSON.stringify(PROPOSED_PIPELINE, null, 2)}\n`,
  application:    {
    appliedRevision: 2, appliedAt: '2026-11-12T10:30:00', appliedBy: 'user', constitutionCommit: '2222222222222222222222222222222222222222',
  },
};

const MINIMAL_APPLIED_PIPELINE: AppliedPipelineFacts = {
  readingVerdict: 'readable', pipeline: MINIMAL_PIPELINE, contentHash: 'example-content-hash-0002', fileText: `${JSON.stringify(MINIMAL_PIPELINE)}\n`, application: null,
};

function pipelineBoardState(changes: Partial<BoardStateDocument>): BoardStateDocument {
  const base = boardStateFixture();
  return boardStateFixture({
    pipeline:        ABSENT_PIPELINE,
    pipelineSetup:   null,
    pipelineFlow:    null,
    profileRuns:     [],
    pipelineHistory: [],
    pipelineChoices: PIPELINE_CHOICES_FIXTURE,
    concurrency:     { limit: 2, agentsInFlight: 0 },
    ...(base.page === undefined ? {} : { page: { ...base.page, tickets: [...base.page.tickets, ...PENDING_TICKETS] } }),
    ...changes,
  });
}

function setupState(record: PipelineSetup, factChanges: Partial<PipelineSetupFacts> = {}, changes: Partial<BoardStateDocument> = {}): BoardStateDocument {
  return pipelineBoardState({ pipelineSetup: setupFacts(record, factChanges), ...changes });
}

function applyState(changes: Partial<ApplyStateFacts> & Pick<ApplyStateFacts, 'state'>): ApplyStateFacts {
  return {
    draftRevision: 7, resumesBoard: true, commitJobId: 'J9', reason: null, blockingFiles: [], ticketIdHoldingMain: null, ...changes,
  };
}

function profileRun(state: GateProfileRunState, elapsedMilliseconds: number | null): GateProfileRunFacts {
  return {
    profileRunId: 'P1', gateName: 'browser-tests', phase: 'merge', state, elapsedMilliseconds,
  };
}

function profileState(state: GateProfileRunState, elapsedMilliseconds: number | null): BoardStateDocument {
  return setupState(setupRecord(), {}, { pipelineFlow: proposalFlow(), profileRuns: [profileRun(state, elapsedMilliseconds)] });
}

const LIVE_OCCUPANTS: readonly PipelineOccupant[] = [
  {
    occupantKind: 'draft', occupantId: 'D3', nodeId: 'ticket-creation', jobId: 'J7', since: '2026-11-12T11:40:00',
  },
  {
    occupantKind: 'ticket', occupantId: '14', nodeId: 'builder', jobId: 'J12', since: '2026-11-12T11:20:00',
  },
  {
    occupantKind: 'ticket', occupantId: '15', nodeId: 'merge-before-review', jobId: 'J13', since: '2026-11-12T11:50:00',
  },
];

const EDITING_CHANGES: readonly PipelineChange[] = [
  { field: 'role:reviewer', changeKind: 'changed', editId: 'E2' },
  { field: 'gate:browser-tests', changeKind: 'new', editId: 'E4' },
  { field: 'gate:lint', changeKind: 'removed', editId: 'E5' },
];

function updateRecord(changes: Partial<PipelineSetup> = {}): PipelineSetup {
  return setupRecord({
    setupId:         'S2',
    mode:            'update',
    baseContentHash: 'example-content-hash-0001',
    stepStates:      {
      billing: 'done', research: 'done', constitution: 'done', design: 'done', apply: 'not-started',
    },
    currentStep: 'apply',
    agentJobId:  null,
    questions:   [],
    ...changes,
  });
}

function editingState(changeList: readonly PipelineChange[]): BoardStateDocument {
  return setupState(updateRecord(), { agentJobState: null }, {
    pipeline:     APPLIED_PIPELINE,
    pipelineFlow: flowOf({
      pipeline: PROPOSED_PIPELINE, stage: 'editing', mark: 'unchanged', humanCodeReview: false, applied: true,
    }, { changeList: [...changeList], ticketIdsInFlight: ['14', '15'] }),
  });
}

function minimalState(): BoardStateDocument {
  return setupState(updateRecord({ draft: MINIMAL_PIPELINE }), { agentJobState: null }, {
    pipeline:     APPLIED_PIPELINE,
    pipelineFlow: minimalFlow({ changeList: [{ field: 'review', changeKind: 'removed', editId: 'E6' }, { field: 'airlock', changeKind: 'removed', editId: 'E7' }], }),
  });
}

function usageState(windows: UsageDocument['windows']): BoardStateDocument {
  const usage: UsageDocument = { resetsAt: null, window: null, ...(windows === undefined ? {} : { windows }) };
  return pipelineBoardState({ pipeline: APPLIED_PIPELINE, pipelineFlow: liveFlow(), usage });
}

const FIXTURE_BUILDERS: Readonly<Record<PipelineFixtureName, () => BoardStateDocument>> = {
  'A0':             () => pipelineBoardState({}),
  'A0-unreadable':  () => pipelineBoardState({ pipeline: { readingVerdict: 'malformed', reason: 'gates[1] has no run line', fileText: '{ "version": 2 }\n' }, }),
  'A0b-running':    () => setupState(setupRecord()),
  'A0b-stopped':    () => setupState(setupRecord(), { agentJobState: null }),
  'A0b-main-moved': () => setupState(setupRecord(), { mainMovedByCommits: 3 }),
  'A0b-recheck':    () => setupState(setupRecord({
    stepStates: {
      billing: 'done', research: 'in-progress', constitution: 'needs-recheck', design: 'needs-recheck', apply: 'not-started',
    },
    currentStep: 'research',
  })),
  'A0b-apply-pending': () => setupState(
    setupRecord({
      applyRequest: {
        draftRevision: 7, resumesBoard: true, commitJobId: 'J9', state: 'committing', reason: null,
      },
    }),
    { applyState: applyState({ state: 'committing' }) },
  ),
  'A1': () => setupState(setupRecord({
    stepStates: {
      billing: 'done', research: 'in-progress', constitution: 'not-started', design: 'not-started', apply: 'not-started',
    },
    currentStep:     'research',
    constitution:    null,
    draft:           null,
    draftRevision:   0,
    edits:           [],
    readyToContinue: ['research'],
    questions:       [setupQuestion({ questionId: 'Q1', step: 'research', subject: { kind: 'finding', reference: 'F4' } })],
    nextNumbers:     { finding: 5, question: 2, edit: 1 },
  })),
  'A3b': () => setupState(setupRecord({
    stepStates: {
      billing: 'done', research: 'done', constitution: 'in-progress', design: 'not-started', apply: 'not-started',
    },
    currentStep: 'constitution',
    draft:       null,
  })),
  'A3b-anchored-line-edited': () => {
    const editedMarkdown = CONSTITUTION_MARKDOWN.replace(ANCHORED_LINE, '- Use TypeScript in its strictest mode.');
    const keptAnnotations = constitutionDraft().annotations.filter((annotation) => annotation.lineText !== ANCHORED_LINE);
    return setupState(setupRecord({
      stepStates: {
        billing: 'done', research: 'done', constitution: 'in-progress', design: 'not-started', apply: 'not-started',
      },
      currentStep:  'constitution',
      draft:        null,
      constitution: constitutionDraft({ markdown: editedMarkdown, annotations: keptAnnotations, revision: 4 }),
    }));
  },
  'A2':               () => setupState(setupRecord(), {}, { pipelineFlow: proposalFlow() }),
  'A2-question-open': () => {
    const record = setupRecord({ questions: [ANSWERED_RESEARCH_QUESTION, OPEN_DESIGN_QUESTION], nextNumbers: { finding: 5, question: 4, edit: 4 } });
    return setupState(record, {}, { pipelineFlow: withNodeChanged(proposalFlow(), 'gates-merge', { questionIds: ['Q3'] }) });
  },
  'A3-constitution-removed': () => {
    const builder = { ...WORKER_PAIR, instructions: [{ kind: 'default-brief', role: 'builder' } as const] };
    const draft: Pipeline = { ...PROPOSED_PIPELINE, agents: { ...PROPOSED_PIPELINE.agents, builder } };
    const pipelineFlow = withNodeChanged(proposalFlow(), 'builder', { instructionEntries: [defaultBriefEntry('builder', ['builder'])] });
    return setupState(setupRecord({ draft }), { readByRoles: ['reviewer', 'reReviewer', 'conflictReReviewer'] }, { pipelineFlow });
  },
  'A3-fable-xhigh': () => {
    const fablePair: AgentPair = { model: 'fable', effort: 'xhigh' };
    const draft: Pipeline = { ...PROPOSED_PIPELINE, agents: { ...PROPOSED_PIPELINE.agents, builder: fablePair } };
    return setupState(setupRecord({ draft }), {}, { pipelineFlow: withNodeChanged(proposalFlow(), 'builder', { settings: fablePair }) });
  },
  'A4':            () => setupState(setupRecord(), {}, { pipelineFlow: proposalFlow() }),
  'A4-committing': () => setupState(
    setupRecord({
      applyRequest: {
        draftRevision: 7, resumesBoard: true, commitJobId: 'J9', state: 'committing', reason: null
      }
    }),
    { applyState: applyState({ state: 'committing', ticketIdHoldingMain: '14' }) },
    { pipelineFlow: proposalFlow() },
  ),
  'A4-held': () => setupState(
    setupRecord({
      applyRequest: {
        draftRevision: 7, resumesBoard: true, commitJobId: null, state: 'held', reason: 'dirty-checkout'
      }
    }),
    {
      applyState: applyState({
        state: 'held', commitJobId: null, reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md']
      })
    },
    { pipelineFlow: proposalFlow() },
  ),
  'A4-refused-unsigned': () => setupState(
    setupRecord({
      applyRequest: {
        draftRevision: 7, resumesBoard: true, commitJobId: null, state: 'refused', reason: 'constitution-commit-unsigned'
      }
    }),
    { applyState: applyState({ state: 'refused', commitJobId: null, reason: 'constitution-commit-unsigned' }) },
    { pipelineFlow: proposalFlow() },
  ),
  'A5': () => pipelineBoardState({
    pipeline:        APPLIED_PIPELINE,
    pipelineFlow:    liveFlow({ occupants: [...LIVE_OCCUPANTS], ticketIdsInFlight: ['14', '15'] }),
    pipelineHistory: [
      { kind: 'pipeline-gate-added', fields: { name: 'browser-tests', run: 'bun run test:browser' }, at: '2026-11-12T10:29:00' },
      { kind: 'pipeline-approval-set', fields: { approval: 'tickets', state: 'on' }, at: '2026-11-12T10:28:00' },
    ],
  }),
  'A6':                                  () => editingState(EDITING_CHANGES),
  'A6b':                                 () => editingState([...EDITING_CHANGES, { field: 'constitution', changeKind: 'changed', editId: 'E8' }]),
  'A7':                                  () => minimalState(),
  'A7-insert-menu-open':                 () => minimalState(),
  'A7-human-code-review-without-review': () => {
    const draft: Pipeline = { ...MINIMAL_PIPELINE, approvals: { merge: true } };
    return setupState(updateRecord({ draft }), { agentJobState: null }, {
      pipeline:     MINIMAL_APPLIED_PIPELINE,
      pipelineFlow: flowOf({
        pipeline: draft, stage: 'editing', mark: 'unchanged', humanCodeReview: true, applied: true,
      }, {
        changeList:  [{ field: 'approval:merge', changeKind: 'changed', editId: 'E9' }],
        insertSlots: [{ slotId: 'after-builder', after: 'builder', offeredSteps: ['build-gates', 'review'] }],
      }),
    });
  },
  'flow-merge-before-review':        () => setupState(setupRecord(), {}, { pipelineFlow: proposalFlow() }),
  'flow-human-code-review-proposal': () => {
    const draft: Pipeline = { ...PROPOSED_PIPELINE, approvals: { tickets: true, merge: true } };
    return setupState(setupRecord({ draft }), {}, {
      pipelineFlow: flowOf({
        pipeline: draft, stage: 'proposal', mark: 'proposed', humanCodeReview: true, applied: false,
      }),
    });
  },
  'flow-human-code-review-live': () => {
    const pipeline: Pipeline = { ...PROPOSED_PIPELINE, approvals: { tickets: true, merge: true } };
    return pipelineBoardState({
      pipeline:     { ...APPLIED_PIPELINE, pipeline },
      pipelineFlow: flowOf({
        pipeline, stage: 'live', mark: 'unchanged', humanCodeReview: true, applied: true,
      }, { occupants: [...LIVE_OCCUPANTS] }),
    });
  },
  'flow-re-review-off': () => {
    const draft: Pipeline = { ...PROPOSED_PIPELINE, review: { name: 'review' }, airlock: {} };
    return setupState(setupRecord({ draft }), {}, {
      pipelineFlow: flowOf({
        pipeline: draft, stage: 'proposal', mark: 'proposed', humanCodeReview: false, applied: false,
      }),
    });
  },
  'profile-running':           () => profileState('running', 41_000),
  'profile-timed-out':         () => profileState('timed-out', 600_000),
  'profile-stopped':           () => profileState('stopped', 12_000),
  'profile-passed':            () => profileState('passed', 94_000),
  'header-both-usage-windows': () => usageState([
    { window: 'five_hour', utilization: 14, resetsAt: '2026-11-12T15:00:00' },
    { window: 'seven_day', utilization: 18, resetsAt: '2026-11-16T09:00:00' },
  ]),
  'header-no-usage-windows': () => usageState([]),
};

/** The board state of one designed pipeline state; each call builds a fresh copy, so a spec may change what it gets. */
export function pipelineBoardStateOf(name: PipelineFixtureName): BoardStateDocument {
  return FIXTURE_BUILDERS[name]();
}
