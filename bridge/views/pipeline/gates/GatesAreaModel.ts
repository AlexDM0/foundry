/**
 * The gates area's model, pure: the Build, Review and Merge tabs with their counts and meanings, each row's words, its band and its
 * profile chip, what a double-click on a row opens, and the draft edits a reorder or a Delete sends. A prepare row stands before the gates
 * of its tab and reorders only among the prepare rows; a removed row stays drawn until Apply, struck, and moves nowhere.
 */
import type { GatePhase }                                               from '../../../../src/lib/tracker-model/@types/GatePhase.ts';
import type { GateProfileRunFacts, PipelineFlowFacts, PipelineGateRow } from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { DisplayState }                                            from '../../../../src/lib/tracker-model/@types/Task.ts';
import type { TabItem }                                                 from '../../../design-system/Tabs.tsx';
import type { TagTone }                                                 from '../../../design-system/Tag.tsx';
import { ReorderIndexUtil }                                             from '../../../design-system/utils/ReorderIndexUtil.ts';
import type { FlowChange, FlowDraftEdit }                               from '../flow/PipelineFlowModel.ts';

/** What the gates area asks its holder to open: the Gate dialog of a gate in a phase or of a prepare step, or an empty one to add either. */
export type GatesOpenRequest =
  | { readonly kind: 'gate'; readonly gateName: string; readonly phase: GatePhase }
  | { readonly kind: 'prepare-step'; readonly name: string }
  | { readonly kind: 'new-gate'; readonly phase: GatePhase }
  | { readonly kind: 'new-prepare-step' };

export interface ProfileChipView {
  readonly text:      string;
  readonly tone:      TagTone;
  readonly state:     DisplayState | null;
  readonly busy:      boolean;
  /** A press starts a profile of the gate in the tab's phase; a measuring or removed gate's chip takes no press. */
  readonly pressable: boolean;
  readonly title:     string;
}

export interface GateRowView {
  readonly key:          string;
  readonly rowKind:      PipelineGateRow['rowKind'];
  readonly name:         string;
  /** "P" for a prepare step, then the gates' run positions from 1. */
  readonly positionText: string;
  readonly kindText:     string | null;
  readonly command:      string;
  readonly alsoInText:   string;
  readonly networkText:  string;
  readonly change:       FlowChange | null;
  readonly proposed:     boolean;
  readonly removed:      boolean;
  /** The run of rows this row reorders among. */
  readonly band:         string;
  readonly grabLabel:    string;
  readonly openLabel:    string | null;
  readonly profileChip:  ProfileChipView | null;
}

const GATE_PHASES: readonly GatePhase[] = Object.freeze(['build', 'review', 'merge']);

const PHASE_NAMES: Readonly<Record<GatePhase, string>> = Object.freeze({ build: 'Build', review: 'Review', merge: 'Merge' });

const PHASE_MEANINGS: Readonly<Record<GatePhase, string>> = Object.freeze({
  build:  'what the builder must pass before review',
  review: 'what the reviewer must keep green, findings fixed',
  merge:  'run on the latest main merged in, before the fast-forward',
});

const NO_GATES_TEXT = 'No gates: no command judges a ticket before it lands.';

const PREPARE_POSITION_TEXT = 'P';

const SECONDS_PER_MINUTE = 60;

const MILLISECONDS_PER_SECOND = 1000;

const PROFILED_STATE: DisplayState = 'delivered';

const DELETE_KEYS: readonly string[] = Object.freeze(['Delete', 'Backspace']);

function rowIsRemoved(row: PipelineGateRow): boolean {
  return row.mark === 'removed';
}

/** A removed row is a band of its own, so it stays where it is drawn. */
function bandOf(row: PipelineGateRow): string {
  return rowIsRemoved(row) ? `removed:${row.rowKind}:${row.name}` : row.rowKind;
}

/** The phase's gates that run, so a removed gate counts no more. */
function gateCountOf(rows: readonly PipelineGateRow[]): number {
  return rows.filter((row) => row.rowKind === 'gate' && !rowIsRemoved(row)).length;
}

