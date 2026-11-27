/**
 * The gates table's model, pure: each phase's words, each row's words, band and time chip, and the draft edits a reorder or Delete sends.
 * A prepare row reorders only among the prepare rows, a removed row stays drawn and struck until Apply and moves nowhere, and each row's
 * last run is the time the forge served, never computed here.
 */
import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardDraftEditDocument,
  BoardGateProfileRunDocument,
  BoardGateRowDocument,
  BoardStepRunTimeDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardGatePhase, BoardStepEnding } from '../../../../@types/board/BoardVocabulary.ts';
import { ReorderIndexUtil }                     from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { FlowChange }                      from '../flow/PipelineFlowModel.ts';
import { GateCacheMarkModel }                   from './GateCacheMarkModel.ts';

/** What the gates area asks its holder to open: the Gate dialog of a gate in a phase or of a prepare step, or an empty one to add either. */
export type GatesOpenRequest =
  | { readonly kind: 'gate'; readonly gateName: string; readonly phase: BoardGatePhase }
  | { readonly kind: 'prepare-step'; readonly name: string }
  | { readonly kind: 'new-gate'; readonly phase: BoardGatePhase }
  | { readonly kind: 'new-prepare-step' };

/** The time chip's tone: passed, failed (red, timed out or unable to run), or waiting for a measure. */
export type ProfileChipTone = 'pass' | 'fail' | 'waiting';

export interface ProfileChipView {
  readonly text:      string;
  readonly tone:      ProfileChipTone;
  readonly busy:      boolean;
  /** A press starts a profile of the gate in the tab's phase; a measuring or removed gate's chip takes no press. */
  readonly pressable: boolean;
  readonly title:     string;
}

export interface GateRowView {
  readonly key:          string;
  readonly rowKind:      BoardGateRowDocument['rowKind'];
  readonly name:         string;
  /** "P" for a prepare step, then the gates' run positions from 1. */
  readonly positionText: string;
  /** The quiet tag after the name: "prepare" or "has a fix". */
  readonly tagText:      string | null;
  readonly command:      string;
  readonly alsoInText:   string;
  readonly networkText:  string;
  readonly change:       FlowChange | null;
  readonly removed:      boolean;
  /** The run of rows this row reorders among. */
  readonly band:         string;
  readonly grabLabel:    string;
  readonly openLabel:    string | null;
  readonly profileChip:  ProfileChipView | null;
}

/** A line's newest recorded run as its row shows it: the forge's measure, worded, with how the line ended. */
export interface LineRunTimeView {
  readonly text:          string;
  readonly ending:        BoardStepEnding;
  /** The bound's mark on a line its time bound stopped; null on any other. */
  readonly boundMarkText: string | null;
  readonly label:         string;
}

const BOUND_MARK_TEXT = 'bound';

const ENDING_SENTENCES: Readonly<Record<BoardStepEnding, string>> = Object.freeze({
  'passed':     'passed',
  'failed':     'failed',
  'time-bound': 'stopped at its time bound',
});

const PHASE_NAMES: Readonly<Record<BoardGatePhase, string>> = Object.freeze({ build: 'Build', review: 'Review', merge: 'Merge' });

const PHASE_LINES: Readonly<Record<BoardGatePhase, string>> = Object.freeze({
  build:  'What the builder must pass before review',
  review: 'What the reviewer must keep green, findings fixed',
  merge:  'Run on the latest main merged in, before the fast-forward',
});

const EMPTY_TEXTS: Readonly<Record<BoardGatePhase, string>> = Object.freeze({
  build:  'No build gates. No command checks a ticket after its build.',
  review: 'No review gates. No command checks the reviewer\'s fixes.',
  merge:  'No merge gates. Nothing runs on the merged tree before the fast-forward.',
});

const NO_REVIEW_GATES_TEXT = 'No review gates, since no review runs.';

const PREPARE_POSITION_TEXT = 'P';

const SECONDS_PER_MINUTE = 60;

const MILLISECONDS_PER_SECOND = 1000;

/** The least time a run that took any time reads as, so a quick run never reads "0.0 s". */
const SHORTEST_SHOWN_SECONDS = 0.1;

const DELETE_KEYS: readonly string[] = Object.freeze(['Delete', 'Backspace']);

function rowIsRemoved(row: BoardGateRowDocument): boolean {
  return row.mark === 'removed';
}

/** A removed row is a band of its own, so it stays where it is drawn. */
function bandOf(row: BoardGateRowDocument): string {
  return rowIsRemoved(row) ? `removed:${row.rowKind}:${row.name}` : row.rowKind;
}

function titleOf(phase: BoardGatePhase): string {
  return `${PHASE_NAMES[phase]} gates`;
}

function lineOf(phase: BoardGatePhase): string {
  return PHASE_LINES[phase];
}

function addGateLabelOf(phase: BoardGatePhase): string {
  return `Add ${phase} gate`;
}

