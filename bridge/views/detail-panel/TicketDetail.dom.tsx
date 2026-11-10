/**
 * The tabbed ticket form in a happy-dom document, against a fake command client. What matters: the four section tabs come in their order,
 * each a link to its own route over the same board tab, Overview the current one without a section, and only the routed section is in the
 * DOM; the arrow keys, Home and End open a section; Activity counts and lists the lines naming the ticket or its row, or says none does;
 * the Overview's state card names the live job and its calls, and leads with Watch, a link no stream outage disables, else with Ready,
 * Unhold or Accept by state, Accept disabled unless the prediction is clean; Park… and Hold… open their reason row before anything is sent,
 * Cancel sending nothing; Next marks exactly one current step and links the tickets the landing lets start, and is absent without a
 * forecast; the Facts grid carries its second lines; and a refusal shows verbatim beside the control that drew it.
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

import type { DetailBoardState }      from '../../@types/DetailBoardState.ts';
import { ControlSurroundingsContext } from '../../shell/ControlAvailability.ts';
import type { ControlAvailability }   from '../../shell/ControlAvailability.ts';
import type { DetailItem }            from '../../shell/DetailRoute.ts';
import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailJob,
  exampleDetailRow,
  exampleDetailTicket,
  exampleStampAt,
  exampleTicketForecast
} from '../../testing/DetailBoardFixture.ts';
import { routedOnTab }               from '../../testing/DetailRoutingFixture.ts';
import { fakeControlSurroundingsOf } from '../../testing/FakeControlSurroundings.ts';
import { DetailPanel }               from './DetailPanel.tsx';

const BOARD = exampleDetailBoard({
  tickets: [
    exampleDetailTicket('004', {
      title: 'Example account pages', status: 'in-progress', started: exampleStampAt('12:41'), task: 4, group: 'account', branch: 'ticket-004'
    }),
    exampleDetailTicket('005', { title: 'Example delivery ETA', dependsOn: ['004'] }),
    exampleDetailTicket('013', { status: 'draft' }),
    exampleDetailTicket('015', { status: 'pending', hold: 'waiting on the example vendor' }),
    exampleDetailTicket('020', { status: 'in-review' }),
    exampleDetailTicket('021', { status: 'in-review' }),
  ],
  rows: [exampleDetailRow(4, {
    ticket: '004', status: 'in-progress', start: exampleStampAt('12:41'), history: [{ status: 'in-progress', at: exampleStampAt('12:41') }]
  })],
  jobs: [exampleDetailJob('J4', '004')],
  log:  [
    {
      at: exampleStampAt('12:41'), text: 'Task #4 started', taskIds: [4], ticketIds: ['004']
    },
    {
      at: exampleStampAt('09:10'), text: 'Ticket #004 readied', taskIds: [], ticketIds: ['004']
    },
    {
      at: exampleStampAt('10:00'), text: 'Ticket #013 filed', taskIds: [], ticketIds: ['013']
    },
  ],
  ticketForecasts: [exampleTicketForecast('004', {
    steps: [
      { kind: 'build', attempt: 1, jobId: 'J4' },
      { kind: 'customs-and-gates', gateNames: ['tests'], jobId: null },
      { kind: 'review', round: 1, jobId: null },
      { kind: 'integrate', target: 'group-account', group: 'account' },
    ],
    currentStepIndex: 0,
    dependents:       [{ ticketId: '005', stillWaitingOnTicketIds: [] }],
  })],
  mergeQueue: {
    targets: [{
      target:          'main',
      waitingForMerge: [
        {
          ticketId: '020', priority: 'normal', againstTarget: 'clean', conflictedFiles: []
        },
        {
          ticketId: '021', priority: 'normal', againstTarget: 'conflicting', conflictedFiles: ['src/Example.ts']
        },
      ],
    }],
  },
});

const BUILDING: DetailItem = { form: 'ticket', ticketId: '004' };

interface RenderedTicket {
  readonly sent:       ReturnType<typeof fakeControlSurroundingsOf>['sent'];
  readonly answerWith: ReturnType<typeof fakeControlSurroundingsOf>['answerWith'];
}

interface TicketSetting {
  readonly availability?: ControlAvailability;
  readonly boardState?:   DetailBoardState;
}

function renderTicket(item: DetailItem, { availability = 'enabled', boardState = BOARD }: TicketSetting = {}): RenderedTicket {
  const fake = fakeControlSurroundingsOf(availability);
  render(
    <ControlSurroundingsContext.Provider value={fake.surroundings}>
      {routedOnTab('progress', (
        <DetailPanel
          boardState={boardState}
          item={item}
          format={EXAMPLE_DETAIL_FORMAT}
          isClosing={false}
          onClosed={() => undefined}
          onClose={() => undefined}
          focusesCloseOnOpen={() => false}
        />
      ), item).element}
    </ControlSurroundingsContext.Provider>,
  );
  return { sent: fake.sent, answerWith: fake.answerWith };
}

async function clicked(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

function sectionTabs(): HTMLElement[] {
  return within(screen.getByRole('navigation', { name: 'Ticket sections' })).getAllByRole('link');
}

function blockTitles(): string[] {
  return [...document.querySelectorAll('.bridge-block-title')].map((title) => title.textContent ?? '');
}

function region(name: string) {
  return within(screen.getByRole('region', { name }));
}

afterEach(() => {
  cleanup();
  window.location.hash = '';
});

describe('the section tabs', () => {
  test('are Overview, Timeline, Activity and Description in order, Overview current when the route names no section', () => {
    renderTicket(BUILDING);
    expect(sectionTabs().map((tab) => tab.textContent)).toEqual(['Overview', 'Timeline', 'Activity2', 'Description']);
    expect(sectionTabs().map((tab) => tab.getAttribute('aria-current'))).toEqual(['page', null, null, null]);
  });

  test('each links to its own route over the same board tab, and a routed section shows only that section', () => {
    renderTicket({ form: 'ticket', ticketId: '004', section: 'timeline' });
    expect(sectionTabs().map((tab) => tab.getAttribute('href'))).toEqual([
      '#progress/ticket/004',
      '#progress/ticket/004/timeline',
      '#progress/ticket/004/activity',
      '#progress/ticket/004/description',
    ]);
    expect(screen.getByRole('link', { name: 'Timeline' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('list', { name: 'Time spent in each state' })).toBeTruthy();
    expect(blockTitles()).toEqual([]);
    expect(document.querySelector('iframe')).toBeNull();
  });

  test('the arrow keys, Home and End move between the sections and open them', () => {
    renderTicket(BUILDING);
    const [overview] = sectionTabs();
    overview?.focus();
    act(() => {
      fireEvent.keyDown(overview ?? document, { key: 'ArrowRight' });
    });
    expect(window.location.hash).toBe('#progress/ticket/004/timeline');
    expect(document.activeElement?.textContent).toBe('Timeline');
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document, { key: 'End' });
    });
    expect(window.location.hash).toBe('#progress/ticket/004/description');
    act(() => {
      fireEvent.keyDown(document.activeElement ?? document, { key: 'Home' });
    });
    expect(window.location.hash).toBe('#progress/ticket/004');
  });

  test('Description holds the body in its sandboxed frame', () => {
    renderTicket({ form: 'ticket', ticketId: '004', section: 'description' });
    expect(document.querySelector('iframe')?.getAttribute('title')).toBe('Description of Example account pages');
  });
});

describe('Activity', () => {
  test('counts the lines naming the ticket or its row, and lists them newest first', () => {
    renderTicket({ form: 'ticket', ticketId: '004', section: 'activity' });
    expect(screen.getByRole('link', { name: 'Activity, 2 log lines' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['12:41Task #4 started', '09:10Ticket #004 readied']);
  });

  test('a ticket no line names shows no count and says so', () => {
    renderTicket({ form: 'ticket', ticketId: '015', section: 'activity' });
    expect(screen.getByRole('link', { name: 'Activity' }).textContent).toBe('Activity');
    expect(screen.getByText('No log line names this ticket or its row.')).toBeTruthy();
  });
});

describe('the Overview', () => {
  test('a running build shows its state card and leads with the link Watch J4 to its transcript on Agents', () => {
    renderTicket(BUILDING);
    const card = document.querySelector('.bridge-callout');
    expect(card?.getAttribute('data-state')).toBe('in-progress');
    expect([...(card?.children ?? [])].map((part) => part.textContent)).toEqual([
      'Building',
      'J4, builder, attempt 1, since 12:41 (55m)',
      '0 / 150 calls · no tool call yet',
    ]);
    const watch = screen.getByRole('link', { name: 'Watch J4' });
    expect(watch.getAttribute('href')).toBe('#agents/J4');
    expect(screen.getByText('Opens J4\'s transcript on Agents.')).toBeTruthy();
  });

  test('a draft leads with Ready, which posts ticket-ready; a held ticket leads with Unhold', async () => {
    const draft = renderTicket({ form: 'ticket', ticketId: '013' });
    await clicked(screen.getByRole('button', { name: 'Ready' }));
    expect(draft.sent).toEqual([{ kind: 'ticket-ready', ticketReferences: ['013'] }]);
    cleanup();
    const held = renderTicket({ form: 'ticket', ticketId: '015' });
    expect(screen.getByText('Held: waiting on the example vendor')).toBeTruthy();
    await clicked(screen.getByRole('button', { name: 'Unhold' }));
    expect(held.sent).toEqual([{ kind: 'ticket-unhold', ticketReference: '015' }]);
  });

  test('a ticket waiting for merge leads with Accept, disabled unless the prediction is clean, and offers Update branch under Other moves', async () => {
    const clean = renderTicket({ form: 'ticket', ticketId: '020' });
    await clicked(screen.getByRole('button', { name: 'Accept' }));
    await clicked(region('Other moves').getByRole('button', { name: 'Update branch' }));
    expect(clean.sent).toEqual([{ kind: 'merge-accept', ticketReference: '020' }, { kind: 'merge-update', ticketReference: '020' }]);
    cleanup();
    renderTicket({ form: 'ticket', ticketId: '021' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Accept' }).disabled).toBe(true);
    expect(within(screen.getByRole('list', { name: 'Conflicted files' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['src/Example.ts']);
  });

  test('Park… opens the reason row; Park posts ticket-park with the typed reason, and Cancel closes it with nothing sent', async () => {
    const panel = renderTicket(BUILDING);
    expect(screen.queryByRole('textbox', { name: 'Reason' })).toBeNull();
    expect(region('Other moves').getByText(/J4 runs on to its end/u)).toBeTruthy();
    await clicked(screen.getByRole('button', { name: 'Park…' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Park' }).disabled).toBe(true);
    await clicked(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('textbox', { name: 'Reason' })).toBeNull();
    expect(panel.sent).toEqual([]);
    await clicked(screen.getByRole('button', { name: 'Park…' }));
    act(() => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'waiting on the example vendor' } });
    });
    await clicked(screen.getByRole('button', { name: 'Park' }));
    expect(panel.sent).toEqual([{ kind: 'ticket-park', ticketReference: '004', reason: 'waiting on the example vendor' }]);
  });

  test('Hold… on a draft opens its reason row too, and its Park names no job', async () => {
    const draft = renderTicket({ form: 'ticket', ticketId: '013' });
    expect(region('Other moves').queryByText(/runs on to its end/u)).toBeNull();
    await clicked(screen.getByRole('button', { name: 'Hold…' }));
    act(() => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Reason' }), { target: { value: 'waiting on the example vendor' } });
    });
    await clicked(screen.getByRole('button', { name: 'Hold' }));
    expect(draft.sent).toEqual([{ kind: 'ticket-hold', ticketReference: '013', reason: 'waiting on the example vendor' }]);
  });

  test('Next lists the forecast\'s steps with exactly one current, its ticket links opening the ticket form on the same tab', () => {
    renderTicket(BUILDING);
    const steps = region('Next').getAllByRole('listitem');
    expect(steps.map((step) => step.hasAttribute('data-current'))).toEqual([true, false, false, false]);
    expect(steps.at(-1)?.textContent).toBe('It integrates into group-account; #005 Example delivery ETA can start.');
    expect(region('Next').getByRole('link', { name: '#005' }).getAttribute('href')).toBe('#progress/ticket/005');
  });

  test('a board with no forecast shows no Next', () => {
    renderTicket(BUILDING, { boardState: { ...BOARD, ticketForecasts: [] } });
    expect(blockTitles()).toEqual(['Other moves', 'Facts']);
  });

  test('Facts is a grid, the branch as Integration\'s value with where it lands under it, and the attempt under Started', () => {
    renderTicket(BUILDING);
    const facts = region('Facts');
    expect(document.querySelector('.bridge-facts')?.getAttribute('data-layout')).toBe('grid');
    const valueOf = (label: string) => facts.getByText(label).nextElementSibling?.textContent;
    expect(valueOf('integration')).toBe('group-accountlands together, no release ticket yet');
    expect(valueOf('started')).toBe('12:41attempt 1');
    expect(valueOf('task')).toBe('#004row of this ticket');
  });
});

describe('the controls', () => {
  test('a refusal shows verbatim beside the control that drew it', async () => {
    const draft = renderTicket({ form: 'ticket', ticketId: '013' });
    draft.answerWith({ verdict: 'refused', refusal: 'Ticket 013 has no Brief: it cannot be readied.' });
    await clicked(screen.getByRole('button', { name: 'Ready' }));
    const ready = screen.getByRole('button', { name: 'Ready' }).closest('.bridge-control') as HTMLElement;
    expect(within(ready).getByRole('status').textContent).toBe('Ticket 013 has no Brief: it cannot be readied.');
  });

  test('every command button is disabled while the stream is down, but Watch J4 still leads to the transcript', () => {
    renderTicket({ form: 'ticket', ticketId: '020' }, { availability: 'stream-down' });
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Accept' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Update branch' }).disabled).toBe(true);
    cleanup();
    renderTicket(BUILDING, { availability: 'stream-down' });
    expect(screen.getByRole('link', { name: 'Watch J4' }).getAttribute('href')).toBe('#agents/J4');
  });
});
