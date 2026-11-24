/**
 * The change list's model, pure: each row of the facts' change list worded from its field and its kind, with the sentence of the edit
 * that made it and who made it, and the Undo command, which sends that edit's id. A row that no edit made has no Undo. While an applied
 * pipeline is edited, a row also reads the applied and the draft values: a gate is placed by the phases whose rows hold it, with its run
 * line before and after; Human code review says what it switched and what a reviewed ticket then does; and a new gate offers a benchmark
 * in the phase it runs in last, which starts only on User's press.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardGateProfileRunDocument,
  BoardPipelineChangeDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineFlowDocument,
  BoardSetupEditDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  BOARD_GATE_PHASES,
  BOARD_PIPELINE_AGENT_ROLES,
  type BoardChangeKind,
  type BoardEditAuthor,
  type BoardGatePhase,
  type BoardPipelineAgentRole
} from '../../../../@types/board/BoardVocabulary.ts';
import { GatesAreaModel } from '../gates/GatesAreaModel.ts';

export interface ChangeRowView {
  readonly field:      string;
  readonly change:     BoardChangeKind;
  readonly title:      string;
  /** What the field is and how it changed, so the row never reads by its colour alone. */
  readonly location:   string;
  /** The edit's own sentence with its author; null when no edit made the change. */
  readonly note:       string | null;
  readonly undoEditId: string | null;
  /** The applied value, struck in the card; null outside editing or when the change has no value of its own. */
  readonly before:     string | null;
  readonly after:      string | null;
  readonly benchmark:  BenchmarkView | null;
}

/** The benchmark a new gate offers while an applied pipeline is edited: one profile of the gate in one phase. */
export interface BenchmarkView {
  readonly gateName:   string;
  readonly phase:      BoardGatePhase;
  readonly label:      string;
  readonly statusText: string;
  /** A benchmark under way takes no second press. */
  readonly measuring:  boolean;
}

/** What a row reads beside the change list while an applied pipeline is edited. */
export interface ChangeListEditing {
  readonly flow:        BoardPipelineFlowDocument;
  readonly base:        BoardPipelineDefinitionDocument | null;
  readonly draft:       BoardPipelineDefinitionDocument | null;
  readonly profileRuns: readonly BoardGateProfileRunDocument[];
}

/** What a field names: its title and the kind of thing it is. */
export interface FieldWords {
  readonly title: string;
  readonly place: string;
}

const ROLE_TITLES: Readonly<Record<BoardPipelineAgentRole, string>> = Object.freeze({
  productOwner:       'Ticket creation',
  specAgent:          'Spec',
  planAgent:          'Plan',
  builder:            'Builder',
  reviewer:           'Review',
  reReviewer:         'Re-review',
  conflictReReviewer: 'Re-review after a conflict',
  pipelineAgent:      'Pipeline agent',
  assistant:          'Assistant',
});

const PHASE_TITLES: Readonly<Record<BoardGatePhase, string>> = Object.freeze({ build: 'Build gates', review: 'Review gates', merge: 'Merge gates' });

const CHANGE_WORDS: Readonly<Record<BoardChangeKind, string>> = Object.freeze({ changed: 'changed', new: 'new', removed: 'removed' });

const AUTHOR_WORDS: Readonly<Record<BoardEditAuthor, string>> = Object.freeze({ agent: 'Pipeline agent', user: 'User' });

const GATE_PREFIX = 'gate:';

const HUMAN_CODE_REVIEW_ON_TEXT = 'A reviewed ticket merges main in, passes the review gates again, then waits for User\'s Merge.';

const HUMAN_CODE_REVIEW_OFF_TEXT = 'A reviewed ticket goes to the merge train with no Merge from User.';

const NOT_BENCHMARKED_TEXT = 'Not benchmarked yet';

const PREPARE_PREFIX = 'prepare:';