/** The sentence of a phase with no gate; with no review step, the review phase says why it has none. */
function emptyTextOf(phase: BoardGatePhase, reviewRuns: boolean): string {
  return phase === 'review' && !reviewRuns ? NO_REVIEW_GATES_TEXT : EMPTY_TEXTS[phase];
}

/** The gates that run, so a removed gate counts no more. */
function gateCountOf(rows: readonly BoardGateRowDocument[]): number {
  return rows.filter((row) => row.rowKind === 'gate' && !rowIsRemoved(row)).length;
}

/** "0.4 s" for a run that rounds to no whole second, "41 s" under a minute, "3 m 40 s" from one. */
function profileTimeTextOf(elapsedMilliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(elapsedMilliseconds / MILLISECONDS_PER_SECOND));
  if (totalSeconds === 0) return `${Math.max(SHORTEST_SHOWN_SECONDS, elapsedMilliseconds / MILLISECONDS_PER_SECOND).toFixed(1)} s`;
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;
  return minutes === 0 ? `${seconds} s` : `${minutes} m ${seconds} s`;
}

function profileRunOf(profileRuns: readonly BoardGateProfileRunDocument[], gateName: string, phase: BoardGatePhase): BoardGateProfileRunDocument | null {
  return profileRuns.find((run) => run.gateName === gateName && run.phase === phase) ?? null;
}

/** A gate never measured says "not measured", or "measure" once an edit changed or added it. */
function unmeasuredTextOf(row: BoardGateRowDocument): string {
  return row.mark === 'changed' || row.mark === 'new' ? 'measure' : 'not measured';
}

function profileChipOf(row: BoardGateRowDocument, phase: BoardGatePhase, profileRuns: readonly BoardGateProfileRunDocument[]): ProfileChipView | null {
  if (row.rowKind === 'prepare') return null;
  const run = profileRunOf(profileRuns, row.name, phase);
  const pressable = !rowIsRemoved(row);
  const title = run === null ? `Profile ${row.name} in the ${phase} phase` : `Profile ${row.name} again in the ${phase} phase`;
  const chip = (text: string, tone: ProfileChipTone): ProfileChipView => ({
    text, tone, busy: false, pressable, title,
  });
  if (run === null) return chip(unmeasuredTextOf(row), 'waiting');
  const timeText = run.elapsedMilliseconds === null ? null : profileTimeTextOf(run.elapsedMilliseconds);
  switch (run.state) {
    case 'queued':
    case 'running':
      return { ...chip('measuring', 'waiting'), busy: true, pressable: false };
    case 'passed':
      return chip(GateCacheMarkModel.withCacheWordOf(timeText ?? 'passed', run.cacheReport), 'pass');
    case 'red':
      return chip(GateCacheMarkModel.withCacheWordOf(timeText === null ? 'red' : `red · ${timeText}`, run.cacheReport), 'fail');
    case 'timed-out':
      return chip('timed out', 'fail');
    case 'cannot-run':
      return chip('cannot run', 'fail');
    case 'stopped':
      return chip('stopped', 'waiting');
  }
}

function tagTextOf(row: BoardGateRowDocument): string | null {
  if (row.rowKind === 'prepare') return 'prepare';
  return row.fix === null ? null : 'has a fix';
}

function networkTextOf(row: BoardGateRowDocument): string {
  return row.network.length === 0 ? 'off' : `on · ${row.network.join(', ')}`;
}

function changeOf(row: BoardGateRowDocument): FlowChange | null {
  return row.mark === 'changed' || row.mark === 'new' || row.mark === 'removed' ? row.mark : null;
}

/** The row's place in its band, counted from 1, and the band's size. */
function bandPlaceOf(bands: readonly string[], index: number): { readonly place: number; readonly size: number } {
  const band = bands[index];
  const firstIndex = bands.indexOf(band ?? '');
  return { place: index - firstIndex + 1, size: bands.filter((each) => each === band).length };
}

function rowViewsOf(rows: readonly BoardGateRowDocument[], phase: BoardGatePhase, profileRuns: readonly BoardGateProfileRunDocument[]): GateRowView[] {
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
      tagText:      tagTextOf(row),
      command:      row.run,
      alsoInText:   row.alsoInPhases.join(', '),
      networkText:  networkTextOf(row),
      change:       changeOf(row),
      removed,
      band:         bands[index] ?? row.rowKind,
      grabLabel:    `Move ${row.name}, position ${place} of ${size}`,
      openLabel:    removed ? null : `Open the ${row.name} ${row.rowKind === 'prepare' ? 'prepare step' : 'gate'}`,
      profileChip:  profileChipOf(row, phase, profileRuns),
    };
  });
}

/**
 * A prepare step runs in a job's install, served with no phase, and before a phase's gates in a gate run, served with that phase: its row
 * shows the newer of the two. A gate row shows its run in the tab's phase. Both read only the runs of the entity in view.
 */
