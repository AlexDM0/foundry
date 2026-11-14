/**
 * The Merge queue detail in a happy-dom document. What matters: with merge approval on, the tickets waiting for merge show in a list of
 * their own, apart from the queued candidates, each with its forecast pill and a link to its detail panel; with merge approval off no such
 * list shows.
 * The view is a workplace of Flint.
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

/** A line's parts as shown: its id, its priority mark when not normal, its forecast pill, then its files or what it would cause. */
function linePartsOf(line: HTMLElement): (string | null)[] {
  return [...line.children].map((part) => part.textContent);
}

afterEach(() => {
  cleanup();
});

describe('merge approval on', () => {
  test('the waiting tickets show apart from the queued candidates, each with its prediction and a link to its detail', () => {
    renderedTarget(WAITING_TARGET);
    const waiting = within(screen.getByRole('region', { name: 'Waiting for merge into main' }));
    expect(waiting.getAllByRole('listitem').map(linePartsOf)).toEqual([['#11', 'clean'], ['#12', 'low', 'conflicting', 'src/Example.ts']]);
    expect(waiting.getByRole('link', { name: '#12' }).getAttribute('href')).toBe('#tickets/ticket-row/12');
    const queuedLines = [...document.querySelectorAll<HTMLElement>('ol.bridge-merge-lines > li')].map(linePartsOf);
    expect(queuedLines).toEqual([['#8', 'high', 'clean', 'would conflict with 1 clean candidate'], ['#9', 'conflicting', 'src/Example.ts']]);
    const forecastStates = [...document.querySelectorAll('ol.bridge-merge-lines .bridge-state-badge')].map((badge) => badge.getAttribute('data-state'));
    expect(forecastStates).toEqual(['reviewed', 'draft']);
  });
});

describe('merge approval off', () => {
  test('no waiting list shows', () => {
    renderedTarget(QUEUED_TARGET);
    expect(screen.queryByRole('region', { name: /Waiting for merge/u })).toBeNull();
    expect(screen.queryByText('Waiting for merge')).toBeNull();
  });
});

test('the view is a workplace of Flint', () => {
  renderedTarget(QUEUED_TARGET);
  expect(screen.getByRole('region', { name: 'Merge queue' }).hasAttribute('data-flint-workplace')).toBe(true);
});
