/**
 * The gate dialog's model, pure: the form a gate or prepare step starts from, whether it can be saved, the edits a Save or Remove sends,
 * the kicker, and the profile box's state and log lines from the newest profile run of the gate in the dialog's phase.
 */
import type {
  BoardDraftEditDocument,
  BoardGateProfileRunDocument,
  BoardPipelineDefinitionDocument,
  BoardPipelineGateDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  BOARD_GATE_PHASES,
  type BoardGatePhase,
  type BoardGateRowKind,
  type BoardPipelineNodeMark
} from '../../../../@types/board/BoardVocabulary.ts';
import type { LogTailLine }       from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { ProfileOutputLine } from '../../../api/ProfileStreamClient.ts';
import { GateCacheMarkModel }     from '../gates/GateCacheMarkModel.ts';

/** Which gate the dialog shows: a stored one, or a new one, of either kind; `phase` is the tab or + it was opened from. */
export interface GateDialogSubject {
  readonly rowKind: BoardGateRowKind;
  /** Null for a new gate or prepare step. */
  readonly name:    string | null;
  readonly phase:   BoardGatePhase;
}

export interface GateForm {
  readonly name:        string;
  readonly run:         string;
  readonly fix:         string;
  readonly runsIn:      string;
  readonly phases:      Readonly<Record<BoardGatePhase, boolean>>;
  readonly networkIsOn: boolean;
  /** The domains, one per line or separated by commas or spaces. */
  readonly networkText: string;
}

export type ProfileResultTone = 'passed' | 'timed-out' | 'stopped' | 'red';

export type ProfileBoxView =
  | { readonly state: 'none'; readonly startLabel: string }
  | { readonly state: 'profiling'; readonly profileRunId: string }
  | {
    readonly state:        'result';
    readonly profileRunId: string;
    readonly startLabel:   string;
    readonly tone:         ProfileResultTone;
    readonly text:         string;
    /** A red run shows the last lines of its output. */
    readonly showsOutput:  boolean;
  };

const PHASE_WORDS: Readonly<Record<BoardGatePhase, string>> = Object.freeze({ build: 'Build', review: 'Review', merge: 'Merge' });

const MARK_WORDS: Readonly<Record<Exclude<BoardPipelineNodeMark, 'unchanged'>, string>> = Object.freeze({
  proposed: 'proposed', changed: 'changed', new: 'new', removed: 'removed',
});

const MILLISECONDS_PER_SECOND = 1000;

const NETWORK_HINTS = Object.freeze({ on: 'On · only the domains below', off: 'Off · no network' });

const PROFILING_TEXT = 'Profiling · preparing a fresh worktree, then running the command';

function storedGateOf(draft: BoardPipelineDefinitionDocument | null, name: string | null): BoardPipelineGateDocument | null {
  return name === null ? null : draft?.gates.find((gate) => gate.name === name) ?? null;
}

function formOf(subject: GateDialogSubject, draft: BoardPipelineDefinitionDocument | null): GateForm {
  const phases = Object.fromEntries(BOARD_GATE_PHASES.map((phase) => [phase, false])) as Record<BoardGatePhase, boolean>;
  if (subject.rowKind === 'prepare') {
    const step = subject.name === null ? null : draft?.prepare.find((candidate) => candidate.name === subject.name) ?? null;
    return {
      name: subject.name ?? '', run: step?.run ?? '', fix: '', runsIn: '', phases, networkIsOn: false, networkText: '',
    };
  }
  const gate = storedGateOf(draft, subject.name);
  BOARD_GATE_PHASES.forEach((phase) => {
    phases[phase] = gate === null ? phase === subject.phase : draft?.phases[phase].includes(gate.name) === true;
  });
  return {
    name:        subject.name ?? '',
    run:         gate?.run ?? '',
    fix:         gate?.fix ?? '',
    runsIn:      gate?.runsIn ?? '',
    phases,
    networkIsOn: (gate?.network ?? []).length > 0,
    networkText: (gate?.network ?? []).join(', '),
  };
}

function domainsOf(networkText: string): string[] {
  return networkText.split(/[\s,]+/u).filter((domain) => domain !== '');
}

/** A name and a command; a gate also runs in at least one phase. */
function canSave(subject: GateDialogSubject, form: GateForm): boolean {
  if (form.name.trim() === '' || form.run.trim() === '') return false;
  return subject.rowKind === 'prepare' || BOARD_GATE_PHASES.some((phase) => form.phases[phase]);
}

/** The stored gate with the form's fields over it, so what the dialog does not show, such as `writes`, is kept. */
function gateOf(form: GateForm, stored: BoardPipelineGateDocument | null): BoardPipelineGateDocument {
  const fix = form.fix.trim();
  const runsIn = form.runsIn.trim();
  return {
    name:    form.name.trim(),
    run:     form.run.trim(),
    fix:     fix === '' ? null : fix,
    runsIn:  runsIn === '' ? null : runsIn,
    network: form.networkIsOn ? domainsOf(form.networkText) : [],
    writes:  stored?.writes ?? [],
  };
}

