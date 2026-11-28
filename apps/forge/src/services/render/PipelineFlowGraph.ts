/**
 * The flow the Pipeline view draws, as values: its nodes, edges, insert slots and gate rows, each with its mark. The same pipeline gives
 * the same graph on every stage; only the marks differ: all `proposed` in a proposal, all `unchanged` live, and against the applied
 * pipeline while editing. On a forge over entities each entity's single pipeline gives a graph of its own the same way.
 */
import { GATE_PHASES, type GatePhase } from '../../domain/tracker-model/@types/GatePhase.ts';
import type {
  EntityKey,
  Pipeline,
  PipelineAgentRole,
  PipelineApproval
} from '../../domain/tracker-model/@types/Pipeline.ts';
import { PIPELINE_FORMAT_VERSION } from '../../domain/tracker-model/@types/Pipeline.ts';
import type {
  DerivedSettingsSource,
  MergePlacement,
  PipelineFlowEdge,
  PipelineFlowFacts,
  PipelineFlowNode,
  PipelineFlowStage,
  PipelineGateChip,
  PipelineGateRow,
  PipelineInsertSlot,
  PipelineInsertableStep,
  PipelineNodeDialogTarget,
  PipelineNodeKind,
  PipelineNodeMark,
  ResolvedInstructionEntry
} from '../../domain/tracker-model/@types/PipelineFacts.ts';
import type { PipelineDraftField } from '../../domain/tracker-model/@types/PipelineSetup.ts';
import type { AgentPair }          from '../../domain/tracker-model/@types/Ticket.ts';
import type { PipelineChangeKind } from '../../domain/tracker-model/utils/PipelineChangeUtil.ts';
import { PipelineChangeUtil }      from '../../domain/tracker-model/utils/PipelineChangeUtil.ts';
import { PipelineUtil }            from '../../domain/tracker-model/utils/PipelineUtil.ts';
import { TicketWritingUtil }       from '../../domain/tracker-model/utils/TicketWritingUtil.ts';

export interface PipelineFlowGraphInput {
  /** The draft during a setup or an edit; the stored pipeline when live. */
  pipeline:             Pipeline;
  /** What the editing marks compare with; null on a first setup, which compares with the minimal pipeline. Read only while editing. */
  appliedPipeline:      Pipeline | null;
  stage:                PipelineFlowStage;
  /** The model and effort a role runs on where the pipeline names none. */
  defaultSettingsOf:    (role: PipelineAgentRole) => AgentPair;
  /** A role's instruction list, resolved to its files and their texts on main. */
  instructionEntriesOf: (role: PipelineAgentRole) => ResolvedInstructionEntry[];
}

export type PipelineFlowGraph = Pick<PipelineFlowFacts, 'nodes' | 'edges' | 'insertSlots' | 'gateRows'>;

export interface EntityFlowGraphsInput extends Omit<PipelineFlowGraphInput, 'instructionEntriesOf'> {
  /** A role's instruction list in an entity's single pipeline, resolved to its files and their texts on main. */
  instructionEntriesOf: (entityPipeline: Pipeline, role: PipelineAgentRole) => ResolvedInstructionEntry[];
}

export const PIPELINE_FLOW_NODE_IDS = Object.freeze({
  ticketCreation:                'ticket-creation',
  humanTicketReview:             'human-ticket-review',
  specWriting:                   'spec-writing',
  humanSpecReview:               'human-spec-review',
  planWriting:                   'plan-writing',
  humanPlanReview:               'human-plan-review',
  builder:                       'builder',
  buildGates:                    'gates-build',
  mergeBeforeReview:             'merge-before-review',
  review:                        'review',
  reviewGates:                   'gates-review',
  reReview:                      're-review',
  mergeBeforeHumanCodeReview:    'merge-before-human-code-review',
  reReviewBeforeHumanCodeReview: 're-review-before-human-code-review',
  gatesBeforeHumanCodeReview:    'gates-review-again',
  humanCodeReview:               'human-code-review',
  readyForAirlock:               'ready-for-airlock',
  airlock:                       'airlock',
  mergeInAirlock:                'merge-in-airlock',
  reReviewInAirlock:             're-review-in-airlock',
  mergeGates:                    'gates-merge',
  fastForwardMain:               'fast-forward-main',
});

