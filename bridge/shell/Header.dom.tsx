/**
 * The header against a fake command client. What matters: Pause, Resume and Restart post the ControlCommands they name, Restart only
 * with new code on disk; Stop Overseer posts `overseer-stop` only after its confirmation, and Cancel posts nothing; a Baton pass reads
 * Handing over and withdraws the controls; the header offers no concurrency field, which lives on the Agents tab; the theme switch sits
 * in the tab bar after the tabs, moves with the arrow keys, Home and End and keeps one tab stop; the status details read as one line; the
 * figures link to their tabs, a lane's figure asks for its lane and the agents figure says what it counts; the arrow keys, Home and End
 * move along the tabs and open them; the activity strip shows one chip per job holding a launch slot and none for a session job, the
 * counts before the chips, and one flag for tickets in progress with no job, and ticks from the injected clock only while it is live; the
 * summary line counts the states and today's figures; the stale notice shows only while the stream is down; the Waiting on User pill
 * names the total and the escalated, opens its inbox in the model's order, closes on Esc (handing the focus back), a pointer outside or a
 * followed link, and its ages tick only while live; and the tabs count what waits on User in their tones, with no badge at zero.
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

import type { BoardStateDocument, IdentifiedRecord } from '../@types/BoardStateDocument.ts';
import type { ControlCommandBody }                   from '../api/CommandClient.ts';
import type { ConnectionState }                      from '../api/EventStreamClient.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  FIXTURE_ASSISTANT_JOB,
  FIXTURE_BUILDER_JOB,
  FIXTURE_NOW
} from '../testing/BoardStateFixture.ts';
import {
  nothingWaitingBoard,
  WAITING_FIXTURE_NOW,
  waitingOnUserBoard,
  type WaitingOnUserFixtureBoard
} from '../testing/WaitingOnUserFixture.ts';
import type { NotificationAllowance, QuestionNotifier } from '../views/questions/QuestionAlerts.ts';
import type { BridgeClock }                             from './BridgeClock.ts';
import { ControlSurroundingsContext }                   from './ControlAvailability.ts';
import { BRIDGE_TABS }                                  from './HashRouter.ts';
import { Header, STALE_NOTICE_TEXT }                    from './Header.tsx';
import { HeaderModelUtil, type HeaderFigureLane }       from './HeaderModel.ts';
import type { ThemeChoice }                             from './ThemeBootstrap.ts';
import { WaitingOnUserModel }                           from './WaitingOnUserModel.ts';

const STILL_CLOCK: BridgeClock = { now: () => FIXTURE_NOW, everySecond: () => () => undefined, after: () => () => undefined };

const NO_NOTIFIER: QuestionNotifier = {
  allowance:         () => 'denied',
  askAllowance:      () => Promise.resolve('denied'),
  notify:            () => undefined,
  setDocumentTitle:  () => undefined,
  baseDocumentTitle: 'Example board',
};

function tickingClock(startsAt: Date = FIXTURE_NOW): { clock: BridgeClock; advance: (milliseconds: number) => void } {
  let now = startsAt.getTime();
  const ticks: (() => void)[] = [];
  return {
    clock: {
      now:         () => new Date(now),
      everySecond: (tick) => {
        ticks.push(tick);
        return () => {
          ticks.splice(ticks.indexOf(tick), 1);
        };
      },
      after: () => () => undefined,
    },
    advance: (milliseconds) => {
      now += milliseconds;
      ticks.forEach((tick) => tick());
    },
  };
}

interface HeaderSurroundings {
  readonly themeChoice?:    ThemeChoice;
  readonly onThemeChoice?:  (choice: ThemeChoice) => void;
  readonly activityIsLive?: boolean;
  readonly clock?:          BridgeClock;
  readonly connection?:     ConnectionState;
  readonly onShowLane?:     (lane: HeaderFigureLane) => void;
  readonly notifier?:       QuestionNotifier;
  /** The board the pill and the tab counts read; without it the header shows no pill and no count. */
  readonly waitingBoard?:   WaitingOnUserFixtureBoard;
}

