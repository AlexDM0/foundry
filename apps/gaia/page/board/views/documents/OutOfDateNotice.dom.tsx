/**
 * The notice over a plan the spec moved under, in a happy-dom document. What matters: it names the approval it outlived and the spec's
 * changed item old and new, links the spec, and shows the plan agent's update only while one is proposed.
 */
import { cleanup, fireEvent, screen } from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { renderOnBoard }            from '../../testing/OnBoard.ts';
import { DOCUMENT_STATES }          from '../../testing/TicketDocumentsFixture.ts';
import { OutOfDateNotice }          from './OutOfDateNotice.tsx';
import { TicketDocumentsViewModel } from './TicketDocumentsViewModel.ts';

afterEach(cleanup);

const [, PLAN] = DOCUMENT_STATES.planOutOfDate.documents;

const NOTICE = PLAN === undefined ? null : TicketDocumentsViewModel.outOfDateNoticeOf(PLAN);

describe('the out-of-date notice (artboard 8)', () => {
  test('names the approval it outlived, the spec\'s change old and new, and links the spec and the plan agent\'s update', () => {
    if (NOTICE === null) throw new Error('no notice');
    let shown = 0;
    renderOnBoard(<OutOfDateNotice notice={NOTICE} specHref="#spec" onShowUpdate={() => (shown += 1)} />);
    expect(screen.getByText('You approved plan v3 on spec v5. Spec v6 changed A2. The build waits until this plan is approved again.')).toBeTruthy();
    expect(screen.getByText('Switching the system setting re-themes an open page within one frame.').className).toBe('board-document-removed');
    expect(screen.getByText('Switching the system setting re-themes an open page within 100 ms, without a reload.').className).toBe('board-document-inserted');
    expect(screen.getByRole('link', { name: 'Open the spec change' }).getAttribute('href')).toBe('#spec');
    fireEvent.click(screen.getByRole('button', { name: 'See the proposed plan update' }));
    expect(shown).toBe(1);
  });

  test('offers no update while the plan agent proposes none', () => {
    if (NOTICE === null) throw new Error('no notice');
    renderOnBoard(<OutOfDateNotice notice={NOTICE} specHref="#spec" onShowUpdate={null} />);
    expect(screen.queryByRole('button', { name: 'See the proposed plan update' })).toBeNull();
  });
});
