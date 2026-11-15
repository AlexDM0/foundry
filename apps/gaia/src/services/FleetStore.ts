/**
 * The latest `FleetSnapshot` and its subscribers. A snapshot is published only when its content hash differs from the latest one's, so a
 * subscriber hears of a change and never of the same picture twice.
 */
import { createHash } from 'node:crypto';

import type { FleetSnapshot } from '../shared/@types/FleetSnapshot.ts';

export type FleetSnapshotListener = (snapshot: FleetSnapshot) => void;

export type FleetPublishVerdict = 'published' | 'unchanged';

export interface FleetStore {
  readonly latest:    () => FleetSnapshot;
  /** Keeps the candidate and hands it to every subscriber when its content differs from the latest snapshot's. */
  readonly publish:   (candidate: FleetSnapshot) => FleetPublishVerdict;
  /** Answers the function that ends the subscription. */
  readonly subscribe: (listener: FleetSnapshotListener) => () => void;
}

function contentHashOf(snapshot: FleetSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function createFleetStore(firstSnapshot: FleetSnapshot): FleetStore {
  let latestSnapshot = firstSnapshot;
  let latestHash: string | null = null;
  const listeners = new Set<FleetSnapshotListener>();

  function publish(candidate: FleetSnapshot): FleetPublishVerdict {
    latestHash ??= contentHashOf(latestSnapshot);
    const candidateHash = contentHashOf(candidate);
    if (candidateHash === latestHash) return 'unchanged';
    latestSnapshot = candidate;
    latestHash     = candidateHash;
    for (const listener of [...listeners]) listener(candidate);
    return 'published';
  }

  function subscribe(listener: FleetSnapshotListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  return {
    latest: () => latestSnapshot,
    publish,
    subscribe,
  };
}