function renderedHeader(state: BoardStateDocument, surroundings: HeaderSurroundings = {}): ControlCommandBody[] {
  const sent: ControlCommandBody[] = [];
  const controlSurroundings = {
    availability:  'enabled' as const,
    commandClient: {
      send: (command: ControlCommandBody) => {
        sent.push(command);
        return Promise.resolve({ verdict: 'applied' as const, outcome: 'done', result: null });
      },
    },
    onInstallHeld: () => undefined,
  };
  const { waitingBoard } = surroundings;
  const waitingOnUser = waitingBoard === undefined ? null : WaitingOnUserModel.waitingOnUserOf(waitingBoard);
  render(
    <ControlSurroundingsContext.Provider value={controlSurroundings}>
      <Header
        project="Example Agency"
        model={HeaderModelUtil.headerModelOf(state, FIXTURE_NOW, surroundings.connection ?? 'live')}
        selectedTab="kanban"
        shownTabs={BRIDGE_TABS}
        themeChoice={surroundings.themeChoice ?? 'auto'}
        onThemeChoice={surroundings.onThemeChoice ?? (() => undefined)}
        activityIsLive={surroundings.activityIsLive ?? true}
        clock={surroundings.clock ?? STILL_CLOCK}
        {...(surroundings.onShowLane === undefined ? {} : { onShowLane: surroundings.onShowLane })}
        waitingOnUser={waitingOnUser}
        tabCounts={waitingBoard === undefined || waitingOnUser === null ? {} : WaitingOnUserModel.tabCountsOf(waitingBoard, waitingOnUser)}
        questionNotifier={surroundings.notifier ?? NO_NOTIFIER}
        timestampSlices={state.page?.payload.limits ?? null}
      />
    </ControlSurroundingsContext.Provider>,
  );
  return sent;
}

function renderedWaitingHeader(board: WaitingOnUserFixtureBoard, surroundings: HeaderSurroundings = {}): void {
  renderedHeader(board, { ...surroundings, waitingBoard: board });
}

async function clicked(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
});

describe('the Overseer controls', () => {
  test('Pause posts overseer-pause, and no Restart shows without new code', async () => {
    const sent = renderedHeader(boardStateFixture());
    expect(screen.queryByRole('button', { name: 'Restart' })).toBeNull();
    await clicked('Pause');
    expect(sent).toEqual([{ kind: 'overseer-pause' }]);
  });

  test('Resume posts overseer-resume while paused', async () => {
    const sent = renderedHeader(boardStateFixture({ overseer: { state: 'serving', paused: true, codeVersion: 'code-1' } }));
    await clicked('Resume');
    expect(sent).toEqual([{ kind: 'overseer-resume' }]);
  });

  test('with new code on disk Restart posts overseer-restart, beside the notice pointing at update', async () => {
    const sent = renderedHeader(boardStateFixture({ notices: [{ kind: 'new-code' }] }));
    expect(screen.getByText(/^new code: run `.* update`$/u)).toBeDefined();
    await clicked('Restart');
    expect(sent).toEqual([{ kind: 'overseer-restart', now: false }]);
  });

  test('Stop Overseer posts overseer-stop only once confirmed, and Cancel posts nothing', async () => {
    const sent = renderedHeader(boardStateFixture());
    await clicked('Stop Overseer');
    await clicked('Cancel');
    expect(sent).toEqual([]);
    await clicked('Stop Overseer');
    await clicked('Confirm stop');
    expect(sent).toEqual([{ kind: 'overseer-stop', now: false }]);
  });

  test('during a Baton pass the status reads Handing over and no control is offered', () => {
    renderedHeader(boardStateFixture({ overseer: { state: 'passing-baton', paused: false, codeVersion: 'code-1' }, notices: [{ kind: 'new-code' }] }));
    expect(screen.getByText('Handing over')).toBeDefined();
    expect(['Pause', 'Restart', 'Stop Overseer'].map((name) => screen.queryByRole('button', { name }))).toEqual([null, null, null]);
  });

  test('shows the usage and the board\'s confinement word unchanged, as one line with one separator', () => {
    renderedHeader(boardStateFixture({ confinement: 'unconfined-by-design' }));
    expect([...document.querySelectorAll('.bridge-status-detail')].map((detail) => detail.textContent)).toEqual(['usage under its limit · confinement unconfined-by-design']);
  });

  test('the header offers no concurrency field: the limit is set on the Agents tab', () => {
    renderedHeader(boardStateFixture());
    expect([screen.queryByLabelText('Concurrency limit'), screen.queryByRole('button', { name: 'Set' })]).toEqual([null, null]);
  });
});

