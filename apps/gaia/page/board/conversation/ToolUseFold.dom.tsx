/**
 * The tool use fold, in a happy-dom document, on a fake board clock. What matters: closed, it says how many tools ran, which, and how many
 * failed; open, it lists each call with its input and result and names each call's outcome; a running call ticks its elapsed time on the
 * clock, and one with no start shows no time rather than an invented one; User's close of an open fold outlasts the next entries of the turn,
 * so a live turn never springs open again; the live turn's fold closes once the turn ends, unless User opened it, so only the live turn
 * stays open; and the tool's names, inputs and results are text, never markup.
 */
import {
  act,
  cleanup,
  fireEvent,
  render
} from '@testing-library/react';
import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { BoardClockContext, type BoardClock }           from '../shell/BoardClock.ts';
import { ToolUseFold, type ToolCallLine, type ToolUse } from './ToolUseFold.tsx';

afterEach(() => {
  cleanup();
});

const CLOCK_START = new Date('2026-11-09T14:12:00Z');

const FINISHED_CALLS: readonly ToolCallLine[] = [
  {
    key: 'call-1', toolName: 'Bash', inputText: 'agent-progress ticket show 002', outcome: 'ok', resultText: 'ok', startedAt: null,
  },
  {
    key: 'call-2', toolName: 'Read', inputText: '.agent-progress/tickets/002-orders-csv-export.md', outcome: 'error', resultText: 'error', startedAt: null,
  },
];

const RUNNING_CALL: ToolCallLine = {
  key: 'call-3', toolName: 'Read', inputText: '.agent-progress/review-brief.md', outcome: 'running', resultText: null, startedAt: '2026-11-09T14:11:48Z',
};

const CLOSED_TOOL_USE: ToolUse = {
  summaryText: 'Used 2 tools',
  namesText:   'Bash · Read',
  errorText:   '1 error',
  calls:       FINISHED_CALLS,
  openAtFirst: false,
};

const WORKING_TOOL_USE: ToolUse = {
  summaryText: 'Using tools · 3 so far',
  namesText:   'Read ×2 · Bash',
  errorText:   '1 error',
  calls:       [...FINISHED_CALLS, RUNNING_CALL],
  openAtFirst: true,
};

function tickingClock(): { readonly clock: BoardClock; readonly advance: (milliseconds: number) => void } {
  let now = CLOCK_START.getTime();
  const ticks: (() => void)[] = [];
  return {
    clock: {
      now:         () => new Date(now),
      everySecond: (tick) => {
        ticks.push(tick);
        return () => undefined;
      },
      after: () => () => undefined,
    },
    advance: (milliseconds) => {
      now += milliseconds;
      ticks.forEach((tick) => tick());
    },
  };
}

function renderedFold(toolUse: ToolUse, clock: BoardClock = tickingClock().clock) {
  return render(
    <BoardClockContext.Provider value={clock}>
      <ToolUseFold toolUse={toolUse} />
    </BoardClockContext.Provider>,
  );
}

function foldOf(container: HTMLElement): HTMLDetailsElement | null {
  return container.querySelector<HTMLDetailsElement>('.board-tool-fold');
}

