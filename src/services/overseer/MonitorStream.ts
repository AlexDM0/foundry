/**
 * The monitor snapshots `GET /api/monitor/events` sends: a published snapshot reaches the listeners only when its text differs from the last
 * one, so a publish that changes no key sends nothing. It keeps no replay: a client that connects or reconnects starts from the newest whole
 * snapshot.
 */
import type { MonitorSnapshot } from '../../shared/monitor/@types/MonitorSnapshot.ts';

export interface MonitorStream {
  publish:   (snapshot: MonitorSnapshot) => void;
  /** `null` before the first publish. */
  latest:    () => MonitorSnapshot | null;
  subscribe: (listener: (snapshot: MonitorSnapshot) => void) => () => void;
}

function createMonitorStream(): MonitorStream {
  const listeners = new Set<(snapshot: MonitorSnapshot) => void>();
  let latest: MonitorSnapshot | null = null;
  let latestText: string | null = null;
  return {
    publish: (snapshot) => {
      const snapshotText = JSON.stringify(snapshot);
      if (snapshotText === latestText) return;
      latest = snapshot;
      latestText = snapshotText;
      for (const listener of listeners) listener(snapshot);
    },
    latest:    () => latest,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const MonitorStream = Object.freeze({ createMonitorStream });
