/**
 * The Merge queue detail in a happy-dom document. What matters: with merge approval on, the tickets waiting for merge show in a list of
 * their own, apart from the queued candidates, each with its prediction and a link to its detail panel; with merge approval off no such
 * list shows.
 */
import {
  cleanup,
  render,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { QUEUED_TARGET }   from '../../testing/BoardStateFixture.ts';
import { MergeQueueModel } from './MergeQueueModel.ts';
import { MergeQueueView }  from './MergeQueueView.tsx';

const WAITING_TARGET = {
  ...QUEUED_TARGET,
  waitingForMerge: [
    {
      ticketId: '11', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
    },
    {
      ticketId: '12', priority: 'low', againstTarget: 'conflicting', conflictedFiles: ['src/Example.ts']
    },
  ],
} as const;

function renderedTarget(target: typeof QUEUED_TARGET): void {
  render(<MergeQueueView targets={MergeQueueModel.mergeQueueModelOf({ targets: [target] }, [])} />);
}

afterEach(() => {
  cleanup();
});

describe('merge approval on', () => {
  test('the waiting tickets show apart from the queued candidates, each with its prediction and a link to its detail', () => {
    renderedTarget(WAITING_TARGET);
    const waiting = within(screen.getByRole('region', { name: 'Waiting for merge into main' }));
    expect(waiting.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['#11 normal · clean', '#12 low · conflicts in src/Example.ts']);
    expect(waiting.getByRole('link', { name: '#12' }).getAttribute('href')).toBe('#tickets/ticket-row/12');
    const queuedLines = [...document.querySelectorAll('ol.bridge-merge-lines > li')].map((item) => item.textContent);
    expect(queuedLines).toEqual(['#8 high · clean · would conflict with 1 clean candidate', '#9 normal · conflicts in src/Example.ts']);
  });
});

describe('merge approval off', () => {
  test('no waiting list shows', () => {
    renderedTarget(QUEUED_TARGET);
    expect(screen.queryByRole('region', { name: /Waiting for merge/u })).toBeNull();
    expect(screen.queryByText('Waiting for merge')).toBeNull();
  });
});
