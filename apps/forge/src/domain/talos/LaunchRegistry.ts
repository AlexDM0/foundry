/**
 * `launches-<startNumber>.ndjson`: one line per launch a Talos accepted. A child's id is claimed at once, so a second `launch` of it,
 * also one in the same turn, is answered `already-done` and spawns nothing.
 */
import { childIdOf, type ChildLaunch, type LaunchRegistryEntry } from './ChildLaunch.ts';

export type LaunchRegistration =
  | { verdict: 'registered'; entry: LaunchRegistryEntry; appended: Promise<unknown> }
  | { verdict: 'already-launched' };

export interface LaunchRegistry {
  readonly registered: (launch: ChildLaunch) => LaunchRegistration;
}

export function launchRegistryEntryLineOf(entry: LaunchRegistryEntry): string {
  return `${JSON.stringify(entry)}\n`;
}

/** `appendText` appends a line to the registry at `registryPath`; the caller awaits it before the child is spawned. */
export function createLaunchRegistry(registryPath: string, appendText: (path: string, text: string) => Promise<unknown>): LaunchRegistry {
  const launchedChildIds = new Set<string>();
  return Object.freeze({
    registered: (launch: ChildLaunch): LaunchRegistration => {
      const childId = childIdOf(launch.childFolder, launch.instance);
      if (launchedChildIds.has(childId)) return { verdict: 'already-launched' };
      launchedChildIds.add(childId);
      const entry: LaunchRegistryEntry = {
        childId, childFolder: launch.childFolder, instance: launch.instance, kind: launch.kind
      };
      return { verdict: 'registered', entry, appended: appendText(registryPath, launchRegistryEntryLineOf(entry)) };
    },
  });
}
