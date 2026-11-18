/**
 * The main thread's proxy of the synchronous-calls thread: one async method per call, each settled by the answer of its own `callId`.
 * The transport is a parameter, so a spec runs it without a worker; `startSynchronousCallsWorker` is the real one.
 */
import type { ChildEnd, ProcessIdentity, ProcessTreeStopOutcome } from '../process-identity/ProcessIdentity.ts';
import type { ProcessStopStage, ProcessTreeMember }               from '../process-identity/ProcessSupervision.ts';
import type {
  RecordWriteOutcome,
  SynchronousCallAnswer,
  SynchronousCallKind,
  SynchronousCallRequest,
  SynchronousCallValues
} from './@types/SynchronousCall.ts';
import type { EventLogEntry } from './EventLog.ts';

export interface SynchronousCallsTransport {
  readonly post:     (request: SynchronousCallRequest) => void;
  readonly onAnswer: (listener: (answer: SynchronousCallAnswer) => void) => void;
}

export interface SynchronousCallsWorker extends SynchronousCallsTransport {
  readonly terminate: () => void;
}

export interface SynchronousCalls {
  readonly start:                (platform: string, systemRoot: string | null) => Promise<null>;
  readonly identityOf:           (processId: number) => Promise<ProcessIdentity | null>;
  readonly treeMembersOf:        (leader: ProcessIdentity, earlierMembers: readonly ProcessTreeMember[]) => Promise<readonly ProcessTreeMember[] | null>;
  readonly stopTree:             (leader: ProcessIdentity, stage: ProcessStopStage, treeMembers: readonly ProcessTreeMember[]) => Promise<ProcessTreeStopOutcome>;
  readonly endOf:                (exitCode: number | null, signalCode: string | null, forcedStopRan: boolean) => Promise<ChildEnd>;
  readonly openEventLog:         (eventLogPath: string) => Promise<null>;
  readonly appendEvent:          (eventLogPath: string, entry: EventLogEntry) => Promise<EventLogEntry>;
  readonly syncAndCloseEventLog: (eventLogPath: string) => Promise<null>;
  readonly writeRecord:          (path: string, text: string, exclusive: boolean) => Promise<RecordWriteOutcome>;
  readonly appendText:           (path: string, text: string) => Promise<null>;
}

/** The thread answered `failed`: it threw on this call alone and goes on answering the next. */
export class SynchronousCallFailedError extends Error {
  constructor(readonly call: SynchronousCallKind, readonly reason: string) {
    super(`the synchronous call ${call} failed: ${reason}`);
  }
}

type SynchronousCallBody<Request = SynchronousCallRequest> = Request extends SynchronousCallRequest ? Omit<Request, 'callId'> : never;

interface PendingCall {
  readonly call:    SynchronousCallKind;
  readonly resolve: (value: unknown) => void;
  readonly reject:  (error: SynchronousCallFailedError) => void;
}

export function createSynchronousCalls(transport: SynchronousCallsTransport): SynchronousCalls {
  const pendingCalls = new Map<number, PendingCall>();
  let lastCallId = 0;

  transport.onAnswer((answer) => {
    const pendingCall = pendingCalls.get(answer.callId);
    if (pendingCall === undefined) return;
    pendingCalls.delete(answer.callId);
    if (answer.verdict === 'done') pendingCall.resolve(answer.value);
    else pendingCall.reject(new SynchronousCallFailedError(pendingCall.call, answer.reason));
  });

  function callOf<Kind extends SynchronousCallKind>(body: SynchronousCallBody & { call: Kind }): Promise<SynchronousCallValues[Kind]> {
    lastCallId += 1;
    const callId = lastCallId;
    return new Promise<SynchronousCallValues[Kind]>((resolve, reject) => {
      pendingCalls.set(callId, { call: body.call, resolve: (value) => resolve(value as SynchronousCallValues[Kind]), reject });
      transport.post({ ...body, callId } as SynchronousCallRequest);
    });
  }

  const synchronousCalls: SynchronousCalls = {
    start:         (platform, systemRoot) => callOf({ call: 'start', platform, systemRoot }),
    identityOf:    (processId) => callOf({ call: 'identity-of', processId }),
    treeMembersOf: (leader, earlierMembers) => callOf({ call: 'tree-members-of', leader, earlierMembers }),
    stopTree:      (leader, stage, treeMembers) => callOf({
      call: 'stop-tree', leader, stage, treeMembers
    }),
    endOf: (exitCode, signalCode, forcedStopRan) => callOf({
      call: 'end-of', exitCode, signalCode, forcedStopRan
    }),
    openEventLog:         (eventLogPath) => callOf({ call: 'open-event-log', eventLogPath }),
    appendEvent:          (eventLogPath, entry) => callOf({ call: 'append-event', eventLogPath, entry }),
    syncAndCloseEventLog: (eventLogPath) => callOf({ call: 'sync-and-close-event-log', eventLogPath }),
    writeRecord:          (path, text, exclusive) => callOf({
      call: 'write-record', path, text, exclusive
    }),
    appendText: (path, text) => callOf({ call: 'append-text', path, text }),
  };
  return Object.freeze(synchronousCalls);
}

/** Started once, when Talos starts: the worker loads its modules then, so a later pull of the program on disk gives it no other code. */
export function startSynchronousCallsWorker(): SynchronousCallsWorker {
  const worker = new Worker(new URL('./SynchronousCallsThread.ts', import.meta.url));
  return Object.freeze({
    post: (request: SynchronousCallRequest) => {
      worker.postMessage(request);
    },
    onAnswer: (listener: (answer: SynchronousCallAnswer) => void) => {
      worker.addEventListener('message', (event: MessageEvent<SynchronousCallAnswer>) => listener(event.data));
    },
    terminate: () => {
      worker.terminate();
    },
  });
}