describe('the theme switch', () => {
  test('sits in the tab bar, after the tabs', () => {
    renderedHeader(boardStateFixture());
    const theme = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(theme.parentElement?.classList.contains('bridge-tab-bar')).toBe(true);
    expect(theme.previousElementSibling?.getAttribute('aria-label')).toBe('Views');
    expect(document.querySelector('.bridge-head-title-row [role="radiogroup"]')).toBeNull();
  });

  test('only the checked choice takes the tab stop, and the arrow keys move the choice and wrap', () => {
    const chosen: ThemeChoice[] = [];
    renderedHeader(boardStateFixture(), { themeChoice: 'auto', onThemeChoice: (choice) => chosen.push(choice) });
    expect(screen.getAllByRole('radio').map((radio) => [radio.textContent, radio.getAttribute('tabindex')])).toEqual([['Auto', '0'], ['Light', '-1'], ['Dark', '-1']]);
    act(() => {
      fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Theme' }), { key: 'ArrowLeft' });
      fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Theme' }), { key: 'ArrowRight' });
    });
    expect(chosen).toEqual(['dark', 'light']);
  });

  test('Home and End choose the first and the last choice', () => {
    const chosen: ThemeChoice[] = [];
    renderedHeader(boardStateFixture(), { themeChoice: 'light', onThemeChoice: (choice) => chosen.push(choice) });
    act(() => {
      fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Theme' }), { key: 'End' });
      fireEvent.keyDown(screen.getByRole('radiogroup', { name: 'Theme' }), { key: 'Home' });
    });
    expect(chosen).toEqual(['dark', 'auto']);
  });
});

describe('the figures and the tabs', () => {
  test('the lane figures open the Kanban, incidents their tab, tokens nothing, and no figure counts the open questions', () => {
    renderedHeader(boardStateFixture());
    expect(screen.getByRole('link', { name: 'Show 1 / 4 agents working on Kanban' }).getAttribute('href')).toBe('#kanban');
    expect(screen.queryByRole('link', { name: /open questions/u })).toBeNull();
    expect(screen.getByRole('link', { name: 'Show 0 open incidents on Assistant' }).getAttribute('href')).toBe('#assistant');
    expect(screen.queryByRole('link', { name: /tokens today/u })).toBeNull();
  });

  test('the agents figure explains what it counts in its title', () => {
    renderedHeader(boardStateFixture());
    expect(screen.getByRole('link', { name: /agents working/u }).getAttribute('title'))
      .toBe('Build and review jobs against the limit of 4; the Assistant and product-owner jobs do not count');
    expect(screen.getByRole('link', { name: /done today/u }).getAttribute('title')).toBeNull();
  });

  test('a lane\'s figure asks for its Kanban lane as it opens the tab, and a figure of no lane asks for none', () => {
    const lanes: HeaderFigureLane[] = [];
    renderedHeader(boardStateFixture(), { onShowLane: (lane) => lanes.push(lane) });
    for (const name of [/agents working/u, /done today/u, /waiting in queue/u, /open incidents/u]) fireEvent.click(screen.getByRole('link', { name }));
    expect(lanes).toEqual(['building', 'done', 'ready']);
    window.location.hash = '';
  });

  test('the arrow keys, Home and End move to a tab, wrapping at the ends, and open it', () => {
    renderedHeader(boardStateFixture());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('bridge-tab'));
    const pressed = (key: string): void => {
      fireEvent.keyDown(document.activeElement ?? document.body, { key });
    };
    tabs[0]?.focus();
    pressed('ArrowRight');
    expect([document.activeElement?.textContent, window.location.hash]).toEqual(['Waves', '#waves']);
    pressed('End');
    expect([document.activeElement?.textContent, window.location.hash]).toEqual(['Intake', '#intake']);
    pressed('ArrowRight');
    expect([document.activeElement?.textContent, window.location.hash]).toEqual(['Kanban', '#kanban']);
    pressed('ArrowLeft');
    pressed('Home');
    expect([document.activeElement?.textContent, window.location.hash]).toEqual(['Kanban', '#kanban']);
    window.location.hash = '';
  });

  test('the tabs follow the order given and mark the selected one', () => {
    renderedHeader(boardStateFixture());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('bridge-tab'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Kanban', 'Waves', 'Progress', 'Epics', 'Tickets', 'Agents', 'Questions', 'Assistant', 'Intake']);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
  });
});

