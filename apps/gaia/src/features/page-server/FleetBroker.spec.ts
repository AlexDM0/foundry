/**
 * The fleet broker over a fleet store and timers fired by hand: a stream opens on its handshake and the current document, then hears every
 * published snapshot once as a `fleet` event with Gaia's system version; the heartbeat runs only while a stream is open, and a stop ends every
 * stream and the heartbeat.
 */
import { describe, expect, test } from 'bun:test';

import { FleetDocumentMapUtil }       from '../../adapters/page-api/FleetDocumentMapUtil.ts';
import { FLEET_SNAPSHOT_DEGRADED }    from '../../adapters/page-api/testing/fleet-snapshot-degraded.ts';
import { FLEET_SNAPSHOT_EMPTY }       from '../../adapters/page-api/testing/fleet-snapshot-empty.ts';
import { FLEET_SNAPSHOT_FIVE_FORGES } from '../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import { eventStreamParserOf }        from '../../lib/event-stream/EventStreamParser.ts';
import { createFleetStore }           from '../../services/FleetStore.ts';
import type { FleetSnapshot }         from '../../shared/@types/FleetSnapshot.ts';
import { GAIA_SYSTEM_VERSION }        from '../../shared/constants/GaiaSystemVersions.ts';
import { manualTimers }               from '../../testing/ManualTimers.ts';
import { createFleetBroker }          from './FleetBroker.ts';

const HEARTBEAT_MILLISECONDS = 1_000;

function brokerOver(firstSnapshot: FleetSnapshot) {
  const fleetStore = createFleetStore(firstSnapshot);
  const timers     = manualTimers();
  const broker     = createFleetBroker({ fleetStore, timers, heartbeatIntervalMilliseconds: HEARTBEAT_MILLISECONDS });
  return { fleetStore, timers, broker };
}

function fleetEventDataOf(snapshot: FleetSnapshot): string {
  return JSON.stringify({ ...FleetDocumentMapUtil.fleetDocumentOf(snapshot), systemVersion: GAIA_SYSTEM_VERSION });
}

async function fleetEventDataIn(response: Response): Promise<string[]> {
  return eventStreamParserOf().eventsOf(await response.text())
    .filter((event) => event.eventName === 'fleet')
    .map((event) => event.data);
}

describe('the fleet document', () => {
  test('is the latest snapshot mapped out to the page contract, in JSON', () => {
    const { fleetStore, broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    fleetStore.publish(FLEET_SNAPSHOT_FIVE_FORGES);
    expect(JSON.parse(broker.fleetDocumentJson())).toEqual(FleetDocumentMapUtil.fleetDocumentOf(FLEET_SNAPSHOT_FIVE_FORGES));
  });
});

describe('an event stream', () => {
  test('opens on its handshake, Gaia\'s system version, before the first document', async () => {
    const { broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    const stream = broker.openEventStream();
    broker.stop();
    const events = eventStreamParserOf().eventsOf(await stream.text());
    expect(events.map((event) => [event.eventName, JSON.parse(event.data) as unknown])).toEqual([
      ['handshake', { systemVersion: GAIA_SYSTEM_VERSION }],
      ['fleet', JSON.parse(fleetEventDataOf(FLEET_SNAPSHOT_EMPTY)) as unknown],
    ]);
  });

  test('opens on the current document, then hears each published snapshot once, and nothing for an unchanged one', async () => {
    const { fleetStore, broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    const firstStream = broker.openEventStream();
    fleetStore.publish(FLEET_SNAPSHOT_FIVE_FORGES);
    const secondStream = broker.openEventStream();
    fleetStore.publish(structuredClone(FLEET_SNAPSHOT_FIVE_FORGES));
    fleetStore.publish(FLEET_SNAPSHOT_DEGRADED);
    broker.stop();

    expect(await fleetEventDataIn(firstStream)).toEqual([
      fleetEventDataOf(FLEET_SNAPSHOT_EMPTY),
      fleetEventDataOf(FLEET_SNAPSHOT_FIVE_FORGES),
      fleetEventDataOf(FLEET_SNAPSHOT_DEGRADED),
    ]);
    expect(await fleetEventDataIn(secondStream)).toEqual([fleetEventDataOf(FLEET_SNAPSHOT_FIVE_FORGES), fleetEventDataOf(FLEET_SNAPSHOT_DEGRADED)]);
  });

  test('is dropped when its reader goes away', async () => {
    const { broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    const keptStream = broker.openEventStream();
    const leftStream = broker.openEventStream();
    expect(broker.openStreamCount()).toBe(2);

    await leftStream.body?.cancel();
    expect(broker.openStreamCount()).toBe(1);
    broker.stop();
    expect(await fleetEventDataIn(keptStream)).toHaveLength(1);
  });
});

describe('the heartbeat', () => {
  test('runs only while a stream is open, sends a comment down every open stream, and stops with the last stream', async () => {
    const { timers, broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    expect(timers.pendingDelays()).toEqual([]);

    const firstStream  = broker.openEventStream();
    const secondStream = broker.openEventStream();
    expect(timers.pendingDelays()).toEqual([HEARTBEAT_MILLISECONDS]);
    expect(timers.fire(HEARTBEAT_MILLISECONDS)).toBe(1);
    expect(timers.pendingDelays()).toEqual([HEARTBEAT_MILLISECONDS]);

    await firstStream.body?.cancel();
    expect(timers.pendingDelays()).toEqual([HEARTBEAT_MILLISECONDS]);
    await secondStream.body?.cancel();
    expect(timers.pendingDelays()).toEqual([]);
  });

  test('reaches a reader as a comment line that the event parser skips', async () => {
    const { timers, broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    const stream = broker.openEventStream();
    timers.fire(HEARTBEAT_MILLISECONDS);
    broker.stop();
    const bodyText = await stream.text();
    expect(bodyText).toContain('\n: heartbeat\n\n');
    expect(eventStreamParserOf().eventsOf(bodyText)).toHaveLength(2);
  });
});

describe('a stopped broker', () => {
  test('ends every stream, leaves no timer, hears the store no more, and opens only an ended stream', async () => {
    const { fleetStore, timers, broker } = brokerOver(FLEET_SNAPSHOT_EMPTY);
    const stream = broker.openEventStream();
    broker.stop();
    fleetStore.publish(FLEET_SNAPSHOT_FIVE_FORGES);

    expect(timers.pendingDelays()).toEqual([]);
    expect(broker.openStreamCount()).toBe(0);
    expect(await fleetEventDataIn(stream)).toEqual([fleetEventDataOf(FLEET_SNAPSHOT_EMPTY)]);
    expect(await broker.openEventStream().text()).toBe('');
    expect(timers.pendingDelays()).toEqual([]);
  });
});