const PIPELINE_INSERT_SLOT_IDS = Object.freeze({
  afterBuilder: 'after-builder',
  afterReview:  'after-review',
  airlock:      'airlock',
});

const NODE_IDS = PIPELINE_FLOW_NODE_IDS;

/** Where a node stands in the flow and what it is, before its settings and marks are filled in. */
interface NodePlace {
  nodeId:         string;
  nodeKind:       PipelineNodeKind;
  role:           PipelineAgentRole | null;
  phase:          GatePhase | null;
  mergePlacement: MergePlacement | null;
  derivedFrom:    DerivedSettingsSource | null;
  thresholdLines: number | null;
}

interface GraphContext {
  readonly input:       PipelineFlowGraphInput;
  readonly draft:       Pipeline;
  /** The pipeline marks compare with; only read while editing. */
  readonly base:        Pipeline;
  readonly editing:     boolean;
  readonly changeKinds: ReadonlyMap<PipelineDraftField, PipelineChangeKind>;
  readonly baseNodeIds: ReadonlySet<string>;
}

function minimalPipelineOf(): Pipeline {
  return {
    version: PIPELINE_FORMAT_VERSION, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  };
}

function placeOf(nodeId: string, nodeKind: PipelineNodeKind, changes: Partial<NodePlace> = {}): NodePlace {
  return {
    nodeId, nodeKind, role: null, phase: null, mergePlacement: null, derivedFrom: null, thresholdLines: null, ...changes,
  };
}

/** How a ticket is written: the product owner's ticket and User's review of it, or a spec and a plan, each with User's review. */
function ticketWritingPlacesOf(pipeline: Pipeline): NodePlace[] {
  if (TicketWritingUtil.routeOf(pipeline) === 'one-ticket') {
    return [
      placeOf(NODE_IDS.ticketCreation, 'ticket-creation', { role: 'productOwner' }),
      placeOf(NODE_IDS.humanTicketReview, 'human-ticket-review'),
    ];
  }
  return [
    placeOf(NODE_IDS.specWriting, 'spec-writing', { role: 'specAgent' }),
    placeOf(NODE_IDS.humanSpecReview, 'human-spec-review'),
    placeOf(NODE_IDS.planWriting, 'plan-writing', { role: 'planAgent' }),
    placeOf(NODE_IDS.humanPlanReview, 'human-plan-review'),
  ];
}

/**
 * The nodes of a pipeline in drawing order. The merge before review comes with the review step; the merge before User's code
 * review, its re-review and its gates come with the merge approval; a merge's worker is the builder when no review step exists.
 */
function nodePlacesOf(pipeline: Pipeline, phaseIsDrawn: (phase: GatePhase) => boolean): NodePlace[] {
  const { review }                 = pipeline;
  const airlockReReview            = pipeline.airlock?.reReview;
  const humanCodeReviewIsOn        = PipelineChangeUtil.approvalIsOn(pipeline, 'merge');
  const lastWorker                 = review === undefined ? 'builder' : 'last-worker';
  const phaseBeforeHumanCodeReview = review === undefined ? 'build' : 'review';
  const gatesPlaceOf = (nodeId: string, phase: GatePhase): NodePlace[] => (phaseIsDrawn(phase) ? [placeOf(nodeId, 'gates', { phase })] : []);
  return [
    ...ticketWritingPlacesOf(pipeline),
    placeOf(NODE_IDS.builder, 'builder', { role: 'builder' }),
    ...gatesPlaceOf(NODE_IDS.buildGates, 'build'),
    ...(review === undefined ? [] : [
      placeOf(NODE_IDS.mergeBeforeReview, 'merge-main-into-tree', { mergePlacement: 'before-review', derivedFrom: 'builder' }),
      placeOf(NODE_IDS.review, 'review', { role: 'reviewer' }),
      ...gatesPlaceOf(NODE_IDS.reviewGates, 'review'),
      ...(review.reReview === undefined ? [] : [
        placeOf(NODE_IDS.reReview, 're-review', { role: 'reReviewer', thresholdLines: review.reReview.thresholdLines }),
      ]),
    ]),
    ...(humanCodeReviewIsOn ? [
      placeOf(NODE_IDS.mergeBeforeHumanCodeReview, 'merge-main-into-tree', { mergePlacement: 'before-human-code-review', derivedFrom: lastWorker }),
      ...(airlockReReview === undefined ? [] : [
        placeOf(NODE_IDS.reReviewBeforeHumanCodeReview, 're-review', { role: 'conflictReReviewer', thresholdLines: airlockReReview.thresholdLines }),
      ]),
      ...gatesPlaceOf(NODE_IDS.gatesBeforeHumanCodeReview, phaseBeforeHumanCodeReview),
    ] : []),
    ...(review === undefined && !humanCodeReviewIsOn ? [] : [placeOf(NODE_IDS.humanCodeReview, 'human-code-review')]),
    ...(review === undefined || humanCodeReviewIsOn ? [] : [placeOf(NODE_IDS.readyForAirlock, 'ready-for-airlock')]),
    placeOf(NODE_IDS.airlock, 'airlock'),
    placeOf(NODE_IDS.mergeInAirlock, 'merge-main-into-tree', { mergePlacement: 'airlock', derivedFrom: lastWorker }),
    ...(airlockReReview === undefined ? [] : [
      placeOf(NODE_IDS.reReviewInAirlock, 're-review', { role: 'conflictReReviewer', thresholdLines: airlockReReview.thresholdLines }),
    ]),
    ...gatesPlaceOf(NODE_IDS.mergeGates, 'merge'),
    placeOf(NODE_IDS.fastForwardMain, 'fast-forward-main'),
  ];
}