describe('the activity strip', () => {
  const REVIEWER_JOB = exampleAgentJob({
    id: 'J14', kind: 'review', role: 'reviewer', ticketIds: ['4'], launchedAt: '2026-10-29T11:50:00'
  });

  const PRODUCT_OWNER_JOB = exampleAgentJob({
    id: 'J15', kind: 'product-owner', role: 'product-owner', ticketIds: [], launchedAt: '2026-10-29T11:00:00'
  });

  function stripBoard(jobs: readonly IdentifiedRecord[], slotJobIds: readonly string[], inProgressTicketIdsWithoutJob: readonly string[] = []): BoardStateDocument {
    return boardStateFixture({ jobs, concurrency: { limit: 4, agentsInFlight: slotJobIds.length }, launchSlots: { limit: 4, slotJobIds, inProgressTicketIdsWithoutJob }, });
  }

  function strip(): HTMLElement {
    return screen.getByRole('status', { name: 'Agents at work' });
  }

  test('the strip shows one chip per slot job, with its id, role, ticket title and time, linking to the job on the Agents tab', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB, REVIEWER_JOB], ['J12', 'J14']));
    const chips = within(strip()).getAllByRole('link').filter((link) => link.classList.contains('bridge-activity-job'));
    expect(chips.map((chip) => [chip.textContent, chip.getAttribute('href'), chip.getAttribute('data-state')])).toEqual([
      ['J12builderExample in progress40m 00s', '#agents/J12', 'in-progress'],
      ['J14reviewerExample waiting10m 00s', '#agents/J14', 'reviewing'],
    ]);
    expect(screen.getByRole('link', { name: 'Job J12, builder, Example in progress' })).toBe(chips[0] as HTMLElement);
  });

  test('the Assistant and a product-owner job running beside the builders get no chip', () => {
    renderedHeader(stripBoard([FIXTURE_ASSISTANT_JOB, FIXTURE_BUILDER_JOB, PRODUCT_OWNER_JOB], ['J12']));
    expect([...document.querySelectorAll('.bridge-activity-job-id')].map((jobId) => jobId.textContent)).toEqual(['J12']);
  });

  test('the counts read building and reviewing before the chips', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB, REVIEWER_JOB], ['J12', 'J14']));
    const counts = strip().querySelector('.bridge-activity-counts');
    expect(counts?.textContent).toBe('1building·1reviewing');
    expect(counts?.nextElementSibling?.getAttribute('aria-label')).toBe('Worker jobs');
  });

  test('tickets in progress with no Overseer job show as one flag linking to the Agents tab, and no flag shows without them', () => {
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12'], ['3', '4']));
    const flag = within(strip()).getByRole('link', { name: '2 in progress with no Overseer job' });
    expect([flag.getAttribute('href'), flag.getAttribute('data-tone'), flag.getAttribute('title')]).toEqual([
      '#agents', 'warn', '2 tickets are in progress on the board with no Overseer job behind them',
    ]);
    cleanup();
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']));
    expect(within(strip()).queryByRole('link', { name: /no Overseer job/u })).toBeNull();
  });

  test('with no slot job it says no agent is working, and still flags tickets with no job', () => {
    renderedHeader(stripBoard([FIXTURE_ASSISTANT_JOB], [], ['3']));
    expect(strip().textContent).toBe('No agent is working right now.1 in progress with no Overseer job');
    expect(strip().querySelector('.bridge-tag')?.getAttribute('title')).toBe('1 ticket is in progress on the board with no Overseer job behind it');
  });

  test('a live strip ticks each second from the injected clock', () => {
    const { clock, advance } = tickingClock();
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']), { clock });
    expect(strip().querySelector('.bridge-activity-job-elapsed')?.textContent).toBe('40m 00s');
    act(() => advance(2000));
    expect(strip().querySelector('.bridge-activity-job-elapsed')?.textContent).toBe('40m 02s');
  });

  test('a strip whose stream is down keeps its times still', () => {
    const { clock, advance } = tickingClock();
    renderedHeader(stripBoard([FIXTURE_BUILDER_JOB], ['J12']), { activityIsLive: false, clock });
    act(() => advance(2000));
    expect(strip().querySelector('.bridge-activity-job-elapsed')?.textContent).toBe('40m 00s');
  });
});

