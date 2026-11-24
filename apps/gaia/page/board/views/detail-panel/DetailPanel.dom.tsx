/**
 * The detail panel in a happy-dom document, against a fake command client. What matters: the body reaches the DOM only as the `srcdoc` of
 * a frame whose `sandbox` is exactly the design's, and a planted payload (an `onerror` image, a script, a `javascript:` link) in it runs
 * nothing and never reaches the panel's own document; the frame takes the page's stylesheets and theme and follows a theme change; a card
 * opens the ticket form (its Overview: Other moves and Facts, Next only with a forecast; its Timeline and Description on their sections), a
 * row the row form (Controls, Task, Phases, Ticket, Log) and a filing draft the draft form (Request, Questions); links inside open other
 * details over the same tab; × closes; a closing panel slides out and reports itself gone; a switch of item cross-fades the contents, a
 * switch of section does not. On the row form, Ready, Hold, Park and network each post their board command, each shown exactly while the
 * forge offers it; a refusal shows the forge's sentence verbatim; every control is disabled while the stream is down; and a ticket waiting
 * for merge shows its prediction and conflicted files, Accept and Update branch posting only while offered. The ticket form's own controls
 * are `TicketDetail.dom.tsx`'s.
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

import type { BoardDocument }         from '../../../@types/board/BoardDocument.ts';
import { SANDBOX_PERMISSIONS }        from '../../sandboxed-html/SandboxedHtmlFrame.tsx';
import { ControlSurroundingsContext } from '../../shell/ControlAvailability.ts';
import type { ControlAvailability }   from '../../shell/ControlAvailability.ts';
import type { DetailItem }            from '../../shell/DetailRoute.ts';
import { boardHrefOf }                from '../../testing/BoardRouteSurroundings.tsx';
import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt,
  exampleTicketForecast
} from '../../testing/DetailBoardFixture.ts';
import { routedOnTab }               from '../../testing/DetailRoutingFixture.ts';
import { fakeControlSurroundingsOf } from '../../testing/FakeControlSurroundings.ts';
import { DetailPanel }               from './DetailPanel.tsx';

const PLANTED_BODY = [
  '<p>Example body</p>',
  '<img src="x" onerror="window.parent.plantedRan = true">',
  '<script>window.parent.plantedRan = true</script>',
  '<a href="javascript:window.parent.plantedRan = true">a planted link</a>',
].join('');

const BOARD = exampleDetailBoard({
  tickets: [
    exampleDetailTicket('013', { status: 'draft', bodyHtml: PLANTED_BODY, title: '<b>Planted title</b>' }),
    exampleDetailTicket('014', {
      status: 'in-progress', started: exampleStampAt('10:15'), task: 9, dependsOn: ['013']
    }),
    exampleDetailTicket('015', { status: 'committed', hold: 'waiting on the example vendor' }),
  ],
  rows: [exampleDetailRow(9, {
    ticket: '014', status: 'in-progress', start: exampleStampAt('10:15'), history: [{ status: 'in-progress', at: exampleStampAt('10:15') }]
  })],
  waitingOn: { '014': ['013'] },
  log:       [
    {
      at: exampleStampAt('09:00'), text: 'Ticket #014 started', taskIds: [], ticketIds: ['014']
    },
    {
      at: exampleStampAt('09:30'), text: 'Ticket #013 waits on #014', taskIds: [], ticketIds: ['013']
    },
  ],
  drafts: [{
    id:                'D7',
    title:             'Example dark mode',
    claimOwner:        'Alex Example',
    openedAt:          exampleStampAt('09:30'),
    state:             'waiting',
    openQuestionCount: 1,
    questions:         [{
      id: 'Q1', question: 'Which pages change?', context: '', options: [{ letter: 'a', text: 'Orders' }], multiple: false, recommended: ['a'], answer: null, followUps: []
    }],
  }],
  draftRequests: [{ id: 'D7', request: 'Follow the system theme.' }],
});

interface RenderedPanel {
  readonly sent:       ReturnType<typeof fakeControlSurroundingsOf>['sent'];
  readonly answerWith: ReturnType<typeof fakeControlSurroundingsOf>['answerWith'];
  readonly closes:     string[];
  readonly rerender:   (item: DetailItem, isClosing?: boolean) => void;
}

interface PanelSetting {
  readonly availability?: ControlAvailability;
  readonly board?:        BoardDocument;
}

function renderPanel(item: DetailItem, { availability = 'enabled', board = BOARD }: PanelSetting = {}): RenderedPanel {
  const fake = fakeControlSurroundingsOf(availability);
  const closes: string[] = [];
  const panelOf = (shownItem: DetailItem, isClosing: boolean) => (
    <ControlSurroundingsContext.Provider value={fake.surroundings}>
      {routedOnTab('tickets', (
        <DetailPanel
          board={board}
          item={shownItem}
          format={EXAMPLE_DETAIL_FORMAT}
          isClosing={isClosing}
          onClosed={() => closes.push('closed')}
          onClose={() => closes.push('close')}
          focusesCloseOnOpen={() => false}
        />
      ), shownItem).element}
    </ControlSurroundingsContext.Provider>
  );
  const rendered = render(panelOf(item, false));
  return {
    sent:       fake.sent,
    answerWith: fake.answerWith,
    closes,
    rerender:   (nextItem, isClosing = false) => rendered.rerender(panelOf(nextItem, isClosing)),
  };
}

const TICKET_013_BODY: DetailItem = { form: 'ticket', ticketId: '013', section: 'description' };

const ROW_OF_TICKET_013: DetailItem = { form: 'ticket-row', ticketId: '013' };

async function clicked(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

function typedInto(label: string, text: string): void {
  act(() => {
    fireEvent.change(screen.getByRole('textbox', { name: label }), { target: { value: text } });
  });
}

function sectionTitles(): string[] {
  return [...document.querySelectorAll('.design-system-block > [data-type-role="micro"]')].map((title) => title.textContent ?? '');
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  document.head.querySelectorAll('link').forEach((link) => link.remove());
});

describe('the body', () => {
  test('reaches the DOM only as the srcdoc of a frame sandboxed exactly as docs/design/board.md says', () => {
    renderPanel(TICKET_013_BODY);
    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('sandbox')).toBe('allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    expect(SANDBOX_PERMISSIONS).toBe('allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    expect(frame?.getAttribute('srcdoc')).toContain(PLANTED_BODY);
    expect(frame?.getAttribute('srcdoc')).toContain('<title>Description of &lt;b&gt;Planted title&lt;/b&gt;</title>');
  });

  test('a planted payload in the body runs nothing and never reaches the panel\'s own document', async () => {
    renderPanel(TICKET_013_BODY);
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    });
    const panel = screen.getByRole('complementary');
    expect(panel.querySelector('img, script, a[href^="javascript:"]')).toBeNull();
    expect(panel.textContent).not.toContain('a planted link');
    expect((window as unknown as { plantedRan?: boolean }).plantedRan).toBeUndefined();
  });

  test('a planted title shows as text in the head', () => {
    renderPanel(TICKET_013_BODY);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('<b>Planted title</b>');
    expect(document.querySelector('.board-ticket-detail-head b')).toBeNull();
  });

  test('the frame links the page\'s stylesheets and takes its theme, and follows a theme change', async () => {
    const stylesheet = document.createElement('link');
    stylesheet.rel = 'stylesheet';
    stylesheet.href = 'http://127.0.0.1:4100/chunk-example.css';
    document.head.append(stylesheet);
    document.documentElement.setAttribute('data-theme', 'dark');
    renderPanel(TICKET_013_BODY);
    const frame = (): string => document.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
    expect(frame()).toContain('<html data-theme="dark">');
    expect(frame()).toContain('<link rel="stylesheet" href="http://127.0.0.1:4100/chunk-example.css">');
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      await Promise.resolve();
    });
    expect(frame()).toContain('<html data-theme="light">');
  });
});

describe('the forms', () => {
  test('a card opens the ticket form on its Overview: head, Other moves and Facts, its links staying on the tab', () => {
    renderPanel({ form: 'ticket', ticketId: '014' });
    expect(screen.getByRole('complementary').getAttribute('aria-label')).toBe('Ticket #014');
    const head = document.querySelector('.design-system-side-panel-head .board-ticket-detail-head');
    expect([document.querySelector('.design-system-side-panel-head .board-ticket-detail-id-line')?.textContent, head?.textContent])
      .toEqual(['#014ticket', 'Example ticket 014In progress']);
    expect(head?.querySelector('h2')?.getAttribute('data-type-role')).toBe('page');
    expect(document.querySelector('.design-system-side-panel-scroll .board-detail-tab-bar')).toBeNull();
    expect(sectionTitles()).toEqual(['Other moves', 'Facts']);
    expect(screen.getByRole('link', { name: '#013' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket/013'));
    expect(screen.getByRole('link', { name: '#014' }).getAttribute('href')).toBe(boardHrefOf('tickets/task-row/9'));
  });

  test('a forecast on the board adds Next to the Overview', () => {
    const forecastBoard = { ...BOARD, ticketForecasts: [exampleTicketForecast('014')] };
    renderPanel({ form: 'ticket', ticketId: '014' }, { board: forecastBoard });
    expect(sectionTitles()).toEqual(['Next', 'Other moves', 'Facts']);
  });

  test('the Timeline section shows the time spent in each state', () => {
    renderPanel({ form: 'ticket', ticketId: '014', section: 'timeline' });
    expect(within(screen.getByRole('list', { name: 'Time spent in each state' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'To do1h 15m',
      'In progress3h 21m',
    ]);
  });

  test('a row opens the row form: head, Controls, Task, Phases, Ticket and Log, its links opening the row form', () => {
    renderPanel({ form: 'task-row', taskId: 9 });
    expect(screen.getByRole('complementary').getAttribute('aria-label')).toBe('Row #014');
    expect(sectionTitles()).toEqual(['Controls', 'Task', 'Phases', 'Ticket', 'Log']);
    expect(screen.getByRole('link', { name: '#013' }).getAttribute('href')).toBe(boardHrefOf('tickets/ticket-row/013'));
    const log = within(screen.getByRole('region', { name: 'Log' }));
    expect(log.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['09:00Ticket #014 started']);
    expect(log.getByText('09:00').getAttribute('title')).toBe('2026-09-18 09:00');
  });

  test('a row no log line names says so', () => {
    renderPanel({ form: 'ticket-row', ticketId: '015' });
    expect(within(screen.getByRole('region', { name: 'Log' })).getByText('No log line names this row or its ticket.')).toBeTruthy();
  });

  test('a filing draft opens the read-only draft form: Request and Questions, no control', () => {
    renderPanel({ form: 'draft', draftId: 'D7' });
    expect(sectionTitles()).toEqual(['Request', 'Questions']);
    expect(screen.getByText('Follow the system theme.')).toBeTruthy();
    expect(screen.getByText('recommended')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ready' })).toBeNull();
  });

  test('an item the board does not hold says so beside the close button', async () => {
    const panel = renderPanel({ form: 'ticket', ticketId: '999' });
    expect(screen.getByText('No ticket #999 on this board.')).toBeTruthy();
    await clicked(screen.getByRole('button', { name: 'Close' }));
    expect(panel.closes).toEqual(['close']);
  });
});

describe('the frame', () => {
  test('a switch of item cross-fades the contents, which the first item does not', () => {
    const panel = renderPanel({ form: 'ticket', ticketId: '014' });
    expect(document.querySelector('.design-system-side-panel-scroll')?.hasAttribute('data-swapped')).toBe(false);
    act(() => panel.rerender({ form: 'ticket', ticketId: '015' }));
    expect(document.querySelector('.design-system-side-panel-scroll')?.hasAttribute('data-swapped')).toBe(true);
  });

  test('a switch of section keeps the item, so the contents do not cross-fade', () => {
    const panel = renderPanel({ form: 'ticket', ticketId: '014' });
    act(() => panel.rerender({ form: 'ticket', ticketId: '014', section: 'activity' }));
    expect(document.querySelector('.design-system-side-panel-scroll')?.hasAttribute('data-swapped')).toBe(false);
    expect(screen.getByRole('link', { name: 'Activity, 1 log line' }).getAttribute('aria-current')).toBe('page');
  });

  test('mounts out of view, slides in once laid out, and a closing panel slides out and reports itself gone', async () => {
    const panel = renderPanel({ form: 'ticket', ticketId: '014' });
    const aside = screen.getByRole('complementary');
    expect(aside.getAttribute('data-motion')).toBe('out');
    await act(async () => {
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    });
    expect(aside.hasAttribute('data-motion')).toBe(false);
    act(() => panel.rerender({ form: 'ticket', ticketId: '014' }, true));
    expect(screen.getByRole('complementary').getAttribute('data-motion')).toBe('out');
    expect(panel.closes).toEqual(['closed']);
  });
});

describe('the row form\'s controls', () => {
  test('a draft posts ticket-ready, ticket-hold and ticket-park with the typed reason, and ticket-network with the typed domains', async () => {
    const panel = renderPanel(ROW_OF_TICKET_013);
    await clicked(screen.getByRole('button', { name: 'Ready' }));
    typedInto('Reason', 'waiting on the example vendor');
    await clicked(screen.getByRole('button', { name: 'Hold' }));
    await clicked(screen.getByRole('button', { name: 'Park' }));
    typedInto('Network domains', 'registry.example.com, api.example.com');
    await clicked(screen.getByRole('button', { name: 'Set network' }));
    expect(panel.sent).toEqual([
      { boardCommandVersion: 2, kind: 'ticket-ready', ticketIds: ['013'] },
      {
        boardCommandVersion: 2, kind: 'ticket-hold', ticketId: '013', reason: 'waiting on the example vendor'
      },
      {
        boardCommandVersion: 2, kind: 'ticket-park', ticketId: '013', reason: 'waiting on the example vendor', incidentId: null
      },
      {
        boardCommandVersion: 2, kind: 'ticket-network', ticketId: '013', domains: ['registry.example.com', 'api.example.com']
      },
    ]);
  });

  test('a held committed ticket offers Unhold and network; a ticket being built offers Hold and Park, as the forge serves them', async () => {
    const held = renderPanel({ form: 'ticket-row', ticketId: '015' });
    await clicked(screen.getByRole('button', { name: 'Unhold' }));
    expect(held.sent).toEqual([{ boardCommandVersion: 2, kind: 'ticket-unhold', ticketId: '015' }]);
    expect(screen.getByRole('button', { name: 'Set network' })).toBeTruthy();
    cleanup();
    renderPanel({ form: 'ticket-row', ticketId: '014' });
    const controls = within(screen.getByRole('group', { name: 'Ticket controls' }));
    expect(controls.getAllByRole('button').map((button) => button.textContent)).toEqual(['Hold', 'Park']);
  });

  test('a control shows exactly while the forge offers its move, whatever the ticket\'s status', () => {
    const board = exampleDetailBoard({ tickets: [exampleDetailTicket('016', { status: 'draft', offers: { kinds: ['ticket-park'], priorityChoices: [] } })] });
    renderPanel({ form: 'ticket-row', ticketId: '016' }, { board });
    const controls = within(screen.getByRole('group', { name: 'Ticket controls' }));
    expect(controls.getAllByRole('button').map((button) => button.textContent)).toEqual(['Park']);
    expect(screen.queryByRole('group', { name: 'Network' })).toBeNull();
  });

  test('a refused move shows the forge\'s sentence verbatim beside the control that drew it', async () => {
    const panel = renderPanel(ROW_OF_TICKET_013);
    panel.answerWith({ verdict: 'refused', refusal: 'Ticket 013 has no Brief: it cannot be readied.' });
    await clicked(screen.getByRole('button', { name: 'Ready' }));
    const ready = screen.getByRole('button', { name: 'Ready' }).closest('.board-control') as HTMLElement;
    expect(within(ready).getByRole('status').textContent).toBe('Ticket 013 has no Brief: it cannot be readied.');
  });

  test('every control is disabled while the stream is down', () => {
    renderPanel(ROW_OF_TICKET_013, { availability: 'stream-down' });
    const buttons = within(screen.getByRole('region', { name: 'Controls' })).getAllByRole<HTMLButtonElement>('button');
    expect(buttons.length).toBe(4);
    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});

describe('the row form of a ticket waiting for merge (merge approval on)', () => {
  const WAITING_BOARD: BoardDocument = exampleDetailBoard({
    tickets:      [exampleDetailTicket('020', { status: 'in-review' }), exampleDetailTicket('021', { status: 'in-review' })],
    mergeTargets: [{
      target:          'main',
      waitingForMerge: [
        {
          ticketId: '020', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
        },
        {
          ticketId: '021', priority: 'high', againstTarget: 'conflicting', conflictedFiles: ['src/Example.ts', 'README.md']
        },
      ],
    }],
  });

  function mergeApprovalButton(name: string): HTMLButtonElement {
    return within(screen.getByRole('group', { name: 'Merge approval' })).getByRole<HTMLButtonElement>('button', { name });
  }

  test('a clean prediction shows, and Accept posts merge-accept and Update branch posts merge-update', async () => {
    const panel = renderPanel({ form: 'ticket-row', ticketId: '020' }, { board: WAITING_BOARD });
    expect(screen.getByText('Waiting for merge: merges cleanly into main')).toBeTruthy();
    await clicked(mergeApprovalButton('Accept'));
    await clicked(mergeApprovalButton('Update branch'));
    expect(panel.sent).toEqual([
      { boardCommandVersion: 2, kind: 'merge-accept', ticketId: '020' },
      { boardCommandVersion: 2, kind: 'merge-update', ticketId: '020' },
    ]);
  });

  test('a conflicting prediction shows its files, Accept the forge does not offer cannot be pressed, and Update branch still posts', async () => {
    const panel = renderPanel({ form: 'ticket-row', ticketId: '021' }, { board: WAITING_BOARD });
    expect(screen.getByText('Waiting for merge: conflicts with main')).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Conflicted files' })).getAllByRole('listitem').map((item) => item.textContent))
      .toEqual(['src/Example.ts', 'README.md']);
    expect(mergeApprovalButton('Accept').disabled).toBe(true);
    await clicked(mergeApprovalButton('Accept'));
    expect(mergeApprovalButton('Update branch').disabled).toBe(false);
    await clicked(mergeApprovalButton('Update branch'));
    expect(panel.sent).toEqual([{ boardCommandVersion: 2, kind: 'merge-update', ticketId: '021' }]);
  });

  test('a refused accept shows the forge\'s sentence beside the button', async () => {
    const panel = renderPanel({ form: 'ticket-row', ticketId: '020' }, { board: WAITING_BOARD });
    panel.answerWith({ verdict: 'refused', refusal: 'Ticket #020 was not accepted: its branch conflicts with main in src/Example.ts.' });
    await clicked(mergeApprovalButton('Accept'));
    const accept = mergeApprovalButton('Accept').closest('.board-control') as HTMLElement;
    expect(within(accept).getByRole('status').textContent).toBe('Ticket #020 was not accepted: its branch conflicts with main in src/Example.ts.');
  });

  test('a ticket that does not wait shows no merge approval controls', () => {
    renderPanel({ form: 'ticket-row', ticketId: '014' });
    expect(screen.queryByRole('group', { name: 'Merge approval' })).toBeNull();
  });
});