function fieldWordsOf(field: string): FieldWords {
  if (field.startsWith(GATE_PREFIX)) return { title: field.slice(GATE_PREFIX.length), place: 'gate' };
  if (field.startsWith(PREPARE_PREFIX)) return { title: field.slice(PREPARE_PREFIX.length), place: 'prepare step' };
  const orderedPhase = BOARD_GATE_PHASES.find((phase) => field === `phase-order:${phase}`);
  if (orderedPhase !== undefined) return { title: PHASE_TITLES[orderedPhase], place: 'order' };
  const role = BOARD_PIPELINE_AGENT_ROLES.find((candidate) => field === `role:${candidate}`);
  if (role !== undefined) return { title: ROLE_TITLES[role], place: 'agent step' };
  switch (field) {
    case 'prepare-order':
      return { title: 'Prepare steps', place: 'order' };
    case 'review':
      return { title: 'Review', place: 'step' };
    case 'airlock':
      return { title: 'Merge train', place: 're-review' };
    case 'approval:tickets':
      return { title: 'Human ticket review', place: 'switch' };
    case 'approval:merge':
      return { title: 'Human code review', place: 'switch' };
    case 'approval:spec':
      return { title: 'Human spec review', place: 'switch' };
    case 'approval:plan':
      return { title: 'Human plan review', place: 'switch' };
    case 'ticket-writing':
      return { title: 'How a ticket is written', place: 'Ticket phase' };
    default:
      return { title: 'Constitution', place: 'CONSTITUTION.md' };
  }
}

/** An edit with no sentence, such as one User made on the flow, has no note: its author alone says nothing. */
function noteOf(edit: BoardSetupEditDocument | undefined): string | null {
  if (edit === undefined || edit.summary.trim() === '') return null;
  return `${AUTHOR_WORDS[edit.by]}: ${edit.summary}`;
}

/** "build, review and merge" */
function phaseListOf(phases: readonly BoardGatePhase[]): string {
  if (phases.length <= 1) return phases.join('');
  return `${phases.slice(0, -1).join(', ')} and ${phases.at(-1) ?? ''}`;
}

/** The phases whose rows hold the gate; a removed row still holds it until Apply. */
function phasesHoldingGateOf(name: string, flow: BoardPipelineFlowDocument | null): BoardGatePhase[] {
  if (flow === null) return [];
  return BOARD_GATE_PHASES.filter((phase) => flow.gateRows[phase].some((row) => row.rowKind === 'gate' && row.name === name));
}

/** A gate by the phases whose rows hold it: "build, review and merge gate"; plain "gate" when no row holds it. */
function gateLocationOf(name: string, flow: BoardPipelineFlowDocument | null): string {
  const phases = phasesHoldingGateOf(name, flow);
  return phases.length === 0 ? 'gate' : `${phaseListOf(phases)} gate`;
}

/** An absent `tickets` approval is on; an absent `merge` approval is off. */
function approvalIsOn(pipeline: BoardPipelineDefinitionDocument | null, field: 'approval:tickets' | 'approval:merge'): boolean {
  return field === 'approval:tickets' ? pipeline?.approvals?.tickets !== false : pipeline?.approvals?.merge === true;
}

function switchWordOf(on: boolean): string {
  return on ? 'on' : 'off';
}

function gateRunOf(pipeline: BoardPipelineDefinitionDocument | null, name: string): string | null {
  return pipeline?.gates.find((gate) => gate.name === name)?.run ?? null;
}

/** The run line before and after: only the side that exists for a new or a removed gate, and nothing when a change kept the line. */
function gateValuesOf(change: BoardPipelineChangeDocument, name: string, editing: ChangeListEditing): Pick<ChangeRowView, 'before' | 'after'> {
  const before = change.changeKind === 'new' ? null : gateRunOf(editing.base, name);
  const after = change.changeKind === 'removed' ? null : gateRunOf(editing.draft, name);
  if (before !== null && before === after) return { before: null, after: null };
  return { before, after };
}

/** The phase a new gate is benchmarked in: the last phase that runs it, so the merge phase when it is a merge gate. */
function benchmarkPhaseOf(name: string, flow: BoardPipelineFlowDocument): BoardGatePhase | null {
  const phases = BOARD_GATE_PHASES.filter((phase) => flow.gateRows[phase].some((row) => row.rowKind === 'gate' && row.name === name && row.mark !== 'removed'));
  return phases.at(-1) ?? null;
}

