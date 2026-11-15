/**
 * The Bridge's state after one event: a `board` event carries the whole `BoardState` and replaces it; `job`, `decision` and `incident`
 * replace their record by id (or add it), an ended `job` leaves the jobs, `profile` replaces its run by run id (or adds it), `pipeline`
 * replaces the pipeline, setup and flow slices it carries, and `overseer` and `usage` replace their slice, between two snapshots. Before
 * the first `board` a slice event has nothing to update.
 */
import type { GateProfileRunFacts } from '../../src/lib/tracker-model/@types/PipelineFacts.ts';

import type { BoardStateDocument, IdentifiedRecord } from '../@types/BoardStateDocument.ts';
import type { OverseerEventKind }                    from '../api/EventStreamClient.ts';

/** The slices a `pipeline` event carries, each only when present. */
const PIPELINE_EVENT_SLICES = ['pipeline', 'pipelineSetup', 'pipelineFlow'] as const;

function isIdentified(data: unknown): data is IdentifiedRecord {
  return typeof data === 'object' && data !== null && typeof (data as { id?: unknown }).id === 'string';
}

function withRecord(records: readonly IdentifiedRecord[], record: IdentifiedRecord): readonly IdentifiedRecord[] {
  const index = records.findIndex((existing) => existing.id === record.id);
  return index === -1 ? [...records, record] : records.map((existing, position) => (position === index ? record : existing));
}

function isProfileRun(data: unknown): data is GateProfileRunFacts {
  return typeof data === 'object' && data !== null && typeof (data as { profileRunId?: unknown }).profileRunId === 'string';
}

function withProfileRun(runs: readonly GateProfileRunFacts[], run: GateProfileRunFacts): readonly GateProfileRunFacts[] {
  const index = runs.findIndex((existing) => existing.profileRunId === run.profileRunId);
  return index === -1 ? [...runs, run] : runs.map((existing, position) => (position === index ? run : existing));
}

function withPipelineSlices(state: BoardStateDocument, data: unknown): BoardStateDocument {
  if (typeof data !== 'object' || data === null) return state;
  const slices = PIPELINE_EVENT_SLICES.filter((slice) => Object.hasOwn(data, slice));
  return slices.length === 0 ? state : { ...state, ...Object.fromEntries(slices.map((slice) => [slice, (data as Record<string, unknown>)[slice]])) };
}

function boardStateAfter(state: BoardStateDocument | null, kind: OverseerEventKind, data: unknown): BoardStateDocument | null {
  if (kind === 'board') return typeof data === 'object' && data !== null ? data as BoardStateDocument : state;
  if (state === null) return null;
  switch (kind) {
    case 'job':
      if (!isIdentified(data)) return state;
      return (data as { state?: unknown }).state === 'ended'
        ? { ...state, jobs: state.jobs.filter((job) => job.id !== data.id) }
        : { ...state, jobs: withRecord(state.jobs, data) };
    case 'decision':
      return isIdentified(data) ? { ...state, decisions: withRecord(state.decisions, data) } : state;
    case 'incident':
      return isIdentified(data) ? { ...state, incidents: withRecord(state.incidents, data) } : state;
    case 'overseer':
      return typeof data === 'object' && data !== null ? { ...state, overseer: { ...state.overseer, ...data } } : state;
    case 'usage':
      return { ...state, usage: data };
    case 'profile':
      return isProfileRun(data) ? { ...state, profileRuns: withProfileRun(state.profileRuns ?? [], data) } : state;
    case 'pipeline':
      return withPipelineSlices(state, data);
    default:
      return state;
  }
}

export const BoardStateUpdate = Object.freeze({ boardStateAfter, withRecord });
