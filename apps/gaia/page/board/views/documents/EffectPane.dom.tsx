/**
 * The effect pane in a happy-dom document. What matters: it says what the reading read, lists the tree with each place's mark and
 * reference, its roots marked, a removed file marked for striking and a folded row with its file count, names the unresolved places,
 * each a card with its reason and hint, Refresh asks for a reading of the head, and × closes it.
 */
import {
  cleanup,
  fireEvent,
  screen,
  within
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { clickSettled, fakeControls, SENT_COMMAND_VERSION } from '../../testing/FakeControls.ts';
import { onBoard }                                          from '../../testing/OnBoard.ts';
import { PLAN_EFFECT_READING }                              from '../../testing/TicketDocumentsFixture.ts';
import { EffectPane }                                       from './EffectPane.tsx';

afterEach(cleanup);

describe('the effect pane (artboard 7)', () => {
  test('lists the places with their marks, names the unresolved ones, refreshes the head and closes', async () => {
    const controls = fakeControls();
    let closed = 0;
    controls.render(onBoard(<EffectPane place={{ ticketId: '004', document: 'plan' }} reading={PLAN_EFFECT_READING} headNumber={2} onClose={() => (closed += 1)} />));
    const pane = screen.getByRole('region', { name: 'Effect in repo' });
    expect(within(pane).getByText('From plan v2 and the file tree only. No code read. 1.4s')).toBeTruthy();
    expect(within(pane).getByText('ThemeResolver.ts').closest('[data-change]')?.getAttribute('data-change')).toBe('adds');
    expect(within(pane).getByText('Unresolved · 2')).toBeTruthy();
    expect(within(pane).getAllByText('networkUtil.ts').map((name) => name.closest('[data-change]')?.getAttribute('data-change'))).toEqual(['unresolved', 'unresolved']);
    expect(within(pane).getByText('Could be either of 2 files in the tree.').closest('.board-document-unresolved-item')).toBeTruthy();
    expect(within(pane).getByText('No matching file or folder.').className).toBe('board-document-unresolved-reason');
    expect(within(pane).getByText('Say where it lives, or that it is new.')).toBeTruthy();
    await clickSettled(within(pane).getByRole('button', { name: 'Refresh' }));
    expect<unknown[]>(controls.sent).toEqual([{
      ...SENT_COMMAND_VERSION, kind: 'ticket-document-effect-read', ticketId: '004', document: 'plan', version: 2
    }]);
    fireEvent.click(within(pane).getByRole('button', { name: 'Close the picture' }));
    expect(closed).toBe(1);
  });

  test('draws a top folder\'s folders as roots, a removed file struck and the files one reference changes alike as one counted row', () => {
    fakeControls().render(onBoard(<EffectPane place={{ ticketId: '004', document: 'plan' }} reading={PLAN_EFFECT_READING} headNumber={2} onClose={() => undefined} />));
    const pane = screen.getByRole('region', { name: 'Effect in repo' });
    const roots = [...pane.querySelectorAll('.board-document-tree-row[data-root]')].map((row) => row.textContent);
    expect(roots).toEqual(['apps/storefront/src/', 'packages/contracts/', 'packages/shared/utils/']);
    expect(within(pane).getByText('light-only.css').closest('[data-change]')?.getAttribute('data-change')).toBe('removes');
    expect(within(pane).getByText('7 files').closest('.board-document-tree-name')?.textContent).toBe('every file · 7 files');
  });

  test('a reading on its way offers no second one', () => {
    const reading = { ...PLAN_EFFECT_READING, state: 'reading' as const };
    fakeControls().render(onBoard(<EffectPane place={{ ticketId: '004', document: 'plan' }} reading={reading} headNumber={2} onClose={() => undefined} />));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Refresh' }).disabled).toBe(true);
  });
});
