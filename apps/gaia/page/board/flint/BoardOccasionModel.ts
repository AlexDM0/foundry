/**
 * The board occasions of Flint: the changes of the whole board, wherever Flint is, from the last reading of the board to the next one, in
 * the order of the table of `docs/design/board.md`, "Flint's board occasions", with a settled incident and an applied pipeline after its
 * incident row and a connection that comes back last; the host performs the first. Also the count of `watcher-spark` for a board. A
 * reading holds the board, the event stream's connection and how many commands Hephaestus refused so far. An incident that opens or
 * settles has one answer: while Flint lives in the questions habitat, that habitat answers it, so the board does not.
 */
import type { SpriteAttendant, SpriteIntent }         from '../../lib/flint/FlintInterface.ts';
import type { ConnectionState }                       from '../api/BoardEventStreamClient.ts';
import { QUESTIONS_SPRITE_HABITAT }                   from './QuestionsSpriteHabitat.ts';
import { QuestionsSpriteModel, type QuestionHistory } from './QuestionsSpriteModel.ts';

/** The applied pipeline as the board serves it; only a readable one names its newest Apply. */
export interface OccasionAppliedPipeline {
  readonly readingVerdict: string;
  readonly application?:   { readonly appliedRevision: number } | null;
}

/**
 * The fields of the board the occasions read; Gaia's `BoardDocument` satisfies them unchanged. Gaia's board serves no Hephaestus
 * `generation`, so until it does a restart of Hephaestus shows only on a `restarting` board and no regroup follows a generation's rise.
 */
export interface OccasionBoard {
  readonly hephaestus:       { readonly state: string; readonly paused: boolean; readonly generation?: number | null };
  readonly usage:            unknown;
  readonly jobs:             readonly unknown[];
  readonly incidents:        readonly { readonly id: string }[];
  readonly concurrency?:     { readonly agentsInFlight: number };
  readonly questionHistory?: QuestionHistory;
  readonly pipeline?:        { readonly applied: OccasionAppliedPipeline };
}

export interface BoardReading {
  /** `null` until the first board arrives. */
  readonly board:               OccasionBoard | null;
  readonly connection:          ConnectionState;
  /** Counts up with each command Hephaestus refuses. */
  readonly refusedCommandCount: number;
}

export const WATCHER_SPARK_ATTENDANT: SpriteAttendant = 'watcher-spark';

/** One spark for each agent in flight, up to the number the attendant shows. */
const WATCHER_SPARK_MAXIMUM_COUNT = 4;

const RESTARTING_STATE = 'restarting';

const DOWN_STATE = 'down';

const LIVE_STATE = 'live';

const ABSENT_PIPELINE_VERDICT = 'absent';

const READABLE_PIPELINE_VERDICT = 'readable';

/** The stream between two settled states: it reopens through it every few seconds while Hephaestus stays unreachable. */
const CONNECTING_STATE = 'connecting';

function resetsAtOf(usage: unknown): string | null {
  const resetsAt = (usage as { readonly resetsAt?: unknown } | null)?.resetsAt;
  return typeof resetsAt === 'string' ? resetsAt : null;
}

/**
 * The revision of the newest Apply, 0 before the first; null when the board cannot say: it serves no pipeline, or one it cannot read, so a
 * file that is readable again after a hand edit is no Apply.
 */
function appliedRevisionOf(board: OccasionBoard): number | null {
  const applied = board.pipeline?.applied;
  if (applied === undefined) return null;
  if (applied.readingVerdict === ABSENT_PIPELINE_VERDICT) return 0;
  if (applied.readingVerdict !== READABLE_PIPELINE_VERDICT) return null;
  return applied.application?.appliedRevision ?? 0;
}

function pipelineWasApplied(previous: OccasionBoard, next: OccasionBoard): boolean {
  const previousRevision = appliedRevisionOf(previous);
  const nextRevision = appliedRevisionOf(next);
  return previousRevision !== null && nextRevision !== null && nextRevision > previousRevision;
}

