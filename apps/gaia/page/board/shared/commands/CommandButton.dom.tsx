/**
 * The command button's wait, on a manual board clock with a forge whose answer the spec holds: a busy ring at once, the wait panel only once
 * the wait passes a second and only for a button that names its wait, closing when the forge answers.
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

import type { BoardCommandDocument }                                          from '../../../@types/board/BoardCommandDocument.ts';
import type { CommandOutcome }                                                from '../../api/BoardCommandClient.ts';
import { manualBoardClock }                                                   from '../../testing/ManualBoardClock.ts';
import { BoardClockContext }                                                  from '../BoardClock.ts';
import { CommandButton }                                                      from './CommandButton.tsx';
import { COMMAND_WAIT_PANEL_DELAY_MILLISECONDS, type CommandWaitExplanation } from './CommandWait.ts';
import { ControlSurroundingsContext, type ControlSurroundings }               from './ControlAvailability.ts';

const START_COMMAND: BoardCommandDocument = { boardCommandVersion: 3, kind: 'hephaestus-pause' };
const APPLIED: CommandOutcome = { verdict: 'applied', outcome: 'done', result: { startedJobId: null, writtenVersionNumber: null } };
const WAIT: CommandWaitExplanation = { title: 'Checking Claude Code', explanation: 'Forge starts the program once to check that it runs.' };
const BUTTON_LABEL = 'Continue to billing';

interface HeldForge {
  readonly answer: (outcome: CommandOutcome) => Promise<void>;
  readonly passes: (milliseconds: number) => void;
}

function renderedButton(wait: CommandWaitExplanation | undefined): HeldForge {
  const { clock, passes } = manualBoardClock();
  let answerNow: (outcome: CommandOutcome) => void = () => undefined;
  const surroundings: ControlSurroundings = {
    availability:  'enabled',
    commandClient: {
      send: () => new Promise<CommandOutcome>((resolve) => {
        answerNow = resolve;
      }),
    },
    onInstallHeld: () => undefined,
  };
  render(
    <BoardClockContext.Provider value={clock}>
      <ControlSurroundingsContext.Provider value={surroundings}>
        <CommandButton label={BUTTON_LABEL} command={START_COMMAND} primary {...(wait === undefined ? {} : { wait })} />
      </ControlSurroundingsContext.Provider>
    </BoardClockContext.Provider>,
  );
  return {
    answer: async (outcome) => {
      await act(async () => {
        answerNow(outcome);
        await Promise.resolve();
      });
    },
    passes,
  };
}

async function pressed(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: BUTTON_LABEL }));
    await Promise.resolve();
  });
}

afterEach(() => {
  cleanup();
});

describe('a command that waits on the forge', () => {
  test('shows a busy ring beside the button at once, and no panel within the second', async () => {
    renderedButton(WAIT);
    await pressed();
    expect(screen.getByRole('progressbar', { name: `${BUTTON_LABEL}: waiting on the forge` })).toBeDefined();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('opens the panel with its title and explanation once the wait passes a second, and closes it on the answer', async () => {
    const forge = renderedButton(WAIT);
    await pressed();
    forge.passes(COMMAND_WAIT_PANEL_DELAY_MILLISECONDS);
    const panel = screen.getByRole('dialog', { name: WAIT.title });
    expect([panel.textContent?.includes(WAIT.explanation), document.activeElement === panel]).toEqual([true, true]);
    await forge.answer(APPLIED);
    expect([screen.queryByRole('dialog'), screen.queryByRole('progressbar')]).toEqual([null, null]);
  });

  test('an answer within the second shows no panel, even once the second would have passed', async () => {
    const forge = renderedButton(WAIT);
    await pressed();
    await forge.answer(APPLIED);
    forge.passes(COMMAND_WAIT_PANEL_DELAY_MILLISECONDS);
    expect([screen.queryByRole('dialog'), screen.queryByRole('progressbar')]).toEqual([null, null]);
  });

  test('a button that names no wait shows only the ring, however long the forge takes', async () => {
    const forge = renderedButton(undefined);
    await pressed();
    forge.passes(COMMAND_WAIT_PANEL_DELAY_MILLISECONDS);
    expect([screen.queryByRole('dialog'), screen.getByRole('progressbar') instanceof HTMLElement]).toEqual([null, true]);
  });
});