/** The node-to-dialog table: the merge before review opens nothing, since nothing on it is set. */
function dialogTargetOf(place: NodePlace): PipelineNodeDialogTarget | null {
  switch (place.nodeKind) {
    case 'ticket-creation':
    case 'spec-writing':
    case 'plan-writing':
    case 'builder':
      return 'agent-step';
    case 'review':
      return 'review-step';
    case 're-review':
      return place.role === 'reReviewer' ? 'review-step-re-review' : 'merge-step-re-review';
    case 'merge-main-into-tree':
      return place.mergePlacement === 'before-review' ? null : 'merge-step';
    case 'gates':
      return 'gates-tab';
    default:
      return null;
  }
}

function settingsOfRole(context: GraphContext, role: PipelineAgentRole): AgentPair {
  const stored   = context.draft.agents?.[role];
  const fallback = context.input.defaultSettingsOf(role);
  return { model: stored?.model ?? fallback.model, effort: stored?.effort ?? fallback.effort };
}

/** A merge's derived meter: the builder's pair, or the reviewer's for a ticket whose last worker is its reviewer. */
function settingsOfPlace(context: GraphContext, place: NodePlace): AgentPair | null {
  if (place.role !== null) return settingsOfRole(context, place.role);
  if (place.derivedFrom === 'builder') return settingsOfRole(context, 'builder');
  if (place.derivedFrom === 'last-worker') return settingsOfRole(context, 'reviewer');
  return null;
}

function draftPhaseHolds(context: GraphContext, phase: GatePhase, gateName: string): boolean {
  return context.draft.phases[phase].includes(gateName);
}

/** The draft's gates of a phase in run order, then, while editing, the ones the draft removed from it, which stay drawn until Apply. */
function chipNamesOf(context: GraphContext, phase: GatePhase): string[] {
  const draftNames = context.draft.phases[phase];
  if (!context.editing) return [...draftNames];
  return [...draftNames, ...context.base.phases[phase].filter((gateName) => !draftNames.includes(gateName))];
}

function unmarkedStageMarkOf(stage: PipelineFlowStage): PipelineNodeMark {
  return stage === 'proposal' ? 'proposed' : 'unchanged';
}

function gateChipMarkOf(context: GraphContext, phase: GatePhase, gateName: string): PipelineNodeMark {
  if (!context.editing) return unmarkedStageMarkOf(context.input.stage);
  if (!draftPhaseHolds(context, phase, gateName)) return 'removed';
  if (!context.base.phases[phase].includes(gateName)) return 'new';
  return context.changeKinds.get(`gate:${gateName}`) === 'changed' ? 'changed' : 'unchanged';
}

function gateChipsOf(context: GraphContext, phase: GatePhase): PipelineGateChip[] {
  return chipNamesOf(context, phase).map((gateName) => ({ gateName, mark: gateChipMarkOf(context, phase, gateName) }));
}

