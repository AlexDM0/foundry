/**
 * The stored check reads each job vocabulary from its tuple, so a union member the tuple lacks would make a well-formed progress file
 * unreadable: each tuple names every member of its union in `src/domain/tracker-model/@types/Job.ts`, once.
 */
import { expect, test } from 'bun:test';

import type {
  InterruptionCause,
  JobKind,
  JobOutcome,
  JobRole,
  JobState,
  HephaestusStopReason,
  AirlockPhase,
  StartKind,
  StartOrigin
}                                  from '../@types/Job.ts';
import type { TupleCoversTheUnion } from '../testing/TupleCoversTheUnion.ts';
import {
  CRASH_INTERRUPTION_CAUSES,
  INTERRUPTION_CAUSES,
  JOB_KINDS,
  JOB_OUTCOMES,
  JOB_ROLES,
  JOB_STATES,
  HEPHAESTUS_STOP_REASONS,
  AIRLOCK_PHASES,
  START_KINDS,
  START_ORIGINS
}                                  from './JobStates.ts';

const EVERY_TUPLE_COVERS_ITS_UNION: readonly true[] = [
  true satisfies TupleCoversTheUnion<JobKind, typeof JOB_KINDS>,
  true satisfies TupleCoversTheUnion<JobRole, typeof JOB_ROLES>,
  true satisfies TupleCoversTheUnion<JobState, typeof JOB_STATES>,
  true satisfies TupleCoversTheUnion<JobOutcome, typeof JOB_OUTCOMES>,
  true satisfies TupleCoversTheUnion<InterruptionCause, typeof INTERRUPTION_CAUSES>,
  true satisfies TupleCoversTheUnion<AirlockPhase, typeof AIRLOCK_PHASES>,
  true satisfies TupleCoversTheUnion<HephaestusStopReason, typeof HEPHAESTUS_STOP_REASONS>,
  true satisfies TupleCoversTheUnion<StartKind, typeof START_KINDS>,
  true satisfies TupleCoversTheUnion<StartOrigin, typeof START_ORIGINS>,
];

test('every job vocabulary tuple covers its union, and none names a member twice', () => {
  expect(EVERY_TUPLE_COVERS_ITS_UNION.every(Boolean)).toBe(true);
  for (const tuple of [JOB_KINDS, JOB_ROLES, JOB_STATES, JOB_OUTCOMES, INTERRUPTION_CAUSES, AIRLOCK_PHASES, HEPHAESTUS_STOP_REASONS, START_KINDS, START_ORIGINS]) {
    expect(new Set<string>(tuple).size).toBe(tuple.length);
  }
});

test('the outcomes include a replaced, a resolved and a cannot-resolve job, and only lost-child and agent crashes count toward a resume', () => {
  expect(JOB_OUTCOMES).toEqual(expect.arrayContaining(['replaced', 'resolved', 'cannot-resolve']));
  expect(CRASH_INTERRUPTION_CAUSES).toEqual(['talos-lost', 'agent-crashed']);
});
