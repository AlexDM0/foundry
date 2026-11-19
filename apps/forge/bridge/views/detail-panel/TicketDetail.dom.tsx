/**
 * The tabbed ticket form in a happy-dom document, against a fake command client. What matters: the four section tabs come in their order,
 * each a link to its own route over the same board tab, Overview the current one without a section, and only the routed section is in the
 * DOM; the arrow keys, Home and End open a section; Activity counts and lists the lines naming the ticket or its row, or says none does;
 * the Overview's state card names the live job and its calls beside Flint's slot (no slot while the question panel shows over the panel's
 * slide out, so a page has one), and leads with Watch, a link no stream outage disables, else with Ready, Unhold or Accept by state, Accept
 * disabled unless the prediction is clean; Park…, Hold… and Delivered by hand… open their row before anything is sent, Cancel sending
 * nothing; a pending ticket's Priority… opens a row of the other priorities, each posting `ticket-priority`, closing once applied and
 * showing a refusal verbatim; a closed move row hands the focus back to its opener; Next marks exactly one current step and links the
 * tickets the landing lets start, and is absent without a forecast; the Facts grid carries its second lines; a refusal shows verbatim
 * beside the control that drew it; and a live job's controls sit under Watch, after the open incident naming the ticket: a message box
 * while the job takes one, and More, whose Wind down, Stop and Fresh agent each open a confirmation in place naming the ticket, its branch
 * and its hold, sending nothing until confirmed, Cancel and Esc handing the focus back; a stopping job shows Stopping. alone, a watched one
 * Stop alone.
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
import { QuestionPanelShownContext }  from '../../shell/CoveringPanel.ts';
import type { DetailItem }            from '../../shell/DetailRoute.ts';
import {
  EXAMPLE_DETAIL_FORMAT,
  exampleDetailBoard,
  exampleDetailIncident,
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
  jobs:      [exampleDetailJob('J4', '004')],
  incidents: [exampleDetailIncident('I6', '004')],
  log:       [
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
  readonly showItem:   (item: DetailItem) => void;
}

interface TicketSetting {
  readonly availability?:         ControlAvailability;
  readonly boardState?:           DetailBoardState;
  /** False renders the panel sliding out after its item closed. */
  readonly itemIsRouted?:         boolean;
  readonly questionPanelIsShown?: boolean;
}