describe('the tool use fold', () => {
  test('closed, it says how many tools ran, which, and how many failed', () => {
    const { container } = renderedFold(CLOSED_TOOL_USE);
    expect([
      foldOf(container)?.open,
      container.querySelector('.board-tool-fold-summary strong')?.textContent,
      container.querySelector('.board-tool-fold-names')?.textContent,
      container.querySelector('.board-tool-fold-errors')?.textContent,
    ]).toEqual([false, 'Used 2 tools', 'Bash · Read', '1 error']);
  });

  test('with no error it shows no error count', () => {
    const { container } = renderedFold({ ...CLOSED_TOOL_USE, errorText: null });
    expect(container.querySelector('.board-tool-fold-errors')).toBeNull();
  });

  test('open, it lists each call with its input, its result and its outcome', () => {
    const { container } = renderedFold(WORKING_TOOL_USE);
    expect(foldOf(container)?.open).toBe(true);
    expect([...container.querySelectorAll('.board-tool-call')].map((call) => [
      call.getAttribute('data-outcome'),
      call.querySelector('.board-tool-call-name')?.textContent,
      call.querySelector('.board-tool-call-input')?.textContent,
      call.querySelector('.board-tool-call-result')?.textContent,
    ])).toEqual([
      ['ok', 'Bash', 'agent-progress ticket show 002', 'ok'],
      ['error', 'Read', '.agent-progress/tickets/002-orders-csv-export.md', 'error'],
      ['running', 'Read', '.agent-progress/review-brief.md', 'running 12s'],
    ]);
  });

  test('a running call ticks its elapsed time on the clock', () => {
    const { clock, advance } = tickingClock();
    const { container } = renderedFold(WORKING_TOOL_USE, clock);
    const runningResult = (): string | null | undefined => container.querySelector('[data-outcome="running"] .board-tool-call-result')?.textContent;
    expect(runningResult()).toBe('running 12s');
    act(() => advance(50_000));
    expect(runningResult()).toBe('running 1m 02s');
  });

  test('a running call with no start shows no time', () => {
    const { container } = renderedFold({ ...WORKING_TOOL_USE, calls: [{ ...RUNNING_CALL, startedAt: null }] });
    expect(container.querySelector('.board-tool-call-result')?.textContent).toBe('running');
  });

  test('a press on the summary opens a closed fold', () => {
    const { container } = renderedFold(CLOSED_TOOL_USE);
    const summary = container.querySelector('.board-tool-fold-summary');
    if (summary !== null) fireEvent.click(summary);
    expect(foldOf(container)?.open).toBe(true);
  });

  test('User\'s close of an open fold outlasts the next entries of the turn', () => {
    const { clock } = tickingClock();
    const { container, rerender } = renderedFold(WORKING_TOOL_USE, clock);
    const summary = container.querySelector('.board-tool-fold-summary');
    if (summary !== null) fireEvent.click(summary);
    const nextCall: ToolCallLine = { ...RUNNING_CALL, key: 'call-4', toolName: 'Grep' };
    rerender(
      <BoardClockContext.Provider value={clock}>
        <ToolUseFold toolUse={{ ...WORKING_TOOL_USE, summaryText: 'Using tools · 4 so far', calls: [...WORKING_TOOL_USE.calls, nextCall] }} />
      </BoardClockContext.Provider>,
    );
    expect([foldOf(container)?.open, container.querySelector('.board-tool-fold-summary strong')?.textContent, container.querySelectorAll('.board-tool-call').length])
      .toEqual([false, 'Using tools · 4 so far', 4]);
  });

  test('the live turn\'s fold closes once the turn ends', () => {
    const { clock } = tickingClock();
    const { container, rerender } = renderedFold(WORKING_TOOL_USE, clock);
    rerender(
      <BoardClockContext.Provider value={clock}>
        <ToolUseFold toolUse={{ ...CLOSED_TOOL_USE, openAtFirst: false }} />
      </BoardClockContext.Provider>,
    );
    expect(foldOf(container)?.open).toBe(false);
  });

  test('a fold User opened stays open once the turn ends', () => {
    const { clock } = tickingClock();
    const { container, rerender } = renderedFold(WORKING_TOOL_USE, clock);
    const summary = container.querySelector('.board-tool-fold-summary');
    if (summary !== null) {
      fireEvent.click(summary);
      fireEvent.click(summary);
    }
    rerender(
      <BoardClockContext.Provider value={clock}>
        <ToolUseFold toolUse={CLOSED_TOOL_USE} />
      </BoardClockContext.Provider>,
    );
    expect(foldOf(container)?.open).toBe(true);
  });

  test('the tool\'s names, inputs and results are text, never markup', () => {
    const plantedCall: ToolCallLine = {
      key: 'planted', toolName: '<b>planted</b>', inputText: '<b>planted</b>', outcome: 'ok', resultText: '<b>planted</b>', startedAt: null,
    };
    const { container } = renderedFold({ ...CLOSED_TOOL_USE, namesText: '<b>planted</b>', calls: [plantedCall] });
    expect([container.querySelector('b'), container.querySelector('.board-tool-call-input')?.textContent]).toEqual([null, '<b>planted</b>']);
  });
});
