/**
 * The entry module of Talos's synchronous-calls thread, a Bun `Worker` whose import is the invocation: every process-table read, signal,
 * record write, event-log append and endpoint preparation runs here, one at a time in arrival order, so Talos's main loop never blocks on one.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname }                   from 'node:path';

import { createWholeFileAtomically, writeFileAtomically }     from '../atomic-file/AtomicFile.ts';
import type { ProcessSupervision }                            from '../process-identity/ProcessSupervision.ts';
import { processSupervisionFor }                              from '../process-identity/ProcessSupervisionFor.ts';
import type { SynchronousCallAnswer, SynchronousCallRequest } from './@types/SynchronousCall.ts';
import { createEventLogWriter, type EventLogWriter }          from './EventLog.ts';
import type { LocalEndpoint }                                 from './LocalEndpoint.ts';
import { localEndpointFor }                                   from './LocalEndpointFor.ts';

interface OpenEventLog {
  readonly writer: EventLogWriter;
  appendedEntries: number;
}

function synchronousCallAnswerer(): (request: SynchronousCallRequest) => SynchronousCallAnswer {
  let supervision: ProcessSupervision | null = null;
  let localEndpoint: LocalEndpoint | null = null;
  const openEventLogs = new Map<string, OpenEventLog>();
  // Calls run one at a time, so one stamp serves every writer: the entry being appended carries its own.
  let stampOfTheEntryBeingAppended = '';

  function startedSupervision(): ProcessSupervision {
    if (supervision === null) throw new Error('the synchronous-calls thread answers no process call before its start');
    return supervision;
  }

  function startedEndpoint(): LocalEndpoint {
    if (localEndpoint === null) throw new Error('the synchronous-calls thread answers no endpoint call before its start');
    return localEndpoint;
  }

  function openEventLogAt(eventLogPath: string): OpenEventLog {
    const openEventLog = openEventLogs.get(eventLogPath);
    if (openEventLog === undefined) throw new Error(`no event log is open at ${eventLogPath}`);
    return openEventLog;
  }

  function valueOf(request: SynchronousCallRequest): unknown {
    switch (request.call) {
      case 'start':
        supervision = processSupervisionFor(request.platform, request.systemRoot ?? undefined);
        // Talos binds the endpoint its start file names and never draws one, so it has no pipe name prefix to give.
        localEndpoint = localEndpointFor(request.platform, '');
        return null;
      case 'identity-of':
        return startedSupervision().identityOf(request.processId);
      case 'tree-members-of':
        return startedSupervision().treeMembersOf(request.leader, request.earlierMembers);
      case 'stop-tree':
        return startedSupervision().stopTree(request.leader, request.stage, request.treeMembers);
      case 'end-of':
        return startedSupervision().endOf({ exitCode: request.exitCode, signalCode: request.signalCode, forcedStopRan: request.forcedStopRan });
      case 'open-event-log': {
        if (openEventLogs.has(request.eventLogPath)) throw new Error(`the event log at ${request.eventLogPath} is already open`);
        mkdirSync(dirname(request.eventLogPath), { recursive: true });
        openEventLogs.set(request.eventLogPath, { writer: createEventLogWriter(request.eventLogPath, () => stampOfTheEntryBeingAppended), appendedEntries: 0 });
        return null;
      }
      case 'append-event': {
        const openEventLog = openEventLogAt(request.eventLogPath);
        const nextSequence = openEventLog.appendedEntries + 1;
        if (request.entry.sequence !== nextSequence) {
          throw new Error(`the event log at ${request.eventLogPath} appends sequence ${nextSequence} next, not ${request.entry.sequence}`);
        }
        // The thread reads no clock: the main thread stamps every entry it appends.
        if (request.entry.at === undefined) throw new Error(`the event-log entry of sequence ${request.entry.sequence} carries no stamp`);
        stampOfTheEntryBeingAppended = request.entry.at;
        const appendedEntry = openEventLog.writer.append(request.entry.origin, request.entry.line);
        openEventLog.appendedEntries = appendedEntry.sequence;
        return appendedEntry;
      }
      case 'sync-and-close-event-log':
        openEventLogAt(request.eventLogPath).writer.syncAndClose();
        openEventLogs.delete(request.eventLogPath);
        return null;
      case 'write-record':
        if (request.exclusive) return createWholeFileAtomically(request.path, request.text);
        writeFileAtomically(request.path, request.text);
        return 'replaced';
      case 'append-text':
        mkdirSync(dirname(request.path), { recursive: true });
        appendFileSync(request.path, request.text);
        return null;
      case 'prepare-endpoint':
        return startedEndpoint().prepareEndpoint(request.endpoint);
      case 'release-endpoint':
        return startedEndpoint().releaseEndpoint(request.endpoint);
    }
  }

  return (request) => {
    try {
      return { callId: request.callId, verdict: 'done', value: valueOf(request) };
    } catch (error) {
      return { callId: request.callId, verdict: 'failed', systemError: error instanceof Error ? error.message : String(error) };
    }
  };
}

const answerOf = synchronousCallAnswerer();

addEventListener('message', (event: MessageEvent<SynchronousCallRequest>) => {
  postMessage(answerOf(event.data));
});