function gatesNodeMarkOf(context: GraphContext, place: NodePlace, phase: GatePhase): PipelineNodeMark {
  if (context.draft.phases[phase].length === 0) return 'removed';
  if (!context.baseNodeIds.has(place.nodeId)) return 'new';
  const chipChanged = gateChipsOf(context, phase).some((chip) => chip.mark !== 'unchanged');
  return chipChanged || context.changeKinds.has(`phase-order:${phase}`) ? 'changed' : 'unchanged';
}

function thresholdChanged(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && before !== after;
}

/** A node the base draws too is changed only when a field it shows changed. */
function nodeIsChanged(context: GraphContext, place: NodePlace): boolean {
  const { base, draft, changeKinds } = context;
  const roleChanged = place.role !== null && changeKinds.has(`role:${place.role}`);
  switch (place.nodeKind) {
    case 'human-ticket-review':
      return changeKinds.has('approval:tickets');
    case 'spec-writing':
    case 'plan-writing':
      return roleChanged || changeKinds.has('ticket-writing');
    case 'human-spec-review':
      return changeKinds.has('approval:spec') || changeKinds.has('ticket-writing');
    case 'human-plan-review':
      return changeKinds.has('approval:plan') || changeKinds.has('ticket-writing');
    case 'human-code-review':
      return changeKinds.has('approval:merge');
    case 'review':
      return roleChanged || base.review?.name !== draft.review?.name;
    case 're-review':
      return roleChanged || (place.role === 'reReviewer'
        ? thresholdChanged(base.review?.reReview?.thresholdLines, draft.review?.reReview?.thresholdLines)
        : thresholdChanged(base.airlock?.reReview?.thresholdLines, draft.airlock?.reReview?.thresholdLines));
    default:
      return roleChanged;
  }
}

function nodeMarkOf(context: GraphContext, place: NodePlace): PipelineNodeMark {
  if (!context.editing) return unmarkedStageMarkOf(context.input.stage);
  if (place.phase !== null) return gatesNodeMarkOf(context, place, place.phase);
  if (!context.baseNodeIds.has(place.nodeId)) return 'new';
  return nodeIsChanged(context, place) ? 'changed' : 'unchanged';
}

/** The merge before review runs the build gates again on the merged tree, so it shows their chips. */
function gateChipsOfPlace(context: GraphContext, place: NodePlace): PipelineGateChip[] {
  if (place.phase !== null) return gateChipsOf(context, place.phase);
  if (place.mergePlacement === 'before-review') return gateChipsOf(context, 'build');
  return [];
}

const APPROVAL_OF_SWITCH_NODE: Readonly<Partial<Record<PipelineNodeKind, PipelineApproval>>> = Object.freeze({
  'human-ticket-review': 'tickets',
  'human-spec-review':   'spec',
  'human-plan-review':   'plan',
  'human-code-review':   'merge',
});

function switchStateOf(context: GraphContext, place: NodePlace): PipelineFlowNode['switchState'] {
  const approval = APPROVAL_OF_SWITCH_NODE[place.nodeKind];
  if (approval === undefined) return null;
  return PipelineChangeUtil.approvalIsOn(context.draft, approval) ? 'on' : 'off';
}

function nodeOf(context: GraphContext, place: NodePlace): PipelineFlowNode {
  return {
    nodeId:             place.nodeId,
    nodeKind:           place.nodeKind,
    role:               place.role,
    settings:           settingsOfPlace(context, place),
    instructionEntries: place.role === null ? [] : context.input.instructionEntriesOf(place.role),
    derivedFrom:        place.derivedFrom,
    mergePlacement:     place.mergePlacement,
    phase:              place.phase,
    conditional:        place.nodeKind === 're-review',
    thresholdLines:     place.thresholdLines,
    switchState:        switchStateOf(context, place),
    gateChips:          gateChipsOfPlace(context, place),
    mark:               nodeMarkOf(context, place),
    dialogTarget:       dialogTargetOf(place),
    questionIds:        [],
  };
}

function edgeOf(from: string, to: string, changes: Partial<PipelineFlowEdge> = {}): PipelineFlowEdge {
  return {
    edgeId: `${from}->${to}`, from, to, tone: 'forward', labelKind: null, active: false, ...changes,
  };
}

/**
 * The forward line through every step but the merge train's frame, then the ways back: a red gate to its fixer, the merge before review
 * to the builder, and a re-review's loop to the gates it runs again.
 */
