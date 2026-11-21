/**
 * The monitor snapshots a stream sends. What matters: nothing is sent or kept before the first publish; a publish that changes no key sends
 * nothing; a changed one reaches every listener and becomes the newest; a listener that left hears nothing more.
 */
import { describe, expect, test } from 'bun:test';

import type { MonitorSnapshot } from '../../shared/monitor/@types/MonitorSnapshot.ts';
import { MonitorStream }        from './MonitorStream.ts';

function snapshotWith(openIncidents: number): MonitorSnapshot {
  return { monitorVersion: 6, openIncidents } as unknown as MonitorSnapshot;
}

describe('MonitorStream', () => {
  test('sends a snapshot only when it differs from the last one, and keeps the newest', () => {
    const stream = MonitorStream.createMonitorStream();
    const heard: number[] = [];
    stream.subscribe((snapshot) => heard.push(snapshot.openIncidents));
    expect(stream.latest()).toBeNull();
    stream.publish(snapshotWith(0));
    stream.publish(snapshotWith(0));
    stream.publish(snapshotWith(2));
    expect(heard).toEqual([0, 2]);
    expect(stream.latest()?.openIncidents).toBe(2);
  });

  test('a listener that left hears nothing more', () => {
    const stream = MonitorStream.createMonitorStream();
    const heard: number[] = [];
    const leave = stream.subscribe((snapshot) => heard.push(snapshot.openIncidents));
    stream.publish(snapshotWith(1));
    leave();
    stream.publish(snapshotWith(3));
    expect(heard).toEqual([1]);
  });
});