function runTimeMatchesRow(runTime: BoardStepRunTimeDocument, row: BoardGateRowDocument, phase: BoardGatePhase, entity: string | null): boolean {
  if (runTime.entity !== entity || runTime.stepKind !== row.rowKind || runTime.stepName !== row.name) return false;
  return runTime.phase === phase || (row.rowKind === 'prepare' && runTime.phase === null);
}

/** The row's newest served run time; a line with no recorded run shows none. */
function lineRunTimeOf(row: BoardGateRowDocument, phase: BoardGatePhase, stepRunTimes: readonly BoardStepRunTimeDocument[], entity: string | null): LineRunTimeView | null {
  const newest = stepRunTimes
    .filter((runTime) => runTimeMatchesRow(runTime, row, phase, entity))
    .reduce<BoardStepRunTimeDocument | null>((newer, runTime) => (newer === null || runTime.at > newer.at ? runTime : newer), null);
  if (newest === null) return null;
  const text = profileTimeTextOf(newest.runMilliseconds);
  return {
    text,
    ending:        newest.ending,
    boundMarkText: newest.ending === 'time-bound' ? BOUND_MARK_TEXT : null,
    label:         `Last run ${text}, ${ENDING_SENTENCES[newest.ending]}`,
  };
}

/** What the live region says when the row at `fromIndex` stands at `toIndex`, counted inside its band; back in place on a cancel. */
function announcementOf(rows: readonly BoardGateRowDocument[], fromIndex: number, toIndex: number): string {
  const row = rows[fromIndex];
  if (row === undefined) return '';
  const bands = rows.map(bandOf);
  const { place, size } = bandPlaceOf(bands, toIndex);
  if (fromIndex === toIndex) return `${row.name}, back at position ${place} of ${size}`;
  return `${row.name}, now position ${place} of ${size}`;
}

function keptNamesOf(rows: readonly BoardGateRowDocument[], rowKind: BoardGateRowDocument['rowKind']): string[] {
  return rows.filter((row) => row.rowKind === rowKind && !rowIsRemoved(row)).map((row) => row.name);
}

/** A moved prepare row sends the prepare steps' order; a moved gate the phase's run order. A move that changes nothing sends nothing. */
function reorderEditsOf(rows: readonly BoardGateRowDocument[], phase: BoardGatePhase, fromIndex: number, toIndex: number): BoardDraftEditDocument[] {
  const moved = rows[fromIndex];
  if (moved === undefined || fromIndex === toIndex || rowIsRemoved(moved)) return [];
  const reordered = ReorderIndexUtil.reorderedIndicesOf(rows.length, fromIndex, toIndex).flatMap((index) => {
    const row = rows[index];
    return row === undefined ? [] : [row];
  });
  const names = keptNamesOf(reordered, moved.rowKind);
  if (moved.rowKind === 'prepare') return [{ target: 'prepare-order', names }];
  return [{ target: 'phase-order', phase, names }];
}

/** Delete takes a gate out of this phase alone, and removes a prepare step; a removed row sends nothing. */
function deleteEditsOf(rows: readonly BoardGateRowDocument[], phase: BoardGatePhase, index: number): BoardDraftEditDocument[] {
  const row = rows[index];
  if (row === undefined || rowIsRemoved(row)) return [];
  if (row.rowKind === 'prepare') return [{ target: 'prepare', name: row.name, value: null }];
  return [{ target: 'phase-order', phase, names: keptNamesOf(rows, 'gate').filter((name) => name !== row.name) }];
}

function keyDeletesRow(key: string): boolean {
  return DELETE_KEYS.includes(key);
}

/** A gate row opens the Gate dialog in the tab's phase, a prepare row its prepare variant; a removed row opens nothing. */
function openRequestOf(row: BoardGateRowDocument, phase: BoardGatePhase): GatesOpenRequest | null {
  if (rowIsRemoved(row)) return null;
  return row.rowKind === 'prepare' ? { kind: 'prepare-step', name: row.name } : { kind: 'gate', gateName: row.name, phase };
}

/** `setupId` is the open record's, null on a live board: a profile of the applied gate; `entity` names an entity's gate in monorepo mode. */
function profileStartCommandOf(setupId: string | null, gateName: string, phase: BoardGatePhase, entity: string | null = null): BoardCommandDocument {
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'gate-profile-start', setupId, gateName, phase, entity
  };
}

export const GatesAreaModel = Object.freeze({
  addGateLabelOf,
  announcementOf,
  deleteEditsOf,
  emptyTextOf,
  gateCountOf,
  keyDeletesRow,
  lineOf,
  lineRunTimeOf,
  openRequestOf,
  profileStartCommandOf,
  profileTimeTextOf,
  reorderEditsOf,
  rowViewsOf,
  titleOf,
});
