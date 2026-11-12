/**
 * The design step's model, pure: the agent's state and status line, the footer's count of the proposed steps and gates, whether Apply
 * may open while a question is open, the Changes tab's name, and the agent's newest change with the step it shows on the flow and the
 * Undo it sends. Every count comes from the facts; Apply's state reads the open question count, and the Overseer's refusal stays the
 * authority.
 */
import { GATE_PHASES }                                                      from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { PipelineFlowFacts, PipelineSetupFacts, PipelineSetupSummary } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineDraftField, SetupEdit }                               from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { ControlCommandBody }                                          from '../../../api/CommandClient.ts';
import { ChatTurnWordingUtil }                                              from '../../../conversation/ChatTurnWordingUtil.ts';
import type { FlowShowTarget }                                              from '../FlowWorkspace.tsx';
import { ChangeListModel }                                                  from '../apply/ChangeListModel.ts';

export type DesignAgentState = 'designing' | 'ready' | 'not-running';

/** Apply's look: disabled with its reason while a question is open, and the footer's hint beside it. */
export interface ApplyAvailability {
  readonly enabled:        boolean;
  readonly disabledReason: string | null;
  readonly hint:           { readonly tone: 'question-open' | 'answered'; readonly text: string };
}

const SHORT_COMMIT_LENGTH = 7;

const STATE_WORDS: Readonly<Record<DesignAgentState, string>> = {
  'designing':   'designing',
  'ready':       'proposal ready',
  'not-running': 'not running',
};

const APPLY_DISABLED_REASON = 'Answer the open question first';

const GATE_PREFIX = 'gate:';

const PREPARE_PREFIX = 'prepare:';

function agentStateOf(setup: PipelineSetupFacts): DesignAgentState {
  if (setup.agentJobState === null) return 'not-running';
  return setup.record.readyToContinue.includes('design') ? 'ready' : 'designing';
}

/** "J4 · proposal ready · snapshot 1111111", as drawn. */
function statusLineOf(setup: PipelineSetupFacts): string {
  const { agentJobId, snapshotCommit } = setup.record;
  const snapshot = snapshotCommit === null ? [] : [`snapshot ${snapshotCommit.slice(0, SHORT_COMMIT_LENGTH)}`];
  return [agentJobId ?? 'Pipeline agent', STATE_WORDS[agentStateOf(setup)], ...snapshot].join(' · ');
}

/** "1 prepare step · 3 build gates · 3 review gates · 3 merge gates", from the facts' summary. */
function footerSummaryOf(summary: PipelineSetupSummary): string {
  const gates = GATE_PHASES.map((phase) => ChatTurnWordingUtil.countTextOf(summary.gateCountByPhase[phase], `${phase} gate`, `${phase} gates`));
  return [ChatTurnWordingUtil.countTextOf(summary.prepareStepCount, 'prepare step', 'prepare steps'), ...gates].join(' · ');
}

function applyAvailabilityOf(openQuestionCount: number): ApplyAvailability {
  if (openQuestionCount > 0) {
    const text = openQuestionCount === 1 ? 'Answer the open question to apply' : `Answer the ${openQuestionCount} open questions to apply`;
    return { enabled: false, disabledReason: APPLY_DISABLED_REASON, hint: { tone: 'question-open', text } };
  }
  return { enabled: true, disabledReason: null, hint: { tone: 'answered', text: 'All questions answered' } };
}

/** "Changes, 10 changes": what the tab's count means. */
function changesTabNameOf(changeCount: number): string {
  return `Changes, ${ChatTurnWordingUtil.countTextOf(changeCount, 'change', 'changes')}`;
}

function discardCommandOf(setupId: string): ControlCommandBody {
  return { kind: 'pipeline-draft-discard', setupId };
}

/** The agent's newest edit that is not undone: the change its last reply names. */
function newestAgentEditOf(edits: readonly SetupEdit[]): SetupEdit | null {
  return edits.filter((edit) => edit.by === 'agent' && !edit.undone).at(-1) ?? null;
}

/** The first Gates node whose phase lists the gate or prepare step, with that phase. */
function gatesTargetOf(flow: PipelineFlowFacts, rowKind: 'gate' | 'prepare', name: string): FlowShowTarget | null {
  const phase = GATE_PHASES.find((candidate) => flow.gateRows[candidate].some((row) => row.rowKind === rowKind && row.name === name));
  if (phase === undefined) return null;
  const node = flow.nodes.find((candidate) => candidate.nodeKind === 'gates' && candidate.phase === phase);
  return node === undefined ? null : { nodeId: node.nodeId, phase };
}

/** Where a field stands on the flow: a gate or prepare step in its phase's tab, an agent step, a switch or the merge train's merge. */
function flowTargetOf(field: PipelineDraftField, flow: PipelineFlowFacts): FlowShowTarget | null {
  if (field.startsWith(GATE_PREFIX)) return gatesTargetOf(flow, 'gate', field.slice(GATE_PREFIX.length));
  if (field.startsWith(PREPARE_PREFIX)) return gatesTargetOf(flow, 'prepare', field.slice(PREPARE_PREFIX.length));
  const orderedPhase = GATE_PHASES.find((phase) => field === `phase-order:${phase}`) ?? (field === 'prepare-order' ? 'build' : undefined);
  const node = flow.nodes.find((candidate) => {
    if (orderedPhase !== undefined) return candidate.nodeKind === 'gates' && candidate.phase === orderedPhase;
    if (field === 'review') return candidate.nodeKind === 'review';
    if (field === 'airlock') return candidate.mergePlacement === 'airlock';
    if (field === 'approval:tickets') return candidate.nodeKind === 'human-ticket-review';
    if (field === 'approval:merge') return candidate.nodeKind === 'human-code-review';
    return candidate.role !== null && field === `role:${candidate.role}`;
  });
  return node === undefined ? null : { nodeId: node.nodeId, phase: orderedPhase ?? null };
}

/** "Show typecheck on the flow". */
function showLinkTextOf(field: PipelineDraftField): string {
  return `Show ${ChangeListModel.fieldWordsOf(field).title} on the flow`;
}

export const DesignStepModel = Object.freeze({
  agentStateOf,
  statusLineOf,
  footerSummaryOf,
  applyAvailabilityOf,
  changesTabNameOf,
  discardCommandOf,
  newestAgentEditOf,
  flowTargetOf,
  showLinkTextOf,
});