function edgesOf(nodes: readonly PipelineFlowNode[], stage: PipelineFlowStage): PipelineFlowEdge[] {
  const drawn  = new Set(nodes.map((node) => node.nodeId));
  const steps  = nodes.filter((node) => node.nodeKind !== 'airlock').map((node) => node.nodeId);
  const active = stage === 'live';
  const forwardEdges = steps.slice(1).map((nodeId, i) => {
    const from = steps[i] ?? '';
    return edgeOf(from, nodeId, { active, labelKind: from === NODE_IDS.mergeBeforeReview ? 'all-green' : null });
  });
  const edgeWhenDrawn = (from: string, to: string, changes: Partial<PipelineFlowEdge>): PipelineFlowEdge[] => (drawn.has(from) && drawn.has(to)
    ? [edgeOf(from, to, changes)]
    : []);
  return [
    ...forwardEdges,
    ...edgeWhenDrawn(NODE_IDS.buildGates, NODE_IDS.builder, { tone: 'rollback', labelKind: 'red-builder-fixes' }),
    ...edgeWhenDrawn(NODE_IDS.mergeBeforeReview, NODE_IDS.builder, { tone: 'rollback', labelKind: 'conflict-or-red-builder-fixes' }),
    ...edgeWhenDrawn(NODE_IDS.reviewGates, NODE_IDS.review, { tone: 'rollback', labelKind: 'red-reviewer-fixes' }),
    ...edgeWhenDrawn(NODE_IDS.reReview, NODE_IDS.reviewGates, { tone: 'loop', labelKind: 'gates-again-after-re-review' }),
    ...edgeWhenDrawn(NODE_IDS.mergeGates, NODE_IDS.mergeInAirlock, { tone: 'rollback', labelKind: 'red-last-worker-fixes' }),
  ];
}

function slotOf(slotId: string, after: string, offeredSteps: PipelineInsertableStep[]): PipelineInsertSlot[] {
  return offeredSteps.length === 0 ? [] : [{ slotId, after, offeredSteps }];
}

/**
 * A + where the draft misses a step, one per line: after the Builder, after the review, and in the merge train. A step sits where the
 * flow draws it: review gates before the re-review, merge gates after the train's re-review.
 */
function insertSlotsOf(draft: Pipeline, drawn: ReadonlySet<string>): PipelineInsertSlot[] {
  const { review } = draft;
  const humanCodeReviewIsOn = PipelineChangeUtil.approvalIsOn(draft, 'merge');
  const buildGatesMissing   = draft.phases.build.length === 0;
  const afterBuilderSteps: PipelineInsertableStep[] = [
    ...(buildGatesMissing ? ['build-gates' as const] : []),
    ...(review === undefined ? ['review' as const] : []),
    ...(review === undefined && !humanCodeReviewIsOn ? ['human-code-review' as const] : []),
  ];
  const afterBuilder = !buildGatesMissing && drawn.has(NODE_IDS.buildGates) ? NODE_IDS.buildGates : NODE_IDS.builder;
  const reviewGatesMissing = draft.phases.review.length === 0;
  const afterReviewSteps: PipelineInsertableStep[] = review === undefined ? [] : [
    ...(reviewGatesMissing ? ['review-gates' as const] : []),
    ...(review.reReview === undefined ? ['re-review' as const] : []),
  ];
  const afterReview = !reviewGatesMissing && drawn.has(NODE_IDS.reviewGates) ? NODE_IDS.reviewGates : NODE_IDS.review;
  const mergeGatesMissing = draft.phases.merge.length === 0;
  const airlockSteps: PipelineInsertableStep[] = [
    ...(mergeGatesMissing ? ['merge-gates' as const] : []),
    ...(draft.airlock?.reReview === undefined ? ['airlock-re-review' as const] : []),
  ];
  const afterAirlockMerge = mergeGatesMissing && drawn.has(NODE_IDS.reReviewInAirlock) ? NODE_IDS.reReviewInAirlock : NODE_IDS.mergeInAirlock;
  return [
    ...slotOf(PIPELINE_INSERT_SLOT_IDS.afterBuilder, afterBuilder, afterBuilderSteps),
    ...slotOf(PIPELINE_INSERT_SLOT_IDS.afterReview, afterReview, afterReviewSteps),
    ...slotOf(PIPELINE_INSERT_SLOT_IDS.airlock, afterAirlockMerge, airlockSteps),
  ];
}

