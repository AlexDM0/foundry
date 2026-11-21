/**
 * The Focus layout's model, pure: which of the four phases (Ticket, Build, Review, Merge) holds each node and add slot of the facts, the
 * stepper's tab of each phase with its sub-line and pill, the open phase's header words, the step a live card is in, and the Ticket
 * phase's readiness lines. The Merge header stands for the merge train's frame and its end, so those nodes get no step card. An entity of a
 * monorepo draws three phases: its tickets are made at the forge, so the Ticket phase is the forge's.
 */
import type { BoardFlowNodeDocument, BoardInsertSlotDocument, BoardPipelineFlowDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardFlowStage, BoardGatePhase, BoardPipelineNodeKind }                     from '../../../../@types/board/BoardVocabulary.ts';
import { PipelineFlowModel, type FlowSlotPlace, type StepKind }                           from './PipelineFlowModel.ts';

export type PipelinePhase = 'ticket' | 'build' | 'review' | 'merge';

export const PIPELINE_PHASES: readonly PipelinePhase[] = Object.freeze(['ticket', 'build', 'review', 'merge']);

/** An entity's phases: Build, Review and Merge. */
export const ENTITY_PHASES: readonly PipelinePhase[] = Object.freeze(['build', 'review', 'merge']);

/** A card in the open phase's step row: a node's step, or an add card where the facts name a missing step. */
export type PhaseStepItem =
  | { readonly kind: 'step'; readonly node: BoardFlowNodeDocument }
  | { readonly kind: 'add'; readonly slot: BoardInsertSlotDocument; readonly place: FlowSlotPlace };

export type PhasePillTone = 'warn' | 'neutral' | 'error';

export interface PhasePillView {
  readonly text: string;
  readonly tone: PhasePillTone;
}

export interface PhaseTabView {
  readonly phase:      PipelinePhase;
  readonly name:       string;
  readonly subText:    string;
  readonly pill:       PhasePillView | null;
  /** No step of the phase runs, so its dot is a ring. */
  readonly runsNoStep: boolean;
}

export interface PhaseHeaderView {
  readonly numberText: string;
  readonly name:       string;
  readonly purpose:    string;
  /** "Leaves when", "Skipped:" or "Ends", before the bold `endText`. */
  readonly endLead:    string;
  readonly endText:    string;
  /** The phase the outlined Next button opens; null on the Merge phase, which ends on main. */
  readonly nextPhase:  PipelinePhase | null;
}

/** What the stepper reads beside the flow: the stage, whether this is the smallest pipeline, and the questions still open. */
export interface PhaseTabContext {
  readonly stage:           BoardFlowStage;
  readonly minimal:         boolean;
  readonly openQuestionIds: readonly string[];
  /** The phases drawn, in order; absent draws all four. */
  readonly phases?:         readonly PipelinePhase[];
}

export interface ReadinessLine {
  readonly key:   string;
  readonly title: string;
  readonly text:  string;
}

const PHASE_NAMES: Readonly<Record<PipelinePhase, string>> = Object.freeze({
  ticket: 'Ticket', build: 'Build', review: 'Review', merge: 'Merge',
});

/** The node kinds the Merge header draws: the queue for the train, the Airlock's frame and the fast-forward of main. */
const HEADER_NODE_KINDS: readonly BoardPipelineNodeKind[] = Object.freeze(['ready-for-airlock', 'airlock', 'fast-forward-main']);

const DONE_ON_MAIN_TEXT = 'Done on main';

const TICKET_READINESS: readonly ReadinessLine[] = Object.freeze([
  { key: 'acceptance', title: 'A numbered Acceptance', text: 'Each line is one check the change must pass.' },
  { key: 'brief', title: 'A Brief', text: 'At least one line. It is the builder\'s brief.' },
]);

