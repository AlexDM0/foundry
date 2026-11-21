/**
 * The Progress tab opened through the board's shell and its table of tab views, in a happy-dom document. What matters: the shell draws the
 * chart and the finished-work card under it in its main area, with no frame for an unmoved tab.
 */
import {
  cleanup,
  render,
  screen,
  within
} from '@testing-library/react';
import { afterEach, expect, test } from 'bun:test';

import type { BoardDocument }                                               from '../../../@types/board/BoardDocument.ts';
import type { BoardServices }                                               from '../../@types/BoardServices.ts';
import { BoardApp }                                                         from '../../shell/BoardApp.tsx';
import { BOARD_TAB_VIEWS }                                                  from '../../shell/BoardTabViews.tsx';
import { FIXTURE_NOW, FIXTURE_TRACKER_ID }                                  from '../../testing/BoardStateFixture.ts';
import { createManualFlintFrames }                                          from '../../testing/ManualFlintFrames.ts';
import { pipelineBoardStateOf }                                             from '../../testing/PipelineFixture.ts';
import { exampleProgressBoard, exampleProgressTask, exampleProgressTicket } from '../../testing/ProgressBoardFixture.ts';

const UNMOVED_AREA_TEXT = 'The frame for an unmoved tab';

/** With a readable pipeline, so the board shows every tab and does not send the route to Pipeline. */
const BOARD = {
  ...exampleProgressBoard({
    tasks: [
      exampleProgressTask(1, {
        name: '#5 Build the example', status: 'delivered', ticket: '5', start: '2026-09-18T09:00:00+02:00', end: '2026-09-18T11:00:00+02:00'
      }),
    ],
    tickets:    [exampleProgressTicket('5', { title: 'Build the example', status: 'delivered', delivered: '2026-10-29T11:00:00' })],
    ticketRows: { 5: { ownTaskId: 1 } },
  }),
  pipeline: pipelineBoardStateOf('A5').pipeline,
};

function servicesAnswering(board: BoardDocument): BoardServices {
  const storage = new Map<string, string>();
  return {
    trackerId:           FIXTURE_TRACKER_ID,
    commandClient:       { send: () => Promise.resolve({ verdict: 'applied', outcome: 'done', result: { startedJobId: null } }) },
    pictureUploadClient: { upload: () => Promise.resolve({ verdict: 'unreachable' }) },
    readBoard:           () => Promise.resolve({ verdict: 'read', board }),
    openEventStream:     () => ({ close: () => undefined }),
    followTranscript:    () => ({ close: () => undefined }),
    followProfileLog:    () => () => undefined,
    storage:             () => ({
      getItem:    (key) => storage.get(key) ?? null,
      setItem:    (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    }),
    now:              () => FIXTURE_NOW,
    questionNotifier: {
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

afterEach(() => {
  cleanup();
});

test('the shell draws the Progress tab from its table of tab views: the chart, then the finished-work card, and no frame', async () => {
  render(
    <BoardApp
      services={servicesAnswering(BOARD)}
      route={{ tab: 'progress', item: null }}
      project="Example Agency"
      unmovedTabArea={() => <p>{UNMOVED_AREA_TEXT}</p>}
      tabViews={BOARD_TAB_VIEWS}
    />
  );
  const heading = await screen.findByRole('heading', { level: 2, name: 'Progress' });
  const mainArea = screen.getByRole('main');
  expect(mainArea.getAttribute('data-tab')).toBe('progress');
  expect(mainArea.contains(heading)).toBe(true);
  const finishedWork = within(mainArea).getByRole('region', { name: 'Finished work' });
  expect(within(finishedWork).getByText('Build the example')).toBeDefined();
  expect(screen.queryByText(UNMOVED_AREA_TEXT)).toBeNull();
});