function benchmarkStatusTextOf(run: BoardGateProfileRunDocument | null, phase: BoardGatePhase): string {
  if (run === null) return NOT_BENCHMARKED_TEXT;
  const timeText = run.elapsedMilliseconds === null ? null : GatesAreaModel.profileTimeTextOf(run.elapsedMilliseconds);
  switch (run.state) {
    case 'queued':
    case 'running':
      return `Benchmarking in the ${phase} phase…`;
    case 'passed':
      return timeText === null ? `Green in the ${phase} phase` : `Takes ${timeText} in the ${phase} phase`;
    case 'red':
      return timeText === null ? `Red in the ${phase} phase` : `Red in the ${phase} phase after ${timeText}`;
    case 'timed-out':
      return `Timed out in the ${phase} phase`;
    case 'cannot-run':
      return `Cannot run in the ${phase} phase`;
    case 'stopped':
      return 'The benchmark was stopped';
  }
}

function benchmarkOf(change: BoardPipelineChangeDocument, name: string, editing: ChangeListEditing): BenchmarkView | null {
  if (change.changeKind !== 'new') return null;
  const phase = benchmarkPhaseOf(name, editing.flow);
  if (phase === null) return null;
  const run = editing.profileRuns.find((candidate) => candidate.gateName === name && candidate.phase === phase) ?? null;
  return {
    gateName:   name,
    phase,
    label:      `Benchmark in the ${phase} phase`,
    statusText: benchmarkStatusTextOf(run, phase),
    measuring:  run?.state === 'queued' || run?.state === 'running',
  };
}

function plainRowOf(change: BoardPipelineChangeDocument, edits: readonly BoardSetupEditDocument[]): ChangeRowView {
  const words = fieldWordsOf(change.field);
  const edit = change.editId === null ? undefined : edits.find((candidate) => candidate.editId === change.editId);
  return {
    field:      change.field,
    change:     change.changeKind,
    title:      words.title,
    location:   `${words.place} · ${CHANGE_WORDS[change.changeKind]}`,
    note:       noteOf(edit),
    undoEditId: change.editId,
    before:     null,
    after:      null,
    benchmark:  null,
  };
}

/** A row with what the applied and the draft values say: a gate's place and run lines, a switch's move, a new gate's benchmark. */
function editingRowOf(row: ChangeRowView, change: BoardPipelineChangeDocument, editing: ChangeListEditing): ChangeRowView {
  const kindWord = CHANGE_WORDS[change.changeKind];
  if (change.field.startsWith(GATE_PREFIX)) {
    const benchmark = benchmarkOf(change, row.title, editing);
    return {
      ...row,
      ...gateValuesOf(change, row.title, editing),
      location: `${gateLocationOf(row.title, editing.flow)} · ${kindWord}`,
      ...(benchmark === null ? {} : { note: benchmark.statusText, benchmark }),
    };
  }
  if (change.field === 'approval:tickets' || change.field === 'approval:merge') {
    const isOn = approvalIsOn(editing.draft, change.field);
    const location = `switch · ${switchWordOf(approvalIsOn(editing.base, change.field))} → ${switchWordOf(isOn)}`;
    if (change.field === 'approval:tickets') return { ...row, location };
    return { ...row, location, note: isOn ? HUMAN_CODE_REVIEW_ON_TEXT : HUMAN_CODE_REVIEW_OFF_TEXT };
  }
  return row;
}

function changeRowsOf(changeList: readonly BoardPipelineChangeDocument[], edits: readonly BoardSetupEditDocument[], editing: ChangeListEditing | null = null): ChangeRowView[] {
  return changeList.map((change) => {
    const row = plainRowOf(change, edits);
    return editing === null ? row : editingRowOf(row, change, editing);
  });
}

function benchmarkCommandOf(setupId: string, benchmark: BenchmarkView): BoardCommandDocument {
  return GatesAreaModel.profileStartCommandOf(setupId, benchmark.gateName, benchmark.phase);
}

function undoCommandOf(setupId: string, editId: string): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-draft-undo', setupId, editId, wholeBatch: false
  };
}

export const ChangeListModel = Object.freeze({
  fieldWordsOf,
  gateLocationOf,
  changeRowsOf,
  undoCommandOf,
  benchmarkCommandOf,
});