describe('the summary line and the stale notice', () => {
  test('the summary line counts the states, then today\'s figures', () => {
    renderedHeader(boardStateFixture());
    const items = [...document.querySelectorAll('.bridge-summary-line-item')].map((item) => [
      item.querySelector('.bridge-summary-line-dot')?.getAttribute('data-state') ?? null,
      item.querySelector('.bridge-summary-line-label')?.textContent,
    ]);
    expect(items).toEqual([
      ['in-progress', 'building'],
      ['reviewing', 'reviewing'],
      ['pending', 'waiting in queue'],
      ['paused', 'paused'],
      ['delivered', 'done today'],
      [null, 'tokens today'],
    ]);
  });

  test('the stale notice shows only while the stream is down', () => {
    renderedHeader(boardStateFixture());
    expect(screen.queryByText(STALE_NOTICE_TEXT)).toBeNull();
    cleanup();
    renderedHeader(boardStateFixture(), { connection: 'down' });
    expect(screen.getByText(STALE_NOTICE_TEXT)).toBeTruthy();
  });
});

describe('waiting on User', () => {
  function pill(): HTMLElement {
    return screen.getByRole('button', { name: /^Waiting on User/u });
  }

  function inbox(): HTMLElement {
    return screen.getByRole('dialog', { name: 'Waiting on User' });
  }

  function opened(): void {
    act(() => {
      fireEvent.click(pill());
    });
  }

  test('the pill names the total and the escalated, rose with the red dot while an escalated item waits', () => {
    renderedWaitingHeader(waitingOnUserBoard(), { clock: STILL_CLOCK });
    expect([pill().getAttribute('aria-label'), pill().textContent, pill().getAttribute('data-state'), pill().getAttribute('aria-expanded')])
      .toEqual(['Waiting on User: 8, 1 escalated', 'Waiting on User·8', 'ready-for-review', 'false']);
    expect(pill().querySelector('.bridge-attention-pill-dot')).not.toBeNull();
    cleanup();
    renderedWaitingHeader(waitingOnUserBoard({ questionHistory: [] }));
    expect(pill().querySelector('.bridge-attention-pill-dot')).toBeNull();
  });

  test('a click opens the inbox, its rows in the model\'s order with their actions, the escalated row first and primary, and focuses its action', () => {
    renderedWaitingHeader(waitingOnUserBoard(), { clock: tickingClock(WAITING_FIXTURE_NOW).clock });
    opened();
    expect(pill().getAttribute('aria-expanded')).toBe('true');
    const rows = within(inbox()).getAllByRole('listitem');
    expect(rows.map((row) => [row.querySelector('.bridge-ask-line .bridge-ticket-id')?.textContent,
      row.querySelector('.bridge-ask-side a')?.textContent,
      row.querySelector('.bridge-ask-side a')?.getAttribute('href')])).toEqual([
      ['E3', 'Answer', '#questions'],
      ['D2', 'Answer', '#kanban/draft/D2'],
      ['E2', 'Answer', '#questions'],
      ['#009', 'Ready', '#kanban/ticket/009'],
      ['#006', 'Review', '#kanban/ticket/006'],
      ['#005', 'Accept', '#kanban/ticket/005'],
      ['#015', 'Ready', '#kanban/ticket/015'],
      ['E4', 'Answer', '#questions'],
    ]);
    const escalatedAction = rows[0]?.querySelector('.bridge-ask-side a');
    expect([rows[0]?.hasAttribute('data-escalated'), escalatedAction?.hasAttribute('data-primary'), rows[1]?.querySelector('.bridge-ask-side a')?.hasAttribute('data-primary')])
      .toEqual([true, true, false]);
    expect(document.activeElement).toBe(escalatedAction ?? null);
    expect(rows[0]?.querySelector('.bridge-card-meta')?.textContent).toBe('asked by builder · job J3 · escalated by the Assistant from I2');
    expect(rows[0]?.querySelector('.bridge-stamp')?.textContent).toBe('40s');
  });

  test('Esc closes the inbox, is marked handled and hands the focus back to the pill', () => {
    renderedWaitingHeader(waitingOnUserBoard());
    opened();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.activeElement?.dispatchEvent(escape);
    });
    expect([screen.queryByRole('dialog'), escape.defaultPrevented, document.activeElement]).toEqual([null, true, pill()]);
  });

  test('a pointer down outside closes the inbox, and so does following a link in it', () => {
    renderedWaitingHeader(waitingOnUserBoard());
    opened();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    opened();
    act(() => {
      fireEvent.click(within(inbox()).getByRole('link', { name: 'All questions' }));
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    window.location.hash = '';
  });

  test('Drafts on Kanban asks for the Ready lane', () => {
    const lanes: HeaderFigureLane[] = [];
    renderedWaitingHeader(waitingOnUserBoard(), { onShowLane: (lane) => lanes.push(lane) });
    opened();
    act(() => {
      fireEvent.click(within(inbox()).getByRole('link', { name: 'Drafts on Kanban' }));
    });
    expect(lanes).toEqual(['ready']);
    window.location.hash = '';
  });

  test('with nothing waiting the pill stays, neutral, and the inbox says nothing waits', () => {
    renderedWaitingHeader(nothingWaitingBoard());
    expect([pill().getAttribute('aria-label'), pill().hasAttribute('data-state')]).toEqual(['Waiting on User: none', false]);
    opened();
    expect([within(inbox()).getByText('Nothing waits on User.'), within(inbox()).queryAllByRole('listitem')]).toEqual([expect.anything(), []]);
  });

  test('the inbox asks for the notification allowance from a click while it is unasked, and the control goes once it is granted', async () => {
    let allowance: NotificationAllowance = 'default';
    const notifier: QuestionNotifier = {
      ...NO_NOTIFIER,
      allowance:    () => allowance,
      askAllowance: () => {
        allowance = 'granted';
        return Promise.resolve(allowance);
      },
    };
    renderedWaitingHeader(waitingOnUserBoard(), { notifier });
    opened();
    await act(async () => {
      fireEvent.click(within(inbox()).getByRole('button', { name: 'Notify me of new questions' }));
      await Promise.resolve();
    });
    expect(within(inbox()).queryByRole('button', { name: 'Notify me of new questions' })).toBeNull();
  });

  test('the ages tick each second from the injected clock while live, and stand still while the stream is down', () => {
    const live = tickingClock(WAITING_FIXTURE_NOW);
    renderedWaitingHeader(waitingOnUserBoard(), { clock: live.clock });
    opened();
    act(() => live.advance(2000));
    expect(inbox().querySelector('.bridge-stamp')?.textContent).toBe('42s');
    cleanup();
    const down = tickingClock(WAITING_FIXTURE_NOW);
    renderedWaitingHeader(waitingOnUserBoard(), { clock: down.clock, activityIsLive: false });
    opened();
    act(() => down.advance(2000));
    expect(inbox().querySelector('.bridge-stamp')?.textContent).toBe('40s');
  });
});

