/**
 * After the hold, the frames User's job controls ask of a live Watcher (design section 7.4): every `job-messaged` record as a chat line in log
 * order, with the pictures it names read from the board's picture store, the wind-down turn of a `wind-down` request, and a session's closed
 * input, with a stop frame after it for a `stop`, and the closed input of a job that ended while its session ran. A frame waits until its
 * Watcher is live, and a marker written once it was taken keeps a restart from sending it again, unless the Overseer died before the marker:
 * delivery is at least once.
 */
import { existsSync } from 'node:fs';
import { join }       from 'node:path';

import type { AgentAdapter }               from '../../lib/agent-launch/AgentAdapter.ts';
import type { PlatformPorts }              from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { Job, JobKind }               from '../../lib/tracker-model/@types/Job.ts';
import type { Board }                      from '../../lib/tracker-model/Board.ts';
import type { ActingFrame }                from '../../lib/watcher/@types/WatcherFrame.ts';
import { SESSION_STOP_GRACE_MILLISECONDS } from '../../shared/constants/OverseerLimits.ts';
import { PictureStore }                    from '../tracker/PictureStore.ts';
import { AssistantSession }                from './AssistantSession.ts';
import { WatcherFleet }                    from './WatcherFleet.ts';

export interface JobControlDeliveryRequest {
  platformPorts:    PlatformPorts;
  trackerDirectory: string;
  board:            Pick<Board, 'jobs' | 'logRecordsSoFar'>;
  adapter:          Pick<AgentAdapter, 'chatLineOf'>;
  windDownMessage:  string;
}

const MARKERS_FOLDER = 'control-frames';

const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner', 'pipeline-agent'];

/**
 * Whether the frames were taken, on this pass or an earlier one: a later frame of the job waits on an earlier one, so none overtakes it. The
 * frames are built only for a send, so a taken message's pictures are not read again.
 */
async function sendOnce(ports: PlatformPorts, jobFolder: string, job: Readonly<Job>, marker: string, framesOf: () => readonly ActingFrame[]): Promise<boolean> {
  const markerPath = join(jobFolder, MARKERS_FOLDER, marker);
  if (existsSync(markerPath)) return true;
  await WatcherFleet.sendFramesOnce(ports, markerPath, jobFolder, job.watcherInstance, framesOf());
  return existsSync(markerPath);
}

async function deliverInOrder(sends: readonly (() => Promise<boolean>)[]): Promise<void> {
  for (const send of sends) {
    if (!await send()) return;
  }
}

/**
 * User's messages to the job its session has not taken yet: no `message-<n>` marker, the one `deliverJobControls` writes once its Watcher
 * took the line. The Assistant numbers them among its chats, so its own markers count them.
 */
function unsentMessageCountOf(board: Pick<Board, 'logRecordsSoFar'>, trackerDirectory: string, job: Readonly<Job>): number {
  if (job.kind === 'assistant') return AssistantSession.unsentMessageCountOf(board, trackerDirectory, job);
  const markersFolder = join(WatcherFleet.jobFolderOf(trackerDirectory, job.id), MARKERS_FOLDER);
  const messageCount  = board.logRecordsSoFar().filter((record) => record.kind === 'job-messaged' && record.jobId === job.id).length;
  let unsent = 0;
  for (let number = 1; number <= messageCount; number += 1) {
    if (!existsSync(join(markersFolder, `message-${number}`))) unsent += 1;
  }
  return unsent;
}

async function deliverJobControls(request: JobControlDeliveryRequest): Promise<void> {
  const { board, adapter } = request;
  const messageCountByJob = new Map<string, number>();
  const messages = board.logRecordsSoFar().flatMap((record) => {
    if (record.kind !== 'job-messaged') return [];
    const number = (messageCountByJob.get(record.jobId) ?? 0) + 1;
    messageCountByJob.set(record.jobId, number);
    return [{
      jobId: record.jobId, number, text: record.fields.text, pictures: record.fields.pictures ?? []
    }];
  });
  for (const job of board.jobs()) {
    const jobFolder = WatcherFleet.jobFolderOf(request.trackerDirectory, job.id);
    // The Assistant takes User's messages only when idle, numbered among its chats by `src/services/overseer/AssistantSession.ts`.
    const messagesOfJob = job.kind === 'assistant' ? [] : messages.filter((candidate) => candidate.jobId === job.id);
    const sends = messagesOfJob.map((message) => async () => await sendOnce(
      request.platformPorts, jobFolder, job, `message-${message.number}`,
      () => [{ kind: 'write', line: adapter.chatLineOf(message.text, PictureStore.attachmentsOf(request.trackerDirectory, message.pictures)) }]
    ));
    if (job.stopRequest === 'wind-down' && job.state === 'running') {
      sends.push(async () => await sendOnce(request.platformPorts, jobFolder, job, 'wind-down', () => [{ kind: 'write', line: adapter.chatLineOf(request.windDownMessage) }]));
    }
    if (job.state === 'stopping' && SESSION_JOB_KINDS.includes(job.kind)) {
      sends.push(async () => await sendOnce(request.platformPorts, jobFolder, job, `input-closed-${job.watcherInstance}`, () => [{ kind: 'close-input' }]));
      if (job.stopRequest === 'stop') {
        sends.push(async () => await sendOnce(
          request.platformPorts, jobFolder, job, `stop-${job.watcherInstance}`, () => [{ kind: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS }]
        ));
      }
    }
    await deliverInOrder(sends);
  }
}

/** A job the hold ended whose session's Watcher was live before the hold: the instance that ran it. */
export interface EndedJobSession {
  jobId:           string;
  watcherInstance: number;
}

/**
 * Closes the input of each ended job's session, once, so the session exits and its Watcher ends: a job that left the board in the hold that
 * moved it on, such as a build that Customs ended, has no state that asks for the close. Answers the sessions whose close is still due: the
 * Watcher is live and did not take the frame yet.
 */
async function closeInputOfEndedJobs(ports: PlatformPorts, trackerDirectory: string, endedSessions: readonly EndedJobSession[]): Promise<EndedJobSession[]> {
  const stillDue: EndedJobSession[] = [];
  for (const ended of endedSessions) {
    const jobFolder  = WatcherFleet.jobFolderOf(trackerDirectory, ended.jobId);
    const markerPath = join(jobFolder, MARKERS_FOLDER, `input-closed-${ended.watcherInstance}`);
    await WatcherFleet.sendFramesOnce(ports, markerPath, jobFolder, ended.watcherInstance, [{ kind: 'close-input' }]);
    const taken = existsSync(markerPath) || WatcherFleet.livenessOf(ports, jobFolder, ended.watcherInstance).verdict !== 'live';
    if (!taken) stillDue.push(ended);
  }
  return stillDue;
}

export const JobControlDelivery = Object.freeze({ deliverJobControls, unsentMessageCountOf, closeInputOfEndedJobs });
