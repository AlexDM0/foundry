/**
 * The design step's model, pure: the agent's state and the panel head's status, whether Apply may open while a question is open, the
 * Changes tab's name, and the agent's newest change with the step it shows on the flow, the words of its link, and the Undo it sends.
 * Every count comes from the facts; Apply's state reads the open question count, and Hephaestus's refusal stays the authority. In monorepo
 * mode the page is one level's: its title row, its newest agent change, and the open questions of every level, since a question in any
 * entity holds Apply as one question does in single mode.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardPipelineDefinitionDocument,
  BoardPipelineFlowDocument,
  BoardPipelineSetupDocument,
  BoardSetupEditDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BOARD_GATE_PHASES }                                 from '../../../../@types/board/BoardVocabulary.ts';
import { CountTextUtil }                                     from '../../../../shared/utils/CountTextUtil.ts';
import type { PanelStatus }                                  from '../PipelinePanel.tsx';
import type { FlowPageWords }                                from '../PipelineViewModel.ts';
import { NOT_LAUNCHED_PANEL_STATUS, type AgentSessionState } from '../agent-panel/AgentSessionModel.ts';
import { ChangeListModel }                                   from '../apply/ChangeListModel.ts';
import { PipelineLevelModel }                                from '../entities/PipelineLevelModel.ts';
import type { PipelineLevel }                                from '../entities/PipelineLevelModel.ts';
import type { FlowShowTarget }                               from '../flow/FlowSelection.ts';
import { PipelineFlowModel, type TicketWritingDefaults }     from '../flow/PipelineFlowModel.ts';
import { PipelinePhaseModel, type PipelinePhase }            from '../flow/PipelinePhaseModel.ts';

/** The draft whose route a ticket-writing change names; null before the agent proposes one. */
type TicketWritingDraft = Pick<BoardPipelineDefinitionDocument, 'ticketWriting'> | null;

export type DesignAgentState = 'designing' | 'ready' | 'not-launched' | 'not-running';

/** Apply's look: disabled with its reason while a question is open, and the footer's hint beside it. */
export interface ApplyAvailability {
  readonly enabled:        boolean;
  readonly disabledReason: string | null;
  readonly hint:           { readonly tone: 'question-open' | 'answered'; readonly text: string };
}

const PANEL_STATUSES: Readonly<Record<DesignAgentState, PanelStatus>> = {
  'designing':    { tone: 'working', text: 'Designing' },
  'ready':        { tone: 'ready', text: 'Proposal ready' },
  'not-launched': NOT_LAUNCHED_PANEL_STATUS,
  'not-running':  { tone: 'idle', text: 'Not running' },
};

const APPLY_DISABLED_REASON = 'Answer the open question first';

const GATE_PREFIX = 'gate:';

const PREPARE_PREFIX = 'prepare:';

function agentStateOf(setup: BoardPipelineSetupDocument, sessionState: AgentSessionState): DesignAgentState {
  if (sessionState === 'not-launched') return 'not-launched';
  if (sessionState === 'stopped') return 'not-running';
  return setup.record.readyToContinue.includes('design') ? 'ready' : 'designing';
}

/** The panel head's dot and word: "Proposal ready", as drawn. */
function panelStatusOf(agentState: DesignAgentState): PanelStatus {
  return PANEL_STATUSES[agentState];
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
  return `Changes, ${CountTextUtil.countedPhrase(changeCount, 'change', 'changes')}`;
}

