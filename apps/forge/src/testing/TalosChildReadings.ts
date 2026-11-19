/**
 * Talos's adapter of a board's children for a spec that reads children it did not launch through it: their liveness, event logs and
 * records. With no connection it launches, writes and stops nothing. A child's Talos is read from its record unless `talosLiveness` says
 * otherwise; a spec that plants child records with no Talos record passes `EVERY_TALOS_IS_LIVE`.
 */
import { basename, dirname } from 'node:path';

import type { PlatformPorts }                                             from '../lib/platform-ports/PlatformPortsFor.ts';
import { type ChildFiles, childFilesOf }                                  from '../lib/talos/TalosFiles.ts';
import type { BoardChildren }                                             from '../services/overseer/BoardChildren.ts';
import { createTalosChildren, recordedTalosLiveness, type TalosLiveness } from '../services/overseer/TalosChildren.ts';

const UNREAD_BOARD_FOLDER = '/example/unread-tracker';

export const EVERY_TALOS_IS_LIVE: TalosLiveness = () => true;

export function talosChildReadingsWith(platformPorts: PlatformPorts, boardFolder: string = UNREAD_BOARD_FOLDER, talosLiveness?: TalosLiveness): BoardChildren {
  return createTalosChildren({
    boardFolder, platformPorts, connection: () => null, talosLiveness: talosLiveness ?? recordedTalosLiveness(boardFolder, platformPorts)
  });
}

/** The files of a child given its absolute folder, as a spec that names job folders reads them. */
export function childFilesIn(childFolder: string, instance: number): ChildFiles {
  return childFilesOf(dirname(childFolder), basename(childFolder), instance);
}
