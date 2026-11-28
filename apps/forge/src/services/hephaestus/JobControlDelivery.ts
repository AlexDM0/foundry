/**
 * After the hold, the frames User's job controls ask of a live child: chat lines with their pictures, wind-downs, quits and stops. A frame
 * waits until its child is live, and a marker written once it was taken keeps a restart from sending it again, unless Hephaestus died
 * before the marker: delivery is at least once.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join }                        from 'node:path';

import type { ChildInput }                 from '../../domain/talos/@types/TalosFrame.ts';
import type { Job, JobKind }               from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                      from '../../domain/tracker-model/Board.ts';
import type { AgentAdapter }               from '../../lib/agent-launch/AgentAdapter.ts';
import { SESSION_STOP_GRACE_MILLISECONDS } from '../../shared/constants/HephaestusLimits.ts';
import { PictureStore }                    from '../tracker/PictureStore.ts';
import { AssistantSession }                from './AssistantSession.ts';
import type { BoardChildren }              from './BoardChildren.ts';
import { jobFolderIn }                     from './HephaestusFiles.ts';

export interface JobControlDeliveryRequest {
  boardChildren:    BoardChildren;
  trackerDirectory: string;
  board:            Pick<Board, 'jobs' | 'logRecordsSoFar'>;
  adapter:          Pick<AgentAdapter, 'chatLineOf'>;
  windDownMessage:  string;
}

const MARKERS_FOLDER = 'control-frames';

const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner', 'pipeline-agent', 'document-agent'];

/** What one control asks of the job's session: its input, or a stop after the grace. */
type ControlAct = { kind: 'input'; inputs: readonly ChildInput[] } | { kind: 'stop'; graceMilliseconds: number };

/**
 * Whether the act was taken, on this pass or an earlier one: a later act of the job waits on an earlier one, so none overtakes it. The
 * act is built only for a send, so a taken message's pictures are not read again. A stop's marker, like an input's, is written only once taken.
 */
async function sendOnce(children: BoardChildren, jobFolder: string, job: Readonly<Job>, marker: string, actOf: () => ControlAct): Promise<boolean> {
  const markerPath = join(jobFolder, MARKERS_FOLDER, marker);
  if (existsSync(markerPath)) return true;
  const act = actOf();
  if (act.kind === 'input') {
    await children.sendInputOnce(markerPath, jobFolder, job.childInstance, act.inputs);
  } else if (children.livenessOf(jobFolder, job.childInstance).verdict === 'live' && await children.stop(jobFolder, job.childInstance, act.graceMilliseconds)) {
    mkdirSync(dirname(markerPath), { recursive: true });
    writeFileSync(markerPath, '');
  }
  return existsSync(markerPath);
}

async function deliverInOrder(sends: readonly (() => Promise<boolean>)[]): Promise<void> {
  for (const send of sends) {
    if (!await send()) return;
  }
}

/**
 * User's messages to the job its session has not taken yet: no `message-<n>` marker, the one `deliverJobControls` writes once its child
 * took the line. The Assistant numbers them among its chats, so its own markers count them.
 */
function unsentMessageCountOf(board: Pick<Board, 'logRecordsSoFar'>, trackerDirectory: string, job: Readonly<Job>): number {
  if (job.kind === 'assistant') return AssistantSession.unsentMessageCountOf(board, trackerDirectory, job);
  const markersFolder = join(jobFolderIn(trackerDirectory, job.id), MARKERS_FOLDER);
  const messageCount  = board.logRecordsSoFar().filter((record) => record.kind === 'job-messaged' && record.jobId === job.id).length;
  let unsent = 0;
  for (let number = 1; number <= messageCount; number += 1) {
    if (!existsSync(join(markersFolder, `message-${number}`))) unsent += 1;
  }
  return unsent;
}

function inputOf(line: string): ControlAct {
  return { kind: 'input', inputs: [{ act: 'write-line', line }] };
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
    const children  = request.boardChildren;
    const jobFolder = children.jobFolderOf(job.id);
    // The Assistant takes User's messages only when idle, numbered among its chats by `src/services/hephaestus/AssistantSession.ts`.
    const messagesOfJob = job.kind === 'assistant' ? [] : messages.filter((candidate) => candidate.jobId === job.id);
    const sends = messagesOfJob.map((message) => async () => await sendOnce(
      children, jobFolder, job, `message-${message.number}`,
      () => inputOf(adapter.chatLineOf(message.text, PictureStore.attachmentsOf(request.trackerDirectory, message.pictures)))
    ));
    // The Assistant's chats are numbered against its results, so its wind-down is its input closing once it is idle, never an extra chat.
    if (job.stopRequest === 'wind-down' && job.state === 'running' && job.kind !== 'assistant') {
      sends.push(async () => await sendOnce(children, jobFolder, job, 'wind-down', () => inputOf(adapter.chatLineOf(request.windDownMessage))));
    }
    if (job.state === 'stopping' && SESSION_JOB_KINDS.includes(job.kind)) {
      sends.push(async () => await sendOnce(children, jobFolder, job, `input-closed-${job.childInstance}`, () => ({ kind: 'input', inputs: [{ act: 'quit-at-turn-end' }] })));
      // A document agent's stop ends its running turn: its session stops after the grace, and the session stays to be resumed.
      if (job.stopRequest === 'stop' || job.kind === 'document-agent') {
        sends.push(async () => await sendOnce(
          children, jobFolder, job, `stop-${job.childInstance}`, () => ({ kind: 'stop', graceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS })
        ));
      }
    }
    await deliverInOrder(sends);
  }
}

/** A job the hold ended whose session's child was live before the hold: the instance that ran it. */
export interface EndedJobSession {
  jobId:         string;
  childInstance: number;
}

/**
 * Asks each ended job's session, once, to quit at the end of its turn, so the session exits and its child ends: a job that left the board in
 * the hold that moved it on, such as a build that Customs ended, has no state that asks for the quit. Answers the sessions whose quit is
 * still due: the child is live and did not take the frame yet.
 */
async function quitSessionsOfEndedJobs(children: BoardChildren, endedSessions: readonly EndedJobSession[]): Promise<EndedJobSession[]> {
  const stillDue: EndedJobSession[] = [];
  for (const ended of endedSessions) {
    const jobFolder  = children.jobFolderOf(ended.jobId);
    const markerPath = join(jobFolder, MARKERS_FOLDER, `input-closed-${ended.childInstance}`);
    await children.sendInputOnce(markerPath, jobFolder, ended.childInstance, [{ act: 'quit-at-turn-end' }]);
    const taken = existsSync(markerPath) || children.livenessOf(jobFolder, ended.childInstance).verdict !== 'live';
    if (!taken) stillDue.push(ended);
  }
  return stillDue;
}

export const JobControlDelivery = Object.freeze({ deliverJobControls, unsentMessageCountOf, quitSessionsOfEndedJobs });
