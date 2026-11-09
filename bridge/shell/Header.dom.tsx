/**
 * The header against a fake command client. What matters: Pause, Resume and Restart post the ControlCommands they name, Restart only
 * with new code on disk; Stop Overseer posts `overseer-stop` only after its confirmation, and Cancel posts nothing; a Baton pass reads
 * Handing over and withdraws the controls; the concurrency control posts the limit asked for; the theme switch moves with the arrow keys
 * and keeps one tab stop; the figures link to their tabs; the activity strip ticks from the injected clock only while it is live.
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { BoardStateDocument }        from '../@types/BoardStateDocument.ts';
import type { ControlCommandBody }        from '../api/CommandClient.ts';
import { boardStateFixture, FIXTURE_NOW } from '../testing/BoardStateFixture.ts';
import type { ActivityEntry }             from './ActivityStripModel.ts';
import type { BridgeClock }               from './BridgeClock.ts';
import { ControlSurroundingsContext }     from './ControlAvailability.ts';
import { BRIDGE_TABS }                    from './HashRouter.ts';
import { Header }                         from './Header.tsx';
import { HeaderModelUtil }                from './HeaderModel.ts';
import type { ThemeChoice }               from './ThemeBootstrap.ts';

const STILL_CLOCK: BridgeClock = { now: () => FIXTURE_NOW, everySecond: () => () => undefined };

interface HeaderSurroundings {
  readonly themeChoice?:    ThemeChoice;
  readonly onThemeChoice?:  (choice: ThemeChoice) => void;
  readonly activity?:       readonly ActivityEntry[];
  readonly activityIsLive?: boolean;
  readonly clock?:          BridgeClock;
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
  render(
    <ControlSurroundingsContext.Provider value={controlSurroundings}>
      <Header
        project="Example Agency"
        model={HeaderModelUtil.headerModelOf(state, FIXTURE_NOW, 'live')}
        selectedTab="kanban"
        shownTabs={BRIDGE_TABS}
        themeChoice={surroundings.themeChoice ?? 'auto'}
        onThemeChoice={surroundings.onThemeChoice ?? (() => undefined)}
        activity={surroundings.activity ?? []}
        activityIsLive={surroundings.activityIsLive ?? true}
        clock={surroundings.clock ?? STILL_CLOCK}
      />
    </ControlSurroundingsContext.Provider>,
  );
  return sent;
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

  test('shows the board\'s confinement word unchanged', () => {
    renderedHeader(boardStateFixture({ confinement: 'unconfined-by-design' }));
    expect(screen.getByText('confinement unconfined-by-design')).toBeTruthy();
  });

  test('the concurrency control posts the limit asked for', async () => {
    const sent = renderedHeader(boardStateFixture());
    act(() => {
      fireEvent.change(screen.getByLabelText('Concurrency limit'), { target: { value: '6' } });
    });
    await clicked('Set');
    expect(sent).toEqual([{ kind: 'concurrency-set', limit: 6 }]);
  });
});

describe('the theme switch', () => {
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
});

describe('the figures and the tabs', () => {
  test('the lane figures open the Kanban, questions and incidents their tabs, and tokens nothing', () => {
    renderedHeader(boardStateFixture());
    expect(screen.getByRole('link', { name: 'Show 2 / 4 agents working on Kanban' }).getAttribute('href')).toBe('#kanban');
    expect(screen.getByRole('link', { name: 'Show 1 open questions on Questions' }).getAttribute('href')).toBe('#questions');
    expect(screen.getByRole('link', { name: 'Show 0 open incidents on Assistant' }).getAttribute('href')).toBe('#assistant');
    expect(screen.queryByRole('link', { name: /tokens today/u })).toBeNull();
  });

  test('the tabs follow the order given and mark the selected one', () => {
    renderedHeader(boardStateFixture());
    const tabs = screen.getAllByRole('link').filter((link) => link.classList.contains('bridge-tab'));
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Kanban', 'Waves', 'Progress', 'Epics', 'Tickets', 'Agents', 'Questions', 'Assistant', 'Intake']);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('page');
  });
});

describe('the activity strip', () => {
  const building: ActivityEntry = {
    taskId:                 3,
    kind:                   'building',
    stateToken:             'in-progress',
    kindLabel:              'Building',
    ticketId:               '3',
    title:                  'Example in progress',
    startEpochMilliseconds: FIXTURE_NOW.getTime() - 61_000,
  };

  function tickingClock(): { clock: BridgeClock; advance: (milliseconds: number) => void } {
    let now = FIXTURE_NOW.getTime();
    const ticks: (() => void)[] = [];
    return {
      clock:   { now: () => new Date(now), everySecond: (tick) => { ticks.push(tick); return () => undefined; } },
      advance: (milliseconds) => {
        now += milliseconds;
        ticks.forEach((tick) => tick());
      },
    };
  }

  test('with no agent it says so', () => {
    renderedHeader(boardStateFixture());
    expect(screen.getByRole('status', { name: 'Agents at work' }).textContent).toBe('No agent is working right now.');
  });

  test('a live strip ticks each second from the injected clock', () => {
    const { clock, advance } = tickingClock();
    renderedHeader(boardStateFixture(), { activity: [building], clock });
    expect(screen.getByRole('status', { name: 'Agents at work' }).textContent).toBe('Building#3Example in progress1m 01s');
    act(() => advance(2000));
    expect(screen.getByRole('status', { name: 'Agents at work' }).textContent).toEndWith('1m 03s');
  });

  test('a strip whose stream is down keeps its times still', () => {
    const { clock, advance } = tickingClock();
    renderedHeader(boardStateFixture(), { activity: [building], activityIsLive: false, clock });
    act(() => advance(2000));
    expect(screen.getByRole('status', { name: 'Agents at work' }).textContent).toEndWith('1m 01s');
  });
});
