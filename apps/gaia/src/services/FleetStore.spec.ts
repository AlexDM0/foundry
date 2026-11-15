/**
 * The fleet store over the fleet fixtures: a snapshot whose content equals the latest one's is not published, also when it is another
 * object built the same way, while any change of content is; every subscriber hears each published snapshot once, and an ended
 * subscription hears nothing more.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_DEGRADED }    from '../adapters/page-api/testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_EMPTY }       from '../adapters/page-api/testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES } from '../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { FleetSnapshot }         from '../shared/@types/FleetSnapshot.ts';
import { createFleetStore }           from './FleetStore.ts';

function copyOf(snapshot: FleetSnapshot): FleetSnapshot {
  return structuredClone(snapshot);
}

describe('publishing', () => {
  test('holds the first snapshot as the latest before anything is published', () => {
    expect(createFleetStore(FLEET_SNAPSHOT_EMPTY).latest()).toBe(FLEET_SNAPSHOT_EMPTY);
  });

  test('publishes nothing for a snapshot whose content equals the latest one\'s, though it is another object', () => {
    const store = createFleetStore(FLEET_SNAPSHOT_FIVE_FORGES);
    const heard: FleetSnapshot[] = [];
    store.subscribe((snapshot) => heard.push(snapshot));

    expect(store.publish(copyOf(FLEET_SNAPSHOT_FIVE_FORGES))).toBe('unchanged');
    expect(store.latest()).toBe(FLEET_SNAPSHOT_FIVE_FORGES);
    expect(heard).toEqual([]);
  });

  test('publishes a snapshot whose content changed, down to one stamp of one forge', () => {
    const store = createFleetStore(FLEET_SNAPSHOT_FIVE_FORGES);
    const heard: FleetSnapshot[] = [];
    store.subscribe((snapshot) => heard.push(snapshot));
    const restamped = copyOf(FLEET_SNAPSHOT_FIVE_FORGES);
    const [firstForge] = restamped.forges;
    if (firstForge === undefined) throw new Error('The five-forge fixture holds no forge.');
    firstForge.lastReportedAt = '2026-11-12T13:31:40.000Z';

    expect(store.publish(restamped)).toBe('published');
    expect(store.latest()).toBe(restamped);
    expect(heard).toEqual([restamped]);
  });

  test('publishes a change, then nothing for the same content again, then the change back', () => {
    const store = createFleetStore(FLEET_SNAPSHOT_FIVE_FORGES);
    const heard: FleetSnapshot[] = [];
    store.subscribe((snapshot) => heard.push(snapshot));

    expect(store.publish(FLEET_SNAPSHOT_DEGRADED)).toBe('published');
    expect(store.publish(copyOf(FLEET_SNAPSHOT_DEGRADED))).toBe('unchanged');
    expect(store.publish(FLEET_SNAPSHOT_FIVE_FORGES)).toBe('published');
    expect(heard).toEqual([FLEET_SNAPSHOT_DEGRADED, FLEET_SNAPSHOT_FIVE_FORGES]);
  });
});

describe('subscribing', () => {
  test('hands each published snapshot to every subscriber once', () => {
    const store = createFleetStore(FLEET_SNAPSHOT_EMPTY);
    const heardByFirst: FleetSnapshot[] = [];
    const heardBySecond: FleetSnapshot[] = [];
    store.subscribe((snapshot) => heardByFirst.push(snapshot));
    store.subscribe((snapshot) => heardBySecond.push(snapshot));

    store.publish(FLEET_SNAPSHOT_FIVE_FORGES);
    expect(heardByFirst).toEqual([FLEET_SNAPSHOT_FIVE_FORGES]);
    expect(heardBySecond).toEqual([FLEET_SNAPSHOT_FIVE_FORGES]);
  });

  test('hands nothing to a subscription that has ended, while the others still hear', () => {
    const store = createFleetStore(FLEET_SNAPSHOT_EMPTY);
    const heardByEnded: FleetSnapshot[] = [];
    const heardByStaying: FleetSnapshot[] = [];
    const endSubscription = store.subscribe((snapshot) => heardByEnded.push(snapshot));
    store.subscribe((snapshot) => heardByStaying.push(snapshot));

    endSubscription();
    store.publish(FLEET_SNAPSHOT_FIVE_FORGES);
    expect(heardByEnded).toEqual([]);
    expect(heardByStaying).toEqual([FLEET_SNAPSHOT_FIVE_FORGES]);
  });
});
