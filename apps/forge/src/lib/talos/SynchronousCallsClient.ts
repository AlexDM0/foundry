/**
 * The main thread's proxy of the synchronous-calls thread: one async method per call, each settled by the answer of its own `callId`, and
 * every call rejected once the thread is dead. The transport is a parameter, so a spec runs it without a worker; `startSynchronousCallsWorker`
 * is the real one.
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
import type { EventLogEntry }   from './EventLog.ts';
import type { EndpointOutcome } from './LocalEndpoint.ts';

export interface SynchronousCallsTransport {
  readonly post:      (request: SynchronousCallRequest) => void;
  readonly onAnswer:  (listener: (answer: SynchronousCallAnswer) => void) => void;
  /** The thread died, by an uncaught error, its own close or a terminate: no pending call will ever be answered. */
  readonly onFailure: (listener: (reason: string) => void) => void;
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
  readonly prepareEndpoint:      (endpoint: string) => Promise<EndpointOutcome>;
  readonly releaseEndpoint:      (endpoint: string) => Promise<EndpointOutcome>;
}

/** The thread answered `failed`, having thrown on this call alone, or it died with the call pending or before it. */
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
  let failureReason: string | null = null;

  transport.onAnswer((answer) => {
    const pendingCall = pendingCalls.get(answer.callId);
    if (pendingCall === undefined) return;
    pendingCalls.delete(answer.callId);
    if (answer.verdict === 'done') pendingCall.resolve(answer.value);
    else pendingCall.reject(new SynchronousCallFailedError(pendingCall.call, answer.reason));
  });

  transport.onFailure((reason) => {
    failureReason ??= reason;
    for (const pendingCall of pendingCalls.values()) pendingCall.reject(new SynchronousCallFailedError(pendingCall.call, reason));
    pendingCalls.clear();
  });

  function callOf<Kind extends SynchronousCallKind>(body: SynchronousCallBody & { call: Kind }): Promise<SynchronousCallValues[Kind]> {
    if (failureReason !== null) return Promise.reject(new SynchronousCallFailedError(body.call, failureReason));
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
    appendText:      (path, text) => callOf({ call: 'append-text', path, text }),
    prepareEndpoint: (endpoint) => callOf({ call: 'prepare-endpoint', endpoint }),
    releaseEndpoint: (endpoint) => callOf({ call: 'release-endpoint', endpoint }),
  };
  return Object.freeze(synchronousCalls);
}

const SYNCHRONOUS_CALLS_THREAD_ENTRY = new URL('./SynchronousCallsThread.ts', import.meta.url);

/**
 * Started once, when Talos starts: the worker loads its modules then, so a later pull of the program on disk gives it no other code. A spec
 * gives another `threadEntry` to watch a thread die.
 */
export function startSynchronousCallsWorker(threadEntry: URL = SYNCHRONOUS_CALLS_THREAD_ENTRY): SynchronousCallsWorker {
  const worker = new Worker(threadEntry);
  const failureListeners: ((reason: string) => void)[] = [];
  let workerIsDead = false;
  const workerDied = (reason: string): void => {
    if (workerIsDead) return;
    workerIsDead = true;
    for (const listener of failureListeners) listener(reason);
  };
  worker.addEventListener('error', (event: ErrorEvent) => workerDied(`the synchronous-calls thread failed: ${event.message}`));
  worker.addEventListener('close', () => workerDied('the synchronous-calls thread closed'));
  return Object.freeze({
    post: (request: SynchronousCallRequest) => {
      worker.postMessage(request);
    },
    onAnswer: (listener: (answer: SynchronousCallAnswer) => void) => {
      worker.addEventListener('message', (event: MessageEvent<SynchronousCallAnswer>) => listener(event.data));
    },
    onFailure: (listener: (reason: string) => void) => {
      failureListeners.push(listener);
    },
    terminate: () => {
      worker.terminate();
      workerDied('the synchronous-calls thread was terminated');
    },
  });
}
