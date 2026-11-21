import type { SystemVersion } from 'system-versions/VersionsDocument';

import { SystemVersionUtil }       from '../../../shared/utils/SystemVersionUtil.ts';
import type { BoardRelayLogEntry } from '../@types/BoardRelayLogEntry.ts';

/** An event this unreadable names no key of its own: its data is no JSON, or its name is none the stream carries. */
export const WHOLE_EVENT_KEY = '(the whole event)';

function versionTextOf(version: SystemVersion | null): string {
  return version === null ? 'none' : SystemVersionUtil.textOf(version);
}

/** One line of Gaia's log for a relay entry, as `gaia serve` writes it on standard error. */
function lineOf(entry: BoardRelayLogEntry): string {
  switch (entry.kind) {
    case 'event-dropped':
      return `Gaia dropped a ${entry.eventName} event of ${entry.trackerId}'s ${entry.stream} it could not read: ${entry.invalidKeys.join(', ')}.\n`;
    case 'handshake-version-differs':
      return `Gaia closed ${entry.trackerId}'s ${entry.stream}: its handshake named version ${versionTextOf(entry.versionHandshakeNamed)}, `
        + `and the watch read ${versionTextOf(entry.versionWatchRead)}.\n`;
    case 'board-unreadable':
      return `Gaia could not read ${entry.trackerId}'s board: ${entry.invalidKeys.join(', ')}.\n`;
    case 'presence-unreadable':
      return `Gaia could not read what ${entry.trackerId}'s waiting work waits for: ${entry.invalidKeys.join(', ')}.\n`;
    case 'crash-log-unreadable':
      return `Gaia could not read a crash log of ${entry.trackerId}: ${entry.invalidKeys.join(', ')}.\n`;
  }
}

export const BoardRelayLogUtil = { lineOf } as const;
