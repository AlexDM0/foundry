/**
 * The fleet source. What matters: it holds nothing until the first document, then always the newest; every subscriber hears every
 * document, which is what re-renders the shell in place; one that left hears nothing more.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_EMPTY }       from '../testing/fixtures/fleet-empty.ts';
import { FLEET_FIVE_FORGES } from '../testing/fixtures/fleet-five-forges.ts';
import { createFleetSource } from './FleetSource.ts';

describe('the fleet source', () => {
  test('it holds no document until one is published, then the newest one', () => {
    const source = createFleetSource();
    expect(source.current()).toBeNull();
    source.publish(FLEET_EMPTY);
    source.publish(FLEET_FIVE_FORGES);
    expect(source.current()).toBe(FLEET_FIVE_FORGES);
  });

  test('every subscriber hears every document, reading the new one when it hears it; one that left hears nothing more', () => {
    const source = createFleetSource();
    const firstHeard: (number | null)[] = [];
    const secondHeard: (number | null)[] = [];
    const leaveFirst = source.subscribe(() => firstHeard.push(source.current()?.forges.length ?? null));
    source.subscribe(() => secondHeard.push(source.current()?.forges.length ?? null));
    source.publish(FLEET_FIVE_FORGES);
    leaveFirst();
    source.publish(FLEET_EMPTY);
    expect(firstHeard).toEqual([6]);
    expect(secondHeard).toEqual([6, 0]);
  });
});