function phaseOrderEditsOf(name: string, form: GateForm, draft: BoardPipelineDefinitionDocument | null): BoardDraftEditDocument[] {
  return BOARD_GATE_PHASES.flatMap((phase): BoardDraftEditDocument[] => {
    const order = draft?.phases[phase] ?? [];
    const runsThere = order.includes(name);
    if (form.phases[phase] === runsThere) return [];
    return [{ target: 'phase-order', phase, names: form.phases[phase] ? [...order, name] : order.filter((gateName) => gateName !== name) }];
  });
}

function saveEditsOf(subject: GateDialogSubject, form: GateForm, draft: BoardPipelineDefinitionDocument | null): BoardDraftEditDocument[] {
  const name = form.name.trim();
  if (subject.rowKind === 'prepare') {
    const stepEdit: BoardDraftEditDocument = { target: 'prepare', name, value: { name, run: form.run.trim(), runsIn: null } };
    if (subject.name !== null) return [stepEdit];
    return [stepEdit, { target: 'prepare-order', names: [...(draft?.prepare ?? []).map((step) => step.name), name] }];
  }
  return [{ target: 'gate', name, value: gateOf(form, storedGateOf(draft, subject.name)) }, ...phaseOrderEditsOf(name, form, draft)];
}

/** Remove gate takes it out of every phase; Remove prepare step drops the step. */
function removeEditsOf(subject: GateDialogSubject): BoardDraftEditDocument[] {
  if (subject.name === null) return [];
  return [{ target: subject.rowKind === 'prepare' ? 'prepare' : 'gate', name: subject.name, value: null }];
}

/** "BUILD GATE 3 · PROPOSED": the phase, the gate's place among that phase's gates, and its mark; a new one says so. */
function kickerOf(subject: GateDialogSubject, draft: BoardPipelineDefinitionDocument | null, mark: BoardPipelineNodeMark): string {
  const markText = mark === 'unchanged' ? '' : ` · ${MARK_WORDS[mark]}`;
  if (subject.rowKind === 'prepare') return subject.name === null ? 'New prepare step' : `Prepare step${markText}`;
  const phaseWord = PHASE_WORDS[subject.phase];
  if (subject.name === null) return `New ${phaseWord.toLowerCase()} gate`;
  const position = (draft?.phases[subject.phase] ?? []).indexOf(subject.name) + 1;
  return position === 0 ? `${phaseWord} gate${markText}` : `${phaseWord} gate ${position}${markText}`;
}

function titleOf(subject: GateDialogSubject): string {
  if (subject.name !== null) return subject.name;
  return subject.rowKind === 'prepare' ? 'Add prepare step' : `Add ${subject.phase} gate`;
}

function secondsTextOf(elapsedMilliseconds: number | null): string {
  return `${Math.round((elapsedMilliseconds ?? 0) / MILLISECONDS_PER_SECOND)} s`;
}

function resultOf(run: BoardGateProfileRunDocument): { tone: ProfileResultTone; text: string } {
  switch (run.state) {
    case 'passed':
      return { tone: 'passed', text: GateCacheMarkModel.withCacheWordOf(`Passed in ${secondsTextOf(run.elapsedMilliseconds)}`, run.cacheReport) };
    case 'timed-out':
      return { tone: 'timed-out', text: `Last profile: timed out at ${secondsTextOf(run.elapsedMilliseconds)}` };
    case 'red':
      return { tone: 'red', text: GateCacheMarkModel.withCacheWordOf(`Red after ${secondsTextOf(run.elapsedMilliseconds)}`, run.cacheReport) };
    case 'cannot-run':
      return { tone: 'red', text: 'Cannot run: the command could not start' };
    default:
      return { tone: 'stopped', text: 'Stopped · no result' };
  }
}

/** The newest run of this gate in this phase: profiling while queued or running, else its result; with none, the box offers a first run. */
function profileBoxViewOf(gateName: string, phase: BoardGatePhase, profileRuns: readonly BoardGateProfileRunDocument[]): ProfileBoxView {
  const run = profileRuns.find((candidate) => candidate.gateName === gateName && candidate.phase === phase);
  if (run === undefined) return { state: 'none', startLabel: 'Profile' };
  if (run.state === 'queued' || run.state === 'running') return { state: 'profiling', profileRunId: run.profileRunId };
  const { tone, text } = resultOf(run);
  return {
    state: 'result', profileRunId: run.profileRunId, startLabel: 'Profile again', tone, text, showsOutput: run.state === 'red',
  };
}

function profileLeadOf(phase: BoardGatePhase): string {
  return `Runs the command once in the ${phase} phase, on main.`;
}

/** Every line of a profile's stream is the command's own output; its number, unique within the run, keys it. */
function logTailLinesOf(lines: readonly ProfileOutputLine[]): LogTailLine[] {
  return lines.map((line) => ({ key: String(line.lineNumber), text: line.text, kind: 'output' }));
}

/** The line beside the network switch, saying what the switch's state allows. */
function networkHintOf(networkIsOn: boolean): string {
  return networkIsOn ? NETWORK_HINTS.on : NETWORK_HINTS.off;
}

export const GateDialogModel = Object.freeze({
  networkHintOf,
  PHASE_WORDS,
  PROFILING_TEXT,
  canSave,
  formOf,
  kickerOf,
  logTailLinesOf,
  profileBoxViewOf,
  profileLeadOf,
  removeEditsOf,
  saveEditsOf,
  titleOf,
});
