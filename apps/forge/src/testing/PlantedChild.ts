/**
 * A board folder's Talos files as a spec plants them: a child's record and event log, and Talos's own record, each with example values a
 * case overrides. Test-only.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname }        from 'node:path';

import { type ChildEnd, type ChildRecord, childRecordTextOf } from '../lib/talos/ChildRecord.ts';
import type { EventLogEntry }                                 from '../lib/talos/EventLog.ts';
import { childFilesOf, talosRecordPathOf }                    from '../lib/talos/TalosFiles.ts';
import { type TalosRecord, talosRecordTextOf }                from '../lib/talos/TalosRecord.ts';
import {
  CHILD_RECORD_FORMAT_VERSION,
  EVENT_LOG_FORMAT_VERSION,
  TALOS_PROTOCOL_VERSION,
  TALOS_RECORD_FORMAT_VERSION
} from '../lib/talos/constants/TalosProtocol.ts';

export interface PlantedChildRequest {
  boardFolder: string;
  /** `/`-separated and relative to the board folder, as a launch names it. */
  childFolder: string;
  instance:    number;
}

function writeCreatingFolder(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A running child of Talos 1 unless `changes` says otherwise; answers the record written. */
function plantChildRecord(request: PlantedChildRequest, changes: Partial<ChildRecord> = {}): ChildRecord {
  const record: ChildRecord = {
    formatVersion:         CHILD_RECORD_FORMAT_VERSION,
    childId:               `${request.childFolder}#${request.instance}`,
    kind:                  'agent',
    label:                 'example child',
    workingDirectory:      request.boardFolder,
    talosStartNumber:      1,
    talos:                 null,
    state:                 'running',
    childProcess:          null,
    childProcessGroupId:   null,
    eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
    timeBoundMilliseconds: null,
    recognisedEndings:     [],
    end:                   null,
    ...changes,
  };
  writeCreatingFolder(childFilesOf(request.boardFolder, request.childFolder, request.instance).recordPath, childRecordTextOf(record));
  return record;
}

/** A child of the absolute `childFolder` ended as Talos records `end`, exited 0 unless it says otherwise; answers the record written. */
function plantEndedChildAt(childFolder: string, instance: number, end: Partial<ChildEnd> = {}): ChildRecord {
  return plantChildRecord({ boardFolder: dirname(childFolder), childFolder: basename(childFolder), instance }, {
    kind:  'line',
    state: 'ended',
    end:   {
      reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 0, ...end
    },
  });
}

/** Writes the record file's text as it is, for a record no reader should take. */
function plantChildRecordText(request: PlantedChildRequest, text: string): void {
  writeCreatingFolder(childFilesOf(request.boardFolder, request.childFolder, request.instance).recordPath, text);
}

/** Each entry one terminated line, or the text as it is. */
function plantEventLog(request: PlantedChildRequest, content: readonly EventLogEntry[] | string): void {
  const text = typeof content === 'string' ? content : content.map((entry) => `${JSON.stringify(entry)}\n`).join('');
  writeCreatingFolder(childFilesOf(request.boardFolder, request.childFolder, request.instance).eventLogPath, text);
}

/** A serving Talos of this protocol unless `changes` says otherwise. */
function plantTalosRecord(boardFolder: string, startNumber: number, changes: Partial<TalosRecord> = {}): TalosRecord {
  const record: TalosRecord = {
    formatVersion:   TALOS_RECORD_FORMAT_VERSION,
    startNumber,
    protocolVersion: TALOS_PROTOCOL_VERSION,
    codeVersion:     'code-example',
    talos:           null,
    state:           'serving',
    endpoint:        `/example/talos-${startNumber}.sock`,
    quitReason:      null,
    lease:           { standing: 'unheld', lastRenewer: null },
    ...changes,
  };
  writeCreatingFolder(talosRecordPathOf(boardFolder, startNumber), talosRecordTextOf(record));
  return record;
}

export const PlantedChild = Object.freeze({
  plantChildRecord, plantEndedChildAt, plantChildRecordText, plantEventLog, plantTalosRecord
});