function renderTicket(item: DetailItem, {
  availability = 'enabled', boardState = BOARD, itemIsRouted = true, questionPanelIsShown = false
}: TicketSetting = {}): RenderedTicket {
  const fake = fakeControlSurroundingsOf(availability);
  const panelOf = (shownItem: DetailItem) => (
    <ControlSurroundingsContext.Provider value={fake.surroundings}>
      <QuestionPanelShownContext.Provider value={questionPanelIsShown}>
        {routedOnTab('progress', (
          <DetailPanel
            boardState={boardState}
            item={shownItem}
            format={EXAMPLE_DETAIL_FORMAT}
            isClosing={!itemIsRouted}
            onClosed={() => undefined}
            onClose={() => undefined}
            focusesCloseOnOpen={() => false}
          />
        ), itemIsRouted ? shownItem : null).element}
      </QuestionPanelShownContext.Provider>
    </ControlSurroundingsContext.Provider>
  );
  const rendered = render(panelOf(item));
  return { sent: fake.sent, answerWith: fake.answerWith, showItem: (shownItem) => rendered.rerender(panelOf(shownItem)) };
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
  return [...document.querySelectorAll('.design-system-block > [data-type-role="micro"]')].map((title) => title.textContent ?? '');
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

  test('a new section starts the body at its top', () => {
    const { showItem } = renderTicket(BUILDING);
    const body = document.querySelector('.design-system-side-panel-scroll') as HTMLElement;
    body.scrollTop = 120;
    expect(body.scrollTop).toBe(120);
    showItem({ form: 'ticket', ticketId: '004', section: 'timeline' });
    expect([body.isConnected, body.scrollTop]).toEqual([true, 0]);
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
  test('a running build shows its state card, Flint\'s slot in it, and leads with the link Watch J4 to its transcript on Agents', () => {
    renderTicket(BUILDING);
    const card = document.querySelector('.bridge-detail-state-card');
    expect(card?.getAttribute('data-state')).toBe('in-progress');
    const flint = card?.querySelector('.design-system-flint-slot');
    expect(['data-size', 'data-ground', 'aria-hidden'].map((name) => flint?.getAttribute(name))).toEqual(['100', 'strip', 'true']);
    expect([...(card?.querySelectorAll('h3, p') ?? [])].map((part) => part.textContent)).toEqual([
      'Building',
      'J4, builder, attempt 1, since 12:41 (55m)',
      '0 / 150 calls · no tool call yet',
    ]);
    const watch = screen.getByRole('link', { name: 'Watch J4' });
    expect(watch.getAttribute('href')).toBe('#agents/J4');
    expect(screen.getByText('Opens J4\'s transcript on Agents.')).toBeTruthy();
  });

  test('the state card holds the page\'s one Flint slot while its item is routed, a question open or not, and none once the question panel shows over its slide out', () => {
    const flintSlots = (): number => document.querySelectorAll('.design-system-flint-slot').length;
    renderTicket(BUILDING, { questionPanelIsShown: true });
    expect(flintSlots()).toBe(1);
    cleanup();
    renderTicket(BUILDING, { itemIsRouted: false, questionPanelIsShown: true });
    expect([document.querySelector('.bridge-detail-state-card') === null, flintSlots()]).toEqual([false, 0]);
    cleanup();
    renderTicket(BUILDING, { itemIsRouted: false });
    expect(flintSlots()).toBe(1);
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

  test('Delivered by hand… opens its confirmation; Record delivered posts ticket-deliver-by-hand with the typed branch, and waits on a live job', async () => {
    const reviewed = renderTicket({ form: 'ticket', ticketId: '020' });
    await clicked(screen.getByRole('button', { name: 'Delivered by hand…' }));
    act(() => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Branch' }), { target: { value: 'ticket-020' } });
    });
    await clicked(screen.getByRole('button', { name: 'Record delivered' }));
    expect(reviewed.sent).toEqual([{ kind: 'ticket-deliver-by-hand', ticketReference: '020', branch: 'ticket-020' }]);
    cleanup();
    renderTicket(BUILDING);
    await clicked(screen.getByRole('button', { name: 'Delivered by hand…' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Record delivered' }).disabled).toBe(true);
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

  test('a ticket ready for review leads with Ready; a pending ticket offers Hold…, whose Hold with no reason posts ticket-hold', async () => {
    const boardState = exampleDetailBoard({ tickets: [exampleDetailTicket('016', { status: 'ready-for-review' }), exampleDetailTicket('017', { status: 'pending' })], });
    const forReview = renderTicket({ form: 'ticket', ticketId: '016' }, { boardState });
    await clicked(screen.getByRole('button', { name: 'Ready' }));
    expect(forReview.sent).toEqual([{ kind: 'ticket-ready', ticketReferences: ['016'] }]);
    cleanup();
    const pending = renderTicket({ form: 'ticket', ticketId: '017' }, { boardState });
    expect(screen.queryByRole('button', { name: 'Ready' })).toBeNull();
    await clicked(region('Other moves').getByRole('button', { name: 'Hold…' }));
    await clicked(screen.getByRole('button', { name: 'Hold' }));
    expect(pending.sent).toEqual([{ kind: 'ticket-hold', ticketReference: '017', reason: '' }]);
  });

  test('a pending ticket\'s Priority… opens one row of the two other priorities; each posts ticket-priority, and the row closes once applied', async () => {
    const boardState = exampleDetailBoard({ tickets: [exampleDetailTicket('018', { status: 'pending', priority: 'low' })] });
    const pending = renderTicket({ form: 'ticket', ticketId: '018' }, { boardState });
    expect(screen.queryByRole('group', { name: 'Priority' })).toBeNull();
    await clicked(region('Other moves').getByRole('button', { name: 'Priority…' }));
    const row = within(screen.getByRole('group', { name: 'Priority' }));
    expect(row.getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Priority high', 'Priority normal', 'Cancel']);
    await clicked(row.getByRole('button', { name: 'Priority high' }));
    expect(pending.sent).toEqual([{ kind: 'ticket-priority', ticketReference: '018', priority: 'high' }]);
    expect(screen.queryByRole('group', { name: 'Priority' })).toBeNull();
  });

  test('a refused priority shows verbatim in its row, which stays open; Cancel closes it with nothing more sent', async () => {
    const boardState = exampleDetailBoard({ tickets: [exampleDetailTicket('019', { status: 'pending' })] });
    const pending = renderTicket({ form: 'ticket', ticketId: '019' }, { boardState });
    pending.answerWith({ verdict: 'refused', refusal: 'Ticket 019 is already at priority low.' });
    await clicked(region('Other moves').getByRole('button', { name: 'Priority…' }));
    await clicked(screen.getByRole('button', { name: 'Priority low' }));
    expect(within(screen.getByRole('group', { name: 'Priority' })).getByRole('status').textContent).toBe('Ticket 019 is already at priority low.');
    await clicked(within(screen.getByRole('group', { name: 'Priority' })).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Priority' })).toBeNull();
    expect(pending.sent).toEqual([{ kind: 'ticket-priority', ticketReference: '019', priority: 'low' }]);
  });

  test('a closed move row hands the focus back to its opener, on Cancel and once its command applied', async () => {
    renderTicket(BUILDING);
    await clicked(screen.getByRole('button', { name: 'Park…' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    cancel.focus();
    await clicked(cancel);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Park…' }));
    cleanup();
    const boardState = exampleDetailBoard({ tickets: [exampleDetailTicket('018', { status: 'pending', priority: 'low' })] });
    renderTicket({ form: 'ticket', ticketId: '018' }, { boardState });
    await clicked(region('Other moves').getByRole('button', { name: 'Priority…' }));
    const high = screen.getByRole('button', { name: 'Priority high' });
    high.focus();
    await clicked(high);
    expect(document.activeElement).toBe(region('Other moves').getByRole('button', { name: 'Priority…' }));
  });

  test('a draft, a held ticket under review or a ticket in progress offers no Priority…', () => {
    for (const ticketId of ['013', '004', '020']) {
      renderTicket({ form: 'ticket', ticketId });
      expect(screen.queryByRole('button', { name: 'Priority…' })).toBeNull();
      cleanup();
    }
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
    expect(document.querySelector('.design-system-facts')?.getAttribute('data-layout')).toBe('grid');
    const valueOf = (label: string) => facts.getByText(label).nextElementSibling?.textContent;
    expect(valueOf('integration')).toBe('group-accountlands together, no release ticket yet');
    expect(valueOf('started')).toBe('12:41attempt 1');
    expect(valueOf('task')).toBe('#004row of this ticket');
  });
});

describe('the live job\'s controls', () => {
  function moreButton(): HTMLElement {
    return screen.getByRole('button', { name: 'More controls for J4 and #004' });
  }

  function stopMenu(): HTMLElement | null {
    return screen.queryByRole('dialog', { name: 'Controls that stop work' });
  }

  function withJob(job: unknown): DetailBoardState {
    return { ...BOARD, jobs: [job] };
  }

  test('a building ticket names its open incident, then under Watch J4 the message box and More, and no Hold or Park among them', () => {
    renderTicket(BUILDING);
    expect(screen.getByText(/^Open incident/u).textContent).toBe('Open incident I6 on this ticket: sandbox-unavailable, default gate-retry.');
    const group = screen.getByRole('group', { name: 'Builder J4 controls' });
    expect(within(group).getAllByRole('textbox').map((box) => box.getAttribute('aria-label'))).toEqual(['Message J4']);
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Send message', 'More ···']);
    const lead = document.querySelector('.bridge-detail-lead');
    expect(lead?.compareDocumentPosition(group)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.queryByText('job')).toBeNull();
  });

  test('Send message posts job-message with the typed text and clears the box', async () => {
    const panel = renderTicket(BUILDING);
    const box = screen.getByRole<HTMLInputElement>('textbox', { name: 'Message J4' });
    act(() => {
      fireEvent.change(box, { target: { value: 'Rebase onto main first' } });
    });
    await clicked(screen.getByRole('button', { name: 'Send message' }));
    expect(panel.sent).toEqual([{ kind: 'job-message', jobId: 'J4', text: 'Rebase onto main first' }]);
    expect(box.value).toBe('');
  });

  test('More lists Wind down, Stop and Fresh agent; Stop J4 is confirmed in place, naming the ticket, its branch and its hold, before it posts', async () => {
    const panel = renderTicket(BUILDING);
    await clicked(moreButton());
    expect(within(stopMenu() as HTMLElement).getAllByRole('button').map((item) => item.firstChild?.textContent)).toEqual(['Wind down J4', 'Stop J4', 'Fresh agent']);
    await clicked(screen.getByRole('button', { name: 'Stop J4' }));
    const confirmation = screen.getByRole('group', { name: 'Confirm stopping J4' });
    expect(confirmation.textContent).toContain('Stop J4 now?');
    expect(confirmation.textContent).toContain('Ends J4\'s session on #004 Example account pages in the middle of its turn.');
    expect(confirmation.textContent).toContain('Branch ticket-004 and its worktree stay as they are.');
    expect(confirmation.textContent).toContain('#004 is held stopped by User (J4) until User unholds it.');
    expect(panel.sent).toEqual([]);
    await clicked(within(confirmation).getByRole('button', { name: 'Stop J4' }));
    expect(panel.sent).toEqual([{ kind: 'job-stop', jobId: 'J4', mode: 'stop' }]);
    expect(stopMenu()).toBeNull();
  });

  test('Wind down and Fresh agent post their own commands once confirmed', async () => {
    const panel = renderTicket(BUILDING);
    await clicked(moreButton());
    await clicked(screen.getByRole('button', { name: 'Wind down J4' }));
    await clicked(within(screen.getByRole('group', { name: 'Confirm winding down J4' })).getByRole('button', { name: 'Wind down J4' }));
    await clicked(moreButton());
    await clicked(screen.getByRole('button', { name: 'Fresh agent' }));
    await clicked(within(screen.getByRole('group', { name: 'Confirm a fresh agent for J4' })).getByRole('button', { name: 'Start fresh agent' }));
    expect(panel.sent).toEqual([{ kind: 'job-stop', jobId: 'J4', mode: 'wind-down' }, { kind: 'job-fresh', jobId: 'J4' }]);
  });

  test('Cancel puts the item back with nothing sent and the focus on it; Esc closes the menu and hands the focus back to More', async () => {
    const panel = renderTicket(BUILDING);
    await clicked(moreButton());
    await clicked(screen.getByRole('button', { name: 'Stop J4' }));
    await clicked(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('group', { name: 'Confirm stopping J4' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Stop J4' }));
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(stopMenu()).toBeNull();
    expect(document.activeElement).toBe(moreButton());
    expect(panel.sent).toEqual([]);
  });

  test('a refused stop shows the Overseer\'s sentence verbatim beside the confirm', async () => {
    const panel = renderTicket(BUILDING);
    panel.answerWith({ verdict: 'refused', refusal: 'Job J4 is already stopping.' });
    await clicked(moreButton());
    await clicked(screen.getByRole('button', { name: 'Stop J4' }));
    const confirmation = screen.getByRole('group', { name: 'Confirm stopping J4' });
    await clicked(within(confirmation).getByRole('button', { name: 'Stop J4' }));
    expect(within(confirmation).getByRole('status').textContent).toBe('Job J4 is already stopping.');
  });

  test('a stopping job shows Stopping. and no controls', () => {
    renderTicket(BUILDING, { boardState: withJob(exampleDetailJob('J4', '004', { stopRequest: 'stop' })) });
    expect(screen.getByText('Stopping.')).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Builder J4 controls' })).toBeNull();
  });

  test('a review job\'s controls are the reviewer\'s, and a ticket with no job has none', () => {
    renderTicket(BUILDING, { boardState: withJob(exampleDetailJob('J9', '004', { kind: 'review', role: 'reviewer' })) });
    expect(screen.getByRole('group', { name: 'Reviewer J9 controls' })).toBeTruthy();
    cleanup();
    renderTicket({ form: 'ticket', ticketId: '013' });
    expect(screen.queryByRole('button', { name: /^More controls/u })).toBeNull();
    expect(screen.queryByText(/^Open incident/u)).toBeNull();
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