function generationRose(previous: OccasionBoard, next: OccasionBoard): boolean {
  const { generation: previousGeneration } = previous.hephaestus;
  const { generation: nextGeneration } = next.hephaestus;
  return typeof previousGeneration === 'number' && typeof nextGeneration === 'number' && nextGeneration > previousGeneration;
}

/** Each row of the table that the change matches, in the table's order. Both boards must be known, since the first board is no change. */
function boardOccasionsOf(previous: OccasionBoard, next: OccasionBoard, flintLivesIn: string | null): SpriteIntent[] {
  const previousIncidentIds = new Set(previous.incidents.map((incident) => incident.id));
  const generationIsNew = generationRose(previous, next);
  const restartWasShown = previous.hephaestus.state === RESTARTING_STATE;
  const questionsHabitatAnswers = flintLivesIn === QUESTIONS_SPRITE_HABITAT.kind;
  const incidentSettled = QuestionsSpriteModel.incidentSettled(previous.questionHistory ?? [], next.questionHistory ?? []);
  const rows: readonly (readonly [boolean, SpriteIntent])[] = [
    [previous.hephaestus.state !== DOWN_STATE && next.hephaestus.state === DOWN_STATE, 'bank-fire'],
    // A rise after a restarting board is the restart already shown; only a restart the page missed shows on the rise.
    [!restartWasShown && (next.hephaestus.state === RESTARTING_STATE || generationIsNew), 'baton-pass'],
    [generationIsNew && next.jobs.length > 0, 'regroup'],
    [resetsAtOf(previous.usage) === null && resetsAtOf(next.usage) !== null, 'out-of-fuel'],
    [resetsAtOf(previous.usage) !== null && resetsAtOf(next.usage) === null, 'refuel'],
    [!previous.hephaestus.paused && next.hephaestus.paused, 'hold'],
    [!questionsHabitatAnswers && next.incidents.some((incident) => !previousIncidentIds.has(incident.id)), 'intercept'],
    [!questionsHabitatAnswers && incidentSettled, 'happy'],
    [pipelineWasApplied(previous, next), 'happy'],
  ];
  return rows.flatMap(([matches, intent]) => (matches ? [intent] : []));
}

/**
 * Every occasion from `previous` to `next`, first the one to perform; `flintLivesIn` is the kind of the habitat Flint lives in, null at
 * home. Keep `previous` as `keptReadingOf` gives it, so a stream that keeps reopening is unplugged once.
 */
function occasionsOf(previous: BoardReading, next: BoardReading, flintLivesIn: string | null): readonly SpriteIntent[] {
  const unplugged: SpriteIntent[] = previous.connection !== DOWN_STATE && next.connection === DOWN_STATE ? ['unplugged'] : [];
  const boardOccasions = previous.board === null || next.board === null ? [] : boardOccasionsOf(previous.board, next.board, flintLivesIn);
  const refused: SpriteIntent[] = next.refusedCommandCount > previous.refusedCommandCount ? ['refuse'] : [];
  // A one action, so it ends the unplugged loop; last, since a board that came back with news says more.
  const reconnected: SpriteIntent[] = previous.connection === DOWN_STATE && next.connection === LIVE_STATE ? ['wave'] : [];
  return [...unplugged, ...boardOccasions, ...refused, ...reconnected];
}

/** The reading to compare the next one with: `connecting` is no settled connection, so the last settled one is kept in its place. */
function keptReadingOf(previous: BoardReading | null, next: BoardReading): BoardReading {
  if (previous === null || next.connection !== CONNECTING_STATE) return next;
  return { ...next, connection: previous.connection };
}

/** The sparks for the agents in flight; none before a board, or for a board without the count. */
function watcherSparkCountOf(board: OccasionBoard | null): number {
  return Math.min(board?.concurrency?.agentsInFlight ?? 0, WATCHER_SPARK_MAXIMUM_COUNT);
}

export const BoardOccasionModel = Object.freeze({ occasionsOf, keptReadingOf, watcherSparkCountOf });