describe('the tab counts', () => {
  function tab(name: RegExp): HTMLElement {
    return screen.getAllByRole('link').find((link) => link.classList.contains('bridge-tab') && name.test(link.textContent ?? '')) ?? document.body;
  }

  test('Questions shows the escalated count with its dot, Kanban the rose count and the Assistant the grey one, each naming what it counts', () => {
    renderedWaitingHeader(waitingOnUserBoard());
    const badges = [/^Questions/u, /^Kanban/u, /^Assistant/u].map((name) => {
      const badge = tab(name).querySelector('.bridge-count-badge');
      return [tab(name).getAttribute('aria-label'),
        badge?.textContent,
        badge?.getAttribute('data-tone'),
        badge?.getAttribute('data-state') ?? null,
        badge?.querySelector('.bridge-count-badge-dot') !== null];
    });
    expect(badges).toEqual([
      ['Questions, 3 questions wait on User, 1 escalated', '3', 'error', null, true],
      ['Kanban, 5 wait on User', '5', 'state', 'ready-for-review', false],
      ['Assistant, 1 incident the Assistant is settling', '1', 'neutral', null, false],
    ]);
  });

  test('a tab with nothing to count shows no badge and keeps its label as its name', () => {
    renderedWaitingHeader(nothingWaitingBoard());
    expect(document.querySelectorAll('.bridge-tab .bridge-count-badge')).toHaveLength(0);
    expect(tab(/^Questions/u).hasAttribute('aria-label')).toBe(false);
  });
});