function countText(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function tabItemsOf(gateRows: PipelineFlowFacts['gateRows']): TabItem<GatePhase>[] {
  return GATE_PHASES.map((phase) => {
    const count = gateCountOf(gateRows[phase]);
    return {
      key:            phase,
      label:          PHASE_NAMES[phase],
      count:          { count, tone: 'neutral' },
      accessibleName: `${PHASE_NAMES[phase]}, ${countText(count, 'gate')}`,
    };
  });
}

function meaningOf(phase: GatePhase): string {
  return PHASE_MEANINGS[phase];
}

function tabPanelNameOf(phase: GatePhase): string {
  return `${PHASE_NAMES[phase]} gates`;
}

function addGateLabelOf(phase: GatePhase): string {
  return `Add ${phase} gate`;
}

/** The smallest pipeline's sentence while no phase has a gate; a tab of its own with none names its phase. */
function emptyTextOf(gateRows: PipelineFlowFacts['gateRows'], phase: GatePhase): string {
  const anyPhaseHasGates = GATE_PHASES.some((each) => gateRows[each].length > 0);
  return anyPhaseHasGates ? `No ${phase} gates.` : NO_GATES_TEXT;
}

/** "41 s" under a minute, "3 m 40 s" from one. */
function profileTimeTextOf(elapsedMilliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMilliseconds / MILLISECONDS_PER_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return minutes === 0 ? `${seconds} s` : `${minutes} m ${seconds} s`;
}

function profileRunOf(profileRuns: readonly GateProfileRunFacts[], gateName: string, phase: GatePhase): GateProfileRunFacts | null {
  return profileRuns.find((run) => run.gateName === gateName && run.phase === phase) ?? null;
}

function profileChipOf(row: PipelineGateRow, phase: GatePhase, profileRuns: readonly GateProfileRunFacts[]): ProfileChipView | null {
  if (row.rowKind === 'prepare') return null;
  const run = profileRunOf(profileRuns, row.name, phase);
  const pressable = !rowIsRemoved(row);
  const title = run === null ? `Profile ${row.name} in the ${phase} phase` : `Profile ${row.name} again in the ${phase} phase`;
  const chip = (text: string, tone: TagTone, state: DisplayState | null = null): ProfileChipView => ({
    text, tone, state, busy: false, pressable, title,
  });
  if (run === null) return chip('not profiled', 'neutral');
  const timeText = run.elapsedMilliseconds === null ? null : profileTimeTextOf(run.elapsedMilliseconds);
  switch (run.state) {
    case 'queued':
    case 'running':
      return { ...chip('measuring', 'neutral'), busy: true, pressable: false };
    case 'passed':
      return chip(timeText ?? 'passed', 'state', PROFILED_STATE);
    case 'red':
      return chip(timeText === null ? 'red' : `red · ${timeText}`, 'error');
    case 'timed-out':
      return chip('timed out', 'warn');
    case 'cannot-run':
      return chip('cannot run', 'warn');
    case 'stopped':
      return chip('stopped', 'neutral');
  }
}

function kindTextOf(row: PipelineGateRow): string | null {
  if (row.rowKind === 'prepare') return 'prepare';
  return row.fix === null ? null : 'has a fix';
}

function networkTextOf(row: PipelineGateRow): string {
  return row.network.length === 0 ? 'off' : `on · ${row.network.join(', ')}`;
}

function changeOf(row: PipelineGateRow): FlowChange | null {
  return row.mark === 'changed' || row.mark === 'new' || row.mark === 'removed' ? row.mark : null;
}

/** The row's place in its band, counted from 1, and the band's size. */
function bandPlaceOf(bands: readonly string[], index: number): { readonly place: number; readonly size: number } {
  const band = bands[index];
  const firstIndex = bands.indexOf(band ?? '');
  return { place: index - firstIndex + 1, size: bands.filter((each) => each === band).length };
}

function rowViewsOf(rows: readonly PipelineGateRow[], phase: GatePhase, profileRuns: readonly GateProfileRunFacts[]): GateRowView[] {
  const bands = rows.map(bandOf);
  let gatePosition = 0;
  return rows.map((row, index) => {
    if (row.rowKind === 'gate') gatePosition += 1;
    const { place, size } = bandPlaceOf(bands, index);
    const removed = rowIsRemoved(row);
    return {
      key:          `${row.rowKind}:${row.name}`,
      rowKind:      row.rowKind,
      name:         row.name,
      positionText: row.rowKind === 'prepare' ? PREPARE_POSITION_TEXT : String(gatePosition),
      kindText:     kindTextOf(row),
      command:      row.run,
      alsoInText:   row.alsoInPhases.join(', '),
      networkText:  networkTextOf(row),
      change:       changeOf(row),
      proposed:     row.mark === 'proposed',
      removed,
      band:         bands[index] ?? row.rowKind,
      grabLabel:    `Move ${row.name}, position ${place} of ${size}`,
      openLabel:    removed ? null : `Open the ${row.name} ${row.rowKind === 'prepare' ? 'prepare step' : 'gate'}`,
      profileChip:  profileChipOf(row, phase, profileRuns),
    };
  });
}

/** What the live region says when the row at `fromIndex` stands at `toIndex`, counted inside its band; back in place on a cancel. */
function announcementOf(rows: readonly PipelineGateRow[], fromIndex: number, toIndex: number): string {
  const row = rows[fromIndex];
  if (row === undefined) return '';
  const bands = rows.map(bandOf);
  const { place, size } = bandPlaceOf(bands, toIndex);
  if (fromIndex === toIndex) return `${row.name}, back at position ${place} of ${size}`;
  return `${row.name}, now position ${place} of ${size}`;
}

function keptNamesOf(rows: readonly PipelineGateRow[], rowKind: PipelineGateRow['rowKind']): string[] {
  return rows.filter((row) => row.rowKind === rowKind && !rowIsRemoved(row)).map((row) => row.name);
}

/** A moved prepare row sends the prepare steps' order; a moved gate the phase's run order. A move that changes nothing sends nothing. */
function reorderEditsOf(rows: readonly PipelineGateRow[], phase: GatePhase, fromIndex: number, toIndex: number): FlowDraftEdit[] {
  const moved = rows[fromIndex];
  if (moved === undefined || fromIndex === toIndex || rowIsRemoved(moved)) return [];
  const reordered = ReorderIndexUtil.reorderedIndicesOf(rows.length, fromIndex, toIndex).flatMap((index) => {
    const row = rows[index];
    return row === undefined ? [] : [row];
  });
  const names = keptNamesOf(reordered, moved.rowKind);
  if (moved.rowKind === 'prepare') return [{ field: 'prepare-order', value: names }];
  return [{ field: `phase-order:${phase}`, value: names }];
}

/** Delete takes a gate out of this phase alone, and removes a prepare step; a removed row sends nothing. */
function deleteEditsOf(rows: readonly PipelineGateRow[], phase: GatePhase, index: number): FlowDraftEdit[] {
  const row = rows[index];
  if (row === undefined || rowIsRemoved(row)) return [];
  if (row.rowKind === 'prepare') return [{ field: `prepare:${row.name}`, value: null }];
  return [{ field: `phase-order:${phase}`, value: keptNamesOf(rows, 'gate').filter((name) => name !== row.name) }];
}

function keyDeletesRow(key: string): boolean {
  return DELETE_KEYS.includes(key);
}

/** A gate row opens the Gate dialog in the tab's phase, a prepare row its prepare variant; a removed row opens nothing. */
function openRequestOf(row: PipelineGateRow, phase: GatePhase): GatesOpenRequest | null {
  if (rowIsRemoved(row)) return null;
  return row.rowKind === 'prepare' ? { kind: 'prepare-step', name: row.name } : { kind: 'gate', gateName: row.name, phase };
}

/** `setupId` is the open record's, null on a live board: a profile of the applied gate. */
function profileStartCommandOf(setupId: string | null, gateName: string, phase: GatePhase) {
  return {
    kind: 'gate-profile-start', setupId, gateName, phase
  };
}

export const GatesAreaModel = Object.freeze({
  GATE_PHASES,
  addGateLabelOf,
  announcementOf,
  deleteEditsOf,
  emptyTextOf,
  keyDeletesRow,
  meaningOf,
  openRequestOf,
  profileStartCommandOf,
  profileTimeTextOf,
  reorderEditsOf,
  rowViewsOf,
  tabItemsOf,
  tabPanelNameOf,
});
