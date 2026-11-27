/**
 * The Intake tab in the board's shell, with the board's own tab views. What matters: the shell draws the Intake view itself at the route,
 * and the view follows a session's transcript through the board's services.
 */
import {
  act,
  cleanup,
  render,
  screen
} from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import type { BoardDocument }                                 from '../../../@types/board/BoardDocument.ts';
import type { BoardRoute }                                    from '../../../shared/BoardRouter.ts';
import type { BoardServices }                                 from '../../@types/BoardServices.ts';
import { BoardApp }                                           from '../../shell/BoardApp.tsx';
import { boardStateFixture, FIXTURE_NOW, FIXTURE_TRACKER_ID } from '../../testing/BoardStateFixture.ts';
import { fakeTranscripts }                                    from '../../testing/FakeControls.ts';
import { productOwnerJob, sessionRecord }                     from '../../testing/IntakeBoardFixture.ts';
import { createManualFlintFrames }                            from '../../testing/ManualFlintFrames.ts';
import { pipelineBoardStateOf }                               from '../../testing/PipelineFixture.ts';


const INTAKE_BOARD: BoardDocument = boardStateFixture({
  pipeline:        pipelineBoardStateOf('A5').pipeline,
  jobs:            [productOwnerJob({ id: 'J7', state: 'running', intake: { text: 'Saved baskets', title: null } })],
  questionHistory: [sessionRecord('job-launched', 'J7', { kind: 'product-owner', ticketIds: [] })],
  // No open question, so the question panel beside the drawn tab follows no transcript of its own.
  decisions:       [],
  openDecisionIds: [],
});

afterEach(cleanup);

function servicesOf(followTranscript: BoardServices['followTranscript'], answerRead: (answer: (board: BoardDocument) => void) => void): BoardServices {
  return {
    trackerId:           FIXTURE_TRACKER_ID,
    commandClient:       { send: () => Promise.resolve({ verdict: 'unreachable' }) },
    pictureUploadClient: { upload: () => Promise.resolve({ verdict: 'unreachable' }) },
    readBoard:           () => new Promise((resolve) => answerRead((board) => resolve({ verdict: 'read', board }))),
    openEventStream:     () => ({ close: () => undefined }),
    followTranscript,
    followProfileLog:    () => () => undefined,
    storage:             () => ({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }),
    now:                 () => FIXTURE_NOW,
    questionNotifier:    {
      allowance:         () => 'denied',
      askAllowance:      () => Promise.resolve('denied'),
      notify:            () => undefined,
      setDocumentTitle:  () => undefined,
      baseDocumentTitle: 'Example board',
    },
    goTo:             () => undefined,
    flintFrameSource: createManualFlintFrames().frameSource,
  };
}

test('the board draws the Intake tab itself and follows the session through its services', async () => {
  const transcripts = fakeTranscripts();
  const pendingReads: ((board: BoardDocument) => void)[] = [];
  const route: BoardRoute = { tab: 'intake', item: 'J7' };
  render(
    <BoardApp
      services={servicesOf(transcripts.follow, (answer) => pendingReads.push(answer))}
      route={route}
      project="Example Agency"
    />,
  );
  await act(async () => {
    pendingReads.splice(0).forEach((answer) => answer(INTAKE_BOARD));
    await Promise.resolve();
  });
  expect(screen.getByRole('region', { name: 'Product-owner sessions' })).toBeDefined();
  expect(screen.getByRole('region', { name: 'Intake J7' })).toBeDefined();
  expect(transcripts.followedJobs()).toEqual(['J7']);
});
