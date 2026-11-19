/**
 * Delivers each answered question to its session after the answering hold, design section 8.2: a live child still holding the request gets
 * the `control_response` allow with the answers; a resumed session gets them as its first user line. A marker per request in the job's
 * folder, written only after Talos took the line, keeps a later pass or restart from delivering the answer again, unless the Overseer
 * died before the marker: delivery is at least once, and how the vendor takes a repeated `control_response` was never probed.
 */
import { createHash }                from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { join }                      from 'node:path';

import type { AgentAdapter }               from '../../lib/agent-launch/AgentAdapter.ts';
import type { AgentQuestion }              from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { DecisionAnswer }             from '../../lib/tracker-model/@types/Decision.ts';
import type { Job }                        from '../../lib/tracker-model/@types/Job.ts';
import type { LogRecord }                  from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }                      from '../../lib/tracker-model/Board.ts';
import { SESSION_STOP_GRACE_MILLISECONDS } from '../../shared/constants/OverseerLimits.ts';
import type { BoardChildren }              from './BoardChildren.ts';
import { JobResumption }                   from './JobResumption.ts';

const MARKER_DIGEST_LENGTH_CHARACTERS = 16;

export interface AnswerDeliveryRequest {
  boardChildren:             BoardChildren;
  board:                     Board;
  adapter:                   AgentAdapter;
  /** True: the vendor takes the answer as a `control_response`; false: the Overseer stops the child and resumes the session with it. */
  deliversByControlResponse: boolean;
  /** The answer worded as a plain user message, for a session that no longer holds the request. */
  answerMessageOf:           (answer: DecisionAnswer) => string;
}

function digestOf(requestId: string): string {
  return createHash('sha256').update(requestId).digest('hex').slice(0, MARKER_DIGEST_LENGTH_CHARACTERS);
}

function deliveredMarkerOf(jobFolder: string, requestId: string): string {
  return join(jobFolder, `answer-${digestOf(requestId)}.delivered`);
}

/** Written before the stop frame of the fallback, so the pass that finds the child ended interrupts it `answer-delivery`, never a crash. */
function answerStopMarkerOf(jobFolder: string, instance: number): string {
  return join(jobFolder, `answer-delivery-stop-${instance}`);
}

function answerOf(logRecords: readonly LogRecord[], requestId: string): DecisionAnswer | null {
  const answered = logRecords.findLast((record) => record.kind === 'decision-answered' && record.fields.requestId === requestId);
  return answered?.kind === 'decision-answered' ? answered.fields.answer : null;
}

function undeliveredRequestIdsOf(children: BoardChildren, job: Readonly<Job>): string[] {
  const jobFolder = children.jobFolderOf(job.id);
  return job.answeredRequestIds.filter((requestId) => !existsSync(deliveredMarkerOf(jobFolder, requestId)));
}

/** The question as this instance's session asked it, or `null` when another instance asked it and this one never held the request. */
function questionsAskedInInstance(
  children: BoardChildren, jobFolder: string, instance: number, adapter: AgentAdapter, requestId: string
): readonly AgentQuestion[] | null {
  const entries = children.eventsAfter(jobFolder, instance, 0);
  if (entries === 'malformed') return null;
  for (const entry of entries) {
    if (entry.origin !== 'agent') continue;
    const asked = adapter.eventsOf(entry.line).find((event) => event.kind === 'question' && event.requestId === requestId);
    if (asked?.kind === 'question') return asked.questions;
  }
  return null;
}

async function deliverOne(request: AnswerDeliveryRequest, job: Readonly<Job>, requestId: string, answer: DecisionAnswer): Promise<void> {
  const children  = request.boardChildren;
  const jobFolder = children.jobFolderOf(job.id);
  const asked     = questionsAskedInInstance(children, jobFolder, job.childInstance, request.adapter, requestId);
  if (asked !== null && !request.deliversByControlResponse) {
    const stopMarker = answerStopMarkerOf(jobFolder, job.childInstance);
    if (existsSync(stopMarker)) return;
    writeFileSync(stopMarker, '');
    await children.stop(jobFolder, job.childInstance, SESSION_STOP_GRACE_MILLISECONDS);
    return;
  }
  const line = asked === null
    ? request.adapter.chatLineOf(request.answerMessageOf(answer))
    : request.adapter.answerLineOf(requestId, asked, answer);
  if (!await children.sendInput(jobFolder, job.childInstance, { act: 'write-line', line })) return;
  if (asked === null) JobResumption.recordAnswerAsResumeLine(jobFolder, job.childInstance);
  writeFileSync(deliveredMarkerOf(jobFolder, requestId), '');
}

/** Every running job's answered, undelivered requests, each to its live child; a child not yet running is tried on the next pass. */
async function deliverAnswers(request: AnswerDeliveryRequest): Promise<void> {
  const logRecords = request.board.logRecordsSoFar();
  for (const job of request.board.jobs()) {
    if (job.state !== 'running') continue;
    const jobFolder = request.boardChildren.jobFolderOf(job.id);
    if (request.boardChildren.livenessOf(jobFolder, job.childInstance).verdict !== 'live') continue;
    for (const requestId of undeliveredRequestIdsOf(request.boardChildren, job)) {
      const answer = answerOf(logRecords, requestId);
      if (answer !== null) await deliverOne(request, job, requestId, answer);
    }
  }
}

/** A resumed session with an answer to deliver takes the answer as its first line, never the resume message. */
function answerAwaitsDelivery(children: BoardChildren, job: Readonly<Job>): boolean {
  return undeliveredRequestIdsOf(children, job).length > 0;
}

/** The Overseer stopped this instance itself to deliver an answer: its end is an `answer-delivery` interruption, never counted. */
function stoppedForAnswerDelivery(children: BoardChildren, job: Readonly<Job>): boolean {
  return existsSync(answerStopMarkerOf(children.jobFolderOf(job.id), job.childInstance));
}

export const AnswerDelivery = Object.freeze({
  deliverAnswers,
  answerAwaitsDelivery,
  stoppedForAnswerDelivery,
});
