/** The messages between Talos's main thread and its synchronous-calls thread, and what each call answers when it is done. */
import type { ExclusiveCreation }                                 from '../../atomic-file/FileReplace.ts';
import type { ChildEnd, ProcessIdentity, ProcessTreeStopOutcome } from '../../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessTreeMember }               from '../../process-identity/ProcessSupervision.ts';
import type { EventLogEntry }                                     from '../EventLog.ts';

export type SynchronousCallRequest =
  | { callId: number; call: 'start'; platform: string; systemRoot: string | null }
  | { callId: number; call: 'identity-of'; processId: number }
  | { callId: number; call: 'tree-members-of'; leader: ProcessIdentity; earlierMembers: readonly ProcessTreeMember[] }
  | { callId: number; call: 'stop-tree'; leader: ProcessIdentity; stage: ProcessStopStage; treeMembers: readonly ProcessTreeMember[] }
  | { callId: number; call: 'end-of'; exitCode: number | null; signalCode: string | null; forcedStopRan: boolean }
  | { callId: number; call: 'open-event-log'; eventLogPath: string }
  | { callId: number; call: 'append-event'; eventLogPath: string; entry: EventLogEntry }
  | { callId: number; call: 'sync-and-close-event-log'; eventLogPath: string }
  | { callId: number; call: 'write-record'; path: string; text: string; exclusive: boolean }
  | { callId: number; call: 'append-text'; path: string; text: string };

export type SynchronousCallAnswer =
  | { callId: number; verdict: 'done'; value: unknown }
  | { callId: number; verdict: 'failed'; reason: string };

export type SynchronousCallKind = SynchronousCallRequest['call'];

/** An exclusive write creates the file or finds it there; any other write replaces it atomically. */
export type RecordWriteOutcome = ExclusiveCreation | 'replaced';

/** The `value` of a `done` answer, by call. */
export interface SynchronousCallValues {
  'start':                    null;
  'identity-of':              ProcessIdentity | null;
  'tree-members-of':          readonly ProcessTreeMember[] | null;
  'stop-tree':                ProcessTreeStopOutcome;
  'end-of':                   ChildEnd;
  'open-event-log':           null;
  'append-event':             EventLogEntry;
  'sync-and-close-event-log': null;
  'write-record':             RecordWriteOutcome;
  'append-text':              null;
}