function countText(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

/** The phase a node opens, walking the facts' order; null for a node that stays in the phase before it. */
function phaseOpenedBy(node: BoardFlowNodeDocument, current: PipelinePhase): PipelinePhase | null {
  if (node.nodeKind === 'builder' && current === 'ticket') return 'build';
  const opensReview = node.nodeKind === 'review' || node.nodeKind === 'human-code-review'
    || (node.nodeKind === 'merge-main-into-tree' && node.mergePlacement === 'before-human-code-review');
  if (opensReview && (current === 'ticket' || current === 'build')) return 'review';
  if (node.nodeKind === 'ready-for-airlock' || node.nodeKind === 'airlock') return 'merge';
  return null;
}

function phaseByNodeIdOf(nodes: readonly BoardFlowNodeDocument[]): ReadonlyMap<string, PipelinePhase> {
  const phaseByNodeId = new Map<string, PipelinePhase>();
  let current: PipelinePhase = 'ticket';
  nodes.forEach((node) => {
    current = phaseOpenedBy(node, current) ?? current;
    phaseByNodeId.set(node.nodeId, current);
  });
  return phaseByNodeId;
}

function phaseOfNode(flow: Pick<BoardPipelineFlowDocument, 'nodes'>, nodeId: string): PipelinePhase {
  return phaseByNodeIdOf(flow.nodes).get(nodeId) ?? 'ticket';
}

/** A gate phase's gates table stands in the phase of the same name. */
function phaseOfGatePhase(gatePhase: BoardGatePhase): PipelinePhase {
  return gatePhase;
}

/** The phase's gates table, or null for the Ticket phase, which has none. */
function gatePhaseOf(phase: PipelinePhase): BoardGatePhase | null {
  return phase === 'ticket' ? null : phase;
}

function nodeHasStepCard(node: BoardFlowNodeDocument): boolean {
  return !HEADER_NODE_KINDS.includes(node.nodeKind);
}

function slotPlaceOf(after: BoardFlowNodeDocument, phase: PipelinePhase): FlowSlotPlace {
  if (phase === 'merge') return 'merge-train';
  if (after.nodeKind === 'builder' || (after.nodeKind === 'gates' && after.phase === 'build')) return 'after-builder';
  return 'after-review';
}

/** The phase's cards in the facts' order, each add card right after the node its slot follows. */
function stepItemsOf(flow: Pick<BoardPipelineFlowDocument, 'nodes' | 'insertSlots'>, phase: PipelinePhase): PhaseStepItem[] {
  const phaseByNodeId = phaseByNodeIdOf(flow.nodes);
  return flow.nodes.filter((node) => phaseByNodeId.get(node.nodeId) === phase).flatMap((node): PhaseStepItem[] => [
    ...(nodeHasStepCard(node) ? [{ kind: 'step' as const, node }] : []),
    ...flow.insertSlots.filter((slot) => slot.after === node.nodeId).map((slot) => ({ kind: 'add' as const, slot, place: slotPlaceOf(node, phase) })),
  ]);
}

function stepNodesOf(flow: Pick<BoardPipelineFlowDocument, 'nodes' | 'insertSlots'>, phase: PipelinePhase): BoardFlowNodeDocument[] {
  return stepItemsOf(flow, phase).flatMap((item) => (item.kind === 'step' ? [item.node] : []));
}

/** The nodes of the phase, its header's too, so their occupants and marks count. */
function nodesOfPhase(flow: Pick<BoardPipelineFlowDocument, 'nodes'>, phase: PipelinePhase): BoardFlowNodeDocument[] {
  const phaseByNodeId = phaseByNodeIdOf(flow.nodes);
  return flow.nodes.filter((node) => phaseByNodeId.get(node.nodeId) === phase);
}

/** A removed step is drawn until Apply, but no longer runs. */
function runningStepCountOf(flow: Pick<BoardPipelineFlowDocument, 'nodes' | 'insertSlots'>, phase: PipelinePhase): number {
  return stepNodesOf(flow, phase).filter((node) => node.mark !== 'removed').length;
}

function gateCountOf(flow: Pick<BoardPipelineFlowDocument, 'gateRows'>, phase: PipelinePhase): number {
  const gatePhase = gatePhaseOf(phase);
  if (gatePhase === null) return 0;
  return flow.gateRows[gatePhase].filter((row) => row.rowKind === 'gate' && row.mark !== 'removed').length;
}

function occupantsOfPhase(flow: Pick<BoardPipelineFlowDocument, 'nodes' | 'occupants'>, phase: PipelinePhase): BoardPipelineFlowDocument['occupants'] {
  const nodeIds = new Set(nodesOfPhase(flow, phase).map((node) => node.nodeId));
  return flow.occupants.filter((occupant) => nodeIds.has(occupant.nodeId));
}

/** "2 steps · 3 gates", "1 step · no gates", "No review" for a phase with no step that runs, and a live Ticket phase's drafts in work. */
function subTextOf(flow: BoardPipelineFlowDocument, phase: PipelinePhase, stage: BoardFlowStage): string {
  const stepCount = runningStepCountOf(flow, phase);
  if (stepCount === 0) return phase === 'review' ? 'No review' : 'No step';
  const draftCount = occupantsOfPhase(flow, phase).filter((occupant) => occupant.occupantKind === 'draft').length;
  if (stage === 'live' && phase === 'ticket' && draftCount > 0) return `${countText(stepCount, 'step')} · ${countText(draftCount, 'draft')} in work`;
  const gateCount = gateCountOf(flow, phase);
  return `${countText(stepCount, 'step')} · ${gateCount === 0 ? 'no gates' : countText(gateCount, 'gate')}`;
}

/** The phase's steps and gate rows that differ from the applied pipeline; a gates step counts by its rows. */
function changeCountOf(flow: BoardPipelineFlowDocument, phase: PipelinePhase): number {
  const stepChanges = stepNodesOf(flow, phase).filter((node) => node.nodeKind !== 'gates' && PipelineFlowModel.changeOfMark(node.mark) !== null).length;
  const gatePhase = gatePhaseOf(phase);
  const rowChanges = gatePhase === null ? 0 : flow.gateRows[gatePhase].filter((row) => PipelineFlowModel.changeOfMark(row.mark) !== null).length;
  return stepChanges + rowChanges;
}

/** The smallest pipeline's pill: "Removed" when the phase lost a step, "Changed" when one changed or came. */
function minimalPillOf(flow: BoardPipelineFlowDocument, phase: PipelinePhase): PhasePillView | null {
  const changes = nodesOfPhase(flow, phase).map((node) => PipelineFlowModel.changeOfMark(node.mark));
  if (changes.includes('removed')) return { text: 'Removed', tone: 'error' };
  return changes.some((change) => change !== null) ? { text: 'Changed', tone: 'warn' } : null;
}

/** A waiting question first; else the live tickets, the editing changes or the smallest pipeline's word. */
function pillOf(flow: BoardPipelineFlowDocument, phase: PipelinePhase, context: PhaseTabContext): PhasePillView | null {
  const questionCount = nodesOfPhase(flow, phase).reduce((sum, node) => sum + PipelineFlowModel.openQuestionCountOf(node, context.openQuestionIds), 0);
  if (questionCount > 0) return { text: PipelineFlowModel.questionCountTextOf(questionCount), tone: 'warn' };
  if (context.stage === 'live') {
    const ticketCount = occupantsOfPhase(flow, phase).length;
    return ticketCount === 0 ? null : { text: countText(ticketCount, 'ticket'), tone: 'neutral' };
  }
  if (context.stage !== 'editing') return null;
  if (context.minimal) return minimalPillOf(flow, phase);
  const changeCount = changeCountOf(flow, phase);
  return changeCount === 0 ? null : { text: countText(changeCount, 'change'), tone: 'warn' };
}

function tabViewsOf(flow: BoardPipelineFlowDocument, context: PhaseTabContext): PhaseTabView[] {
  return (context.phases ?? PIPELINE_PHASES).map((phase) => ({
    phase,
    name:       PHASE_NAMES[phase],
    subText:    subTextOf(flow, phase, context.stage),
    pill:       pillOf(flow, phase, context),
    runsNoStep: runningStepCountOf(flow, phase) === 0,
  }));
}

function nextPhaseOf(phase: PipelinePhase, phases: readonly PipelinePhase[]): PipelinePhase | null {
  return phases[phases.indexOf(phase) + 1] ?? null;
}

function buildHeaderOf(flow: BoardPipelineFlowDocument): Pick<PhaseHeaderView, 'purpose' | 'endText'> {
  if (gateCountOf(flow, 'build') > 0) return { purpose: 'A builder makes the change in a worktree of its own.', endText: 'all build gates are green' };
  return { purpose: 'A builder makes the change. No gate checks it before it moves on.', endText: 'the builder commits' };
}

function reviewPurposeOf(flow: BoardPipelineFlowDocument): string {
  const steps = stepNodesOf(flow, 'review').filter((node) => node.mark !== 'removed');
  if (steps.some((node) => node.nodeKind === 'review')) return 'A clean agent reviews the change and fixes what it finds.';
  return 'You review the change before it joins the merge train.';
}

/** The open phase's header; a phase with no step that runs is skipped, and the Merge phase ends on main. */
function headerOf(flow: BoardPipelineFlowDocument, phase: PipelinePhase, phases: readonly PipelinePhase[] = PIPELINE_PHASES): PhaseHeaderView {
  const number = phases.indexOf(phase) + 1;
  const shared = { numberText: `Phase ${number} of ${phases.length}`, name: PHASE_NAMES[phase], nextPhase: nextPhaseOf(phase, phases) };
  if (phase === 'merge') {
    return {
      ...shared, purpose: 'The merge train. The Airlock lets one ticket onto main at a time.', endLead: 'Ends', endText: 'on main, by fast-forward',
    };
  }
  if (phase === 'review' && runningStepCountOf(flow, 'review') === 0) {
    return {
      ...shared, purpose: 'No review. A built ticket goes straight to the merge train.', endLead: 'Skipped:', endText: 'no step in this phase',
    };
  }
  if (phase === 'ticket') {
    return {
      ...shared, purpose: 'A request becomes a ticket with a numbered Acceptance and a Brief.', endLead: 'Leaves when', endText: 'it is ready to build',
    };
  }
  if (phase === 'build') return { ...shared, ...buildHeaderOf(flow), endLead: 'Leaves when' };
  return {
    ...shared, purpose: reviewPurposeOf(flow), endLead: 'Leaves when', endText: 'it is ready for the merge train',
  };
}

/** "Next: Review". */
function nextLabelOf(phase: PipelinePhase): string {
  return `Next: ${PHASE_NAMES[phase]}`;
}

function phaseNameOf(phase: PipelinePhase): string {
  return PHASE_NAMES[phase];
}

/** "Phase 2: Build", the open phase's accessible name; "Phase 1: Build" among an entity's three. */
function phaseLabelOf(phase: PipelinePhase, phases: readonly PipelinePhase[] = PIPELINE_PHASES): string {
  return `Phase ${phases.indexOf(phase) + 1}: ${PHASE_NAMES[phase]}`;
}

/** A live step's state word: an agent's or a merge's tickets are worked on, gates run, and User's step waits. */
function liveStateTextOf(kind: StepKind, ticketCount: number): string | null {
  if (ticketCount === 0) return null;
  if (kind === 'gates') return 'Running';
  if (kind === 'you') return 'Waiting';
  return ticketCount === 1 ? 'Working' : `${ticketCount} working`;
}

/** The Merge phase's nodes past the queue, whose tickets the Airlock is letting onto main: its steps, its frame and the fast-forward of main. */
function trainNodeIdsOf(flow: Pick<BoardPipelineFlowDocument, 'nodes'>): string[] {
  return nodesOfPhase(flow, 'merge').filter((node) => node.nodeKind !== 'ready-for-airlock').map((node) => node.nodeId);
}

/** The queue for the train, which the Merge header draws. */
function queueNodeIdsOf(flow: Pick<BoardPipelineFlowDocument, 'nodes'>): string[] {
  return flow.nodes.filter((node) => node.nodeKind === 'ready-for-airlock').map((node) => node.nodeId);
}

export const PipelinePhaseModel = Object.freeze({
  DONE_ON_MAIN_TEXT,
  TICKET_READINESS,
  gatePhaseOf,
  headerOf,
  liveStateTextOf,
  nextLabelOf,
  phaseLabelOf,
  phaseNameOf,
  phaseOfGatePhase,
  phaseOfNode,
  queueNodeIdsOf,
  stepItemsOf,
  tabViewsOf,
  trainNodeIdsOf,
});