function discardCommandOf(setupId: string): BoardCommandDocument {
  return { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-draft-discard', setupId };
}

/** The agent's newest edit that is not undone: the change its last reply names. */
function newestAgentEditOf(edits: readonly BoardSetupEditDocument[]): BoardSetupEditDocument | null {
  return edits.filter((edit) => edit.by === 'agent' && !edit.undone).at(-1) ?? null;
}

/** The gate or prepare step's row in the first phase that lists it. */
function gateRowTargetOf(flow: BoardPipelineFlowDocument, rowKind: 'gate' | 'prepare', name: string): FlowShowTarget | null {
  const phase = BOARD_GATE_PHASES.find((candidate) => flow.gateRows[candidate].some((row) => row.rowKind === rowKind && row.name === name));
  if (phase === undefined) return null;
  return { phase: PipelinePhaseModel.phaseOfGatePhase(phase), item: { kind: 'gate-row', rowKey: `${rowKind}:${name}` } };
}

/**
 * Where a field stands on the flow: a gate or prepare step's row, a phase's gates table for an order, or the card of an agent step, a
 * switch or the merge train's merge, each in the phase that holds it; how a ticket is written stands on the Ticket phase's first step.
 */
function flowTargetOf(field: string | string, flow: BoardPipelineFlowDocument): FlowShowTarget | null {
  if (field.startsWith(GATE_PREFIX)) return gateRowTargetOf(flow, 'gate', field.slice(GATE_PREFIX.length));
  if (field.startsWith(PREPARE_PREFIX)) return gateRowTargetOf(flow, 'prepare', field.slice(PREPARE_PREFIX.length));
  const orderedPhase = BOARD_GATE_PHASES.find((phase) => field === `phase-order:${phase}`) ?? (field === 'prepare-order' ? 'build' : undefined);
  if (orderedPhase !== undefined) return { phase: PipelinePhaseModel.phaseOfGatePhase(orderedPhase), item: { kind: 'gates' } };
  const node = flow.nodes.find((candidate) => {
    if (field === 'review') return candidate.nodeKind === 'review';
    if (field === 'airlock') return candidate.mergePlacement === 'airlock';
    if (field === 'ticket-writing') return candidate.nodeKind === 'spec-writing' || candidate.nodeKind === 'ticket-creation';
    if (field === 'approval:tickets') return candidate.nodeKind === 'human-ticket-review';
    if (field === 'approval:spec') return candidate.nodeKind === 'human-spec-review';
    if (field === 'approval:plan') return candidate.nodeKind === 'human-plan-review';
    if (field === 'approval:merge') return candidate.nodeKind === 'human-code-review';
    return candidate.role !== null && field === `role:${candidate.role}`;
  });
  return node === undefined ? null : { phase: PipelinePhaseModel.phaseOfNode(flow, node.nodeId), item: { kind: 'step', nodeId: node.nodeId } };
}

/** "Build · typecheck": the phase the change shows in, then what it changed, or for how a ticket is written the route it now takes. */
function showLinkTextOf(field: string, phase: PipelinePhase, ticketWriting: TicketWritingDraft, defaults: TicketWritingDefaults): string {
  const subject = field === 'ticket-writing'
    ? PipelineFlowModel.ticketWritingLabelOf(PipelineFlowModel.ticketWritingRouteOfDraft(ticketWriting, defaults)).toLowerCase()
    : ChangeListModel.fieldWordsOf(field).title;
  return `${PipelinePhaseModel.phaseNameOf(phase)} · ${subject}`;
}

/** The newest agent edit of the level shown; an entity's as the field inside it, so its step shows on the entity's flow. */
function newestAgentEditAtLevelOf(edits: readonly BoardSetupEditDocument[], level: PipelineLevel): BoardSetupEditDocument | null {
  const levelEdits = edits.filter((edit) => PipelineLevelModel.levelsAreEqual(PipelineLevelModel.levelOfField(edit.field), level));
  return newestAgentEditOf(levelEdits);
}

/**
 * Where an edit of the level stands on the level's flow, as `flowTargetOf` finds it in single mode; the forge's page draws no flow, and the
 * fields only an entity has stand on none.
 */
function flowTargetAtLevelOf(field: string, flow: BoardPipelineFlowDocument, level: PipelineLevel | null): FlowShowTarget | null {
  if (level === null) return flowTargetOf(field, flow);
  if (PipelineLevelModel.isForgeLevel(level)) return null;
  const fieldWithinEntity = PipelineLevelModel.fieldWithinEntityOf(field);
  return fieldWithinEntity === null ? null : flowTargetOf(fieldWithinEntity, flow);
}

/** Every open question, the record's and each entity's: any one of them holds Apply. */
function openQuestionCountOfEveryLevel(setup: Pick<BoardPipelineSetupDocument, 'openQuestionCount' | 'entities'>): number {
  return Object.values(setup.entities ?? {}).reduce((sum, entity) => sum + entity.openQuestionCount, setup.openQuestionCount);
}

/** "Design web's pipeline" and its three phases, or "Design the Forge level" and what every entity shares. */
function levelPageWordsOf(level: PipelineLevel): FlowPageWords {
  if (level.kind !== 'entity') {
    return { title: 'Design the Forge level', lead: 'What every entity shares: who files tickets, your approvals, the merge train and how many jobs run at once.' };
  }
  return {
    title: `Design ${level.key}’s pipeline`,
    lead:  `Every ticket of ${level.key} goes through three phases. ${level.key}’s gates, prepare steps, review and agents are set here.`,
  };
}

export const DesignStepModel = Object.freeze({
  newestAgentEditAtLevelOf,
  flowTargetAtLevelOf,
  openQuestionCountOfEveryLevel,
  levelPageWordsOf,
  agentStateOf,
  panelStatusOf,
  applyAvailabilityOf,
  changesTabNameOf,
  discardCommandOf,
  newestAgentEditOf,
  flowTargetOf,
  showLinkTextOf,
});
