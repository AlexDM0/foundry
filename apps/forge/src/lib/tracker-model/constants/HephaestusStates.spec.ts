/**
 * That the Hephaestus state tuple and its union in `src/lib/tracker-model/@types/TrackerProgress.ts` name the same two states, once each,
 * and that the default is one of them.
 */
import { expect, test } from 'bun:test';

import type { HephaestusState }                        from '../@types/TrackerProgress.ts';
import type { TupleCoversTheUnion }                    from '../testing/TupleCoversTheUnion.ts';
import { DEFAULT_HEPHAESTUS_STATE, HEPHAESTUS_STATES } from './HephaestusStates.ts';

/** A tuple member the union has never heard of fails `bun run typecheck` rather than a test. */
const HEPHAESTUS_STATE_TUPLE_MATCHES_THE_UNION = HEPHAESTUS_STATES satisfies readonly HephaestusState[];

const HEPHAESTUS_STATE_TUPLE_COVERS_THE_UNION: TupleCoversTheUnion<HephaestusState, typeof HEPHAESTUS_STATES> = true;

test('every member of the tuple is a name the union also carries', () => {
  expect(HEPHAESTUS_STATE_TUPLE_MATCHES_THE_UNION.length).toBe(2);
});

// A stored Hephaestus state the tuple lacks makes the whole progress file unreadable, so a union member added without it must not pass.
test('every member of the union is a name the tuple also carries, and none appears twice', () => {
  expect(HEPHAESTUS_STATE_TUPLE_COVERS_THE_UNION).toBe(true);
  expect(new Set(HEPHAESTUS_STATES).size).toBe(HEPHAESTUS_STATES.length);
});

// A tracker that never set a state reads the default, and the validator only accepts states the tuple names.
test('the default Hephaestus state is one of the states', () => {
  expect(HEPHAESTUS_STATES).toContain(DEFAULT_HEPHAESTUS_STATE);
});