function prepareRowMarkOf(context: GraphContext, stepName: string): PipelineNodeMark {
  if (!context.editing) return unmarkedStageMarkOf(context.input.stage);
  return context.changeKinds.get(`prepare:${stepName}`) ?? 'unchanged';
}

/** The draft's prepare steps, then, while editing, the ones it removed. */
function prepareStepsOf(context: GraphContext): Pipeline['prepare'] {
  const { draft, base, editing } = context;
  if (!editing) return draft.prepare;
  return [...draft.prepare, ...base.prepare.filter((step) => !draft.prepare.some((kept) => kept.name === step.name))];
}

/** A phase with no gates skips the prepare steps, so its tab lists none. */
function gateRowsOfPhase(context: GraphContext, phase: GatePhase): PipelineGateRow[] {
  const chips = gateChipsOf(context, phase);
  if (chips.length === 0) return [];
  const prepareRows = prepareStepsOf(context).map((step): PipelineGateRow => ({
    rowKind: 'prepare', name: step.name, run: step.run, fix: null, in: null, network: [], alsoInPhases: [], mark: prepareRowMarkOf(context, step.name),
  }));
  const gateRows = chips.flatMap((chip): PipelineGateRow[] => {
    const holder = context.draft.gates.some((gate) => gate.name === chip.gateName) ? context.draft : context.base;
    const gate   = holder.gates.find((candidate) => candidate.name === chip.gateName);
    if (gate === undefined) return [];
    return [{
      rowKind:      'gate',
      name:         gate.name,
      run:          gate.run,
      fix:          gate.fix ?? null,
      in:           gate.in ?? null,
      network:      gate.network ?? [],
      alsoInPhases: GATE_PHASES.filter((other) => other !== phase && holder.phases[other].includes(gate.name)),
      mark:         chip.mark,
    }];
  });
  return [...prepareRows, ...gateRows];
}

function changeKindsOf(base: Pipeline, draft: Pipeline): Map<PipelineDraftField, PipelineChangeKind> {
  return new Map(PipelineChangeUtil.changesBetween(base, draft, false).map((change) => [change.field, change.change]));
}

export function pipelineFlowGraphOf(input: PipelineFlowGraphInput): PipelineFlowGraph {
  const draft   = input.pipeline;
  const editing = input.stage === 'editing';
  const base    = input.appliedPipeline ?? minimalPipelineOf();
  const baseNodeIds = new Set(nodePlacesOf(base, (phase) => base.phases[phase].length > 0).map((place) => place.nodeId));
  const context: GraphContext = {
    input, draft, base, editing, changeKinds: editing ? changeKindsOf(base, draft) : new Map(), baseNodeIds,
  };
  const phaseIsDrawn = (phase: GatePhase): boolean => chipNamesOf(context, phase).length > 0;
  const nodes = nodePlacesOf(draft, phaseIsDrawn).map((place) => nodeOf(context, place));
  return {
    nodes,
    edges:       edgesOf(nodes, input.stage),
    insertSlots: insertSlotsOf(draft, new Set(nodes.map((node) => node.nodeId))),
    gateRows:    { build: gateRowsOfPhase(context, 'build'), review: gateRowsOfPhase(context, 'review'), merge: gateRowsOfPhase(context, 'merge') },
  };
}

/**
 * The graph of each entity the pipeline holds, by its key, drawn from the entity's single pipeline and marked against the applied
 * pipeline's entity of that key, or against the minimal pipeline where the applied one has no such entity. Null without entities.
 */
export function entityFlowGraphsOf(input: EntityFlowGraphsInput): Record<EntityKey, PipelineFlowGraph> | null {
  const { pipeline, appliedPipeline } = input;
  if (pipeline.entities === undefined) return null;
  return Object.fromEntries(Object.keys(pipeline.entities).flatMap((entityKey) => {
    const entityPipeline = PipelineUtil.pipelineOfEntity(pipeline, entityKey);
    if (entityPipeline === null) return [];
    const graph = pipelineFlowGraphOf({
      pipeline:             entityPipeline,
      appliedPipeline:      appliedPipeline === null ? null : PipelineUtil.pipelineOfEntity(appliedPipeline, entityKey),
      stage:                input.stage,
      defaultSettingsOf:    input.defaultSettingsOf,
      instructionEntriesOf: (role) => input.instructionEntriesOf(entityPipeline, role),
    });
    return [[entityKey, graph] as const];
  }));
}
