/**
 * The incident line and its drawer in a happy-dom document. What matters: four defaults are one alert line, not four, naming the newest
 * default's id, move, ticket and clock; its button opens and closes the Incidents drawer, saying so; the drawer closes like any popover, on
 * Esc (handled, so neither a side panel nor an embedding page takes it too, the focus back on the button) or a pointer down outside, and
 * when a link in it is followed; the newest default starts unfolded and one row unfolds at a time, its trail in order with the applied
 * default marked; a delivery links its Assistant job; Mark defaults seen tells the shell and closes the drawer; and with every default seen
 * nothing renders, an open drawer closing with its line.
 */
import {
  act,
  cleanup,
  fireEvent,
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

import type { ConversationBoardDocument }                                      from '../@types/ConversationDocuments.ts';
import { EXAMPLE_INCIDENT_DAY, EXAMPLE_INCIDENT_SLICES, exampleIncidentBoard } from '../testing/IncidentNoticeFixture.ts';
import { IncidentNotice }                                                      from './IncidentNotice.tsx';
import { IncidentNoticeModelUtil }                                             from './IncidentNoticeModel.ts';

const FORMAT = { todayCalendarDate: EXAMPLE_INCIDENT_DAY, slices: EXAMPLE_INCIDENT_SLICES };

function renderNotice(board: ConversationBoardDocument = exampleIncidentBoard(), seen: readonly string[] = []) {
  const marks: string[] = [];
  render(
    <>
      <IncidentNotice model={IncidentNoticeModelUtil.incidentNoticeModelOf(board, seen, FORMAT)} onMarkSeen={() => marks.push('marked')} />
      <button type="button">Outside</button>
    </>,
  );
  return { marks };
}

function toggle(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>('button', { name: /incidents$/u });
}

function drawer(): HTMLElement | null {
  return screen.queryByRole('region', { name: 'Incidents' });
}

function rowToggle(incidentId: string): HTMLElement {
  return screen.getByRole('button', { name: new RegExp(`^${incidentId} `, 'u') });
}

afterEach(cleanup);

describe('the incident line', () => {
  test('four defaults are one alert line naming the newest default\'s id, move, ticket and clock', () => {
    renderNotice();
    const [line, ...others] = screen.getAllByRole('alert');
    expect(others).toEqual([]);
    expect(line?.textContent).toBe('4 incident defaults, 2 open incidents.Newest: I4 took its default, job-fresh on #001, at 22:40.Show incidents');
    expect(within(line ?? document.body).getByRole('link', { name: '#001' }).getAttribute('href')).toBe('#tickets/ticket-row/001');
  });

  test('with every default seen nothing renders', () => {
    renderNotice(exampleIncidentBoard(), ['I1', 'I2', 'I3', 'I4']);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.querySelector('.bridge-incident-notice')).toBeNull();
  });
});

describe('the drawer', () => {
  test('opens and closes from the line\'s button, which says so and names the drawer it controls', () => {
    renderNotice();
    expect(drawer()).toBeNull();
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle());
    expect(drawer()).not.toBeNull();
    expect(toggle().textContent).toBe('Hide incidents');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(toggle().getAttribute('aria-controls') ?? '')?.contains(drawer())).toBe(true);
    fireEvent.click(toggle());
    expect(drawer()).toBeNull();
    expect(toggle().textContent).toBe('Show incidents');
  });

  test('Esc closes it, handled, and hands the focus back to the line\'s button', () => {
    renderNotice();
    fireEvent.click(toggle());
    rowToggle('I3').focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(true);
    expect(drawer()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  test('a drawer whose line went away is closed: it takes no Esc, and a new default brings the line back closed', () => {
    const modelOf = (seen: readonly string[]) => IncidentNoticeModelUtil.incidentNoticeModelOf(exampleIncidentBoard(), seen, FORMAT);
    const { rerender } = render(<IncidentNotice model={modelOf([])} onMarkSeen={() => undefined} />);
    fireEvent.click(toggle());
    rerender(<IncidentNotice model={modelOf(['I1', 'I2', 'I3', 'I4'])} onMarkSeen={() => undefined} />);
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.dispatchEvent(escape);
    });
    expect(escape.defaultPrevented).toBe(false);
    rerender(<IncidentNotice model={modelOf(['I1', 'I2', 'I3'])} onMarkSeen={() => undefined} />);
    expect([drawer(), toggle().textContent]).toEqual([null, 'Show incidents']);
  });

  test('a pointer down outside closes it, and so does a link in it once followed', () => {
    renderNotice();
    fireEvent.click(toggle());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Outside' }));
    expect(drawer()).toBeNull();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('link', { name: 'Assistant view' }));
    expect(drawer()).toBeNull();
  });

  test('sums up and lists the open incidents, then the defaults newest first', () => {
    renderNotice();
    fireEvent.click(toggle());
    expect(drawer()?.querySelector('.design-system-pane-count')?.textContent).toBe('2 open · 4 defaults applied');
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Open 2', 'Defaults applied 4']);
    expect(within(screen.getByRole('list', { name: 'Defaults applied' })).getAllByRole('button').map((row) => row.textContent)).toEqual([
      'I4resume-failed', 'I3gate-cannot-run', 'I2setup-failed', 'I1gate-cannot-run',
    ]);
  });

  test('the newest default starts unfolded; unfolding another row folds it, its trail in order with the applied default marked', () => {
    renderNotice();
    fireEvent.click(toggle());
    expect(rowToggle('I4').getAttribute('aria-expanded')).toBe('true');
    const trail = screen.getByRole('list', { name: 'Trail of I4' });
    expect(within(trail).getAllByRole('listitem').map((line) => [line.textContent, line.getAttribute('data-mark')])).toEqual([
      ['22:33opened: resume-failed on #001', null],
      ['22:40default applied: job-fresh, as its delivery turn closed', 'alert'],
    ]);
    fireEvent.click(rowToggle('I2'));
    expect(rowToggle('I4').getAttribute('aria-expanded')).toBe('false');
    expect(rowToggle('I2').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('list', { name: 'Trail of I4' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Trail of I2' })).toBeDefined();
  });

  test('an open row says what it waits for and a delivery in its trail links the Assistant\'s job', () => {
    renderNotice();
    fireEvent.click(toggle());
    const waiting = rowToggle('I6').closest('li') as HTMLElement;
    expect(waiting.querySelector('.bridge-incident-meta')?.textContent).toBe(' · opened 22:42 · default gate-retry · waits for J1\'s next turn');
    expect(waiting.querySelector('.design-system-state-badge')?.textContent).toBe('waiting for the Assistant');
    fireEvent.click(rowToggle('I5'));
    const trail = screen.getByRole('list', { name: 'Trail of I5' });
    expect(within(trail).getByRole('link', { name: 'J1' }).getAttribute('href')).toBe('#agents/J1');
    expect(within(trail).getAllByRole('listitem')[1]?.textContent).toBe('delivered in chat 14 to J1');
  });

  test('Mark defaults seen tells the shell and closes the drawer', () => {
    const { marks } = renderNotice();
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole('button', { name: 'Mark defaults seen' }));
    expect(marks).toEqual(['marked']);
    expect(drawer()).toBeNull();
  });
});
