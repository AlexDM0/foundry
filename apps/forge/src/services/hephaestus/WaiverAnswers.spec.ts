/**
 * A pass acting on User's answer to a review's waiver. What matters: a grant whose stored proposals cannot be read waives nothing and ends
 * nothing; it opens one `system-file-unreadable` incident on the review job, which takes the step at no pass while it stands and asks for no
 * further pass, and a park on it ends the job, so the Playbook names the answer no more.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import { afterEach, expect, test }  from 'bun:test';

import type { PlaybookStep }                              from '../../domain/tracker-model/@types/PlaybookStep.ts';
import { boardFixture, ticketFixture }                    from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { WaiverAnswers }                                  from './WaiverAnswers.ts';

const AT = '2026-11-27T10:00:00+01:00';
const NEXT_PASS_AT = '2026-11-27T10:00:30+01:00';
const EXAMPLE_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const WAIVER_QUESTION = {
  question: 'Waive A2?', header: 'waiver', multiSelect: false, options: []
};

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

test('a grant whose proposals cannot be read opens the incident on the review once, asks for no pass while it stands, and a park ends the job', () => {
  const trackerDirectory = createScratchDirectory('waiver-answers');
  folders.push(trackerDirectory);
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-review', task: 1 })] });
  const { job: review } = board.launchJob({
    kind: 'review', role: 'reviewer', ticketIds: ['001'], parentJobId: null, attempt: 1, target: 'main'
  }, AT);
  for (const state of ['preparing', 'running', 'in-customs', 'gating', 'awaiting-answer'] as const) board.moveJob(review.id, state, AT);
  const { decision } = board.openDecision({
    kind: 'waiver', ticketIds: ['001'], jobId: review.id, askedBy: 'reviewer', requestId: null, questions: [WAIVER_QUESTION], context: ''
  }, AT);
  board.answerDecision(decision?.id ?? '', ['Grant'], AT);
  const reviewFolder = jobFolderIn(trackerDirectory, review.id);
  mkdirSync(reviewFolder, { recursive: true });
  writeFileSync(join(reviewFolder, 'waiver-proposals.json'), '[{"item": "A2", "reason": "The export was retired"}]');
  const steps: PlaybookStep[] = [{ kind: 'act-on-waiver-answer', jobId: review.id, answers: ['Grant'] }];
  const answeredWaiverTrees = new Map([[review.id, EXAMPLE_TREE]]);
  const passAt = (at: string): boolean => WaiverAnswers.actOnWaiverAnswers({ board, at } as unknown as BoardTransaction, steps, answeredWaiverTrees, trackerDirectory);

  expect(passAt(AT)).toBe(false);
  expect(passAt(NEXT_PASS_AT)).toBe(false);

  expect(board.incidents().map((incident) => [incident.kind, incident.jobId, incident.facts['file']])).toEqual([
    ['system-file-unreadable', review.id, `jobs/${review.id}/waiver-proposals.json`],
  ]);
  expect(board.jobById(review.id)?.state).toBe('awaiting-answer');
  board.parkTicket('001', 'Example reason', board.incidents()[0]?.id ?? '', NEXT_PASS_AT);
  expect(board.jobById(review.id)).toBeUndefined();
});
