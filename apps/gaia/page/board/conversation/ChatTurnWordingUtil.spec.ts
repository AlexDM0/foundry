/**
 * The words every chat view gives its thread. What matters: a stamp is the local time with seconds and never invented for an entry with
 * none; the boot line is the view's own, with its chat number when it has one, and every other system line reads the same in every view;
 * a closed fold counts its tools and errors, the working one says how many so far and starts open; a call the turn ended without
 * answering reads as an error with no result.
 */
import { describe, expect, test } from 'bun:test';

import { TimeUtil }            from '../utils/TimeUtil.ts';
import { ChatTurnWordingUtil } from './ChatTurnWordingUtil.ts';

describe('ChatTurnWordingUtil.stampOf', () => {
  test('a stamp is the local time with seconds, the full date on hover, and none for an entry with no stamp', () => {
    const instant = Date.UTC(2026, 10, 10, 13, 5, 31);
    const today = TimeUtil.calendarDateOf(instant);
    const shortText = TimeUtil.secondsClockText(instant, today);
    const fullText = TimeUtil.fullInstantText(instant);
    expect(ChatTurnWordingUtil.stampOf(new Date(instant).toISOString(), today)).toEqual({ shortText, fullText, element: 'time' });
    expect(ChatTurnWordingUtil.stampOf(null, today)).toBeNull();
  });
});

describe('ChatTurnWordingUtil.systemLineTextOf', () => {
  test('the boot line is the view\'s own with its chat number, and the other lines read the same everywhere', () => {
    const boot = 'Hephaestus started J7';
    expect([
      ChatTurnWordingUtil.systemLineTextOf({ form: 'boot', chatSequence: null }, boot),
      ChatTurnWordingUtil.systemLineTextOf({ form: 'boot', chatSequence: 1 }, boot),
      ChatTurnWordingUtil.systemLineTextOf({ form: 'incident-delivery', chatSequence: 3, incidentIds: ['I2', 'I4'] }, boot),
      ChatTurnWordingUtil.systemLineTextOf({ form: 'hephaestus-chat' }, boot),
      ChatTurnWordingUtil.systemLineTextOf({ form: 'standing-reply' }, boot),
      ChatTurnWordingUtil.systemLineTextOf({ form: 'client-act', act: 'answer', sender: 'assistant' }, boot),
      ChatTurnWordingUtil.systemLineTextOf({ form: 'client-act', act: 'stop', sender: 'hephaestus' }, boot),
    ]).toEqual([
      'Hephaestus started J7',
      'Hephaestus started J7 · chat 1',
      'Hephaestus delivered I2, I4 · chat 3',
      'Hephaestus sent a message',
      'Talos sent a standing reply',
      'The Assistant answered a question',
      'Hephaestus stopped the session',
    ]);
  });
});

describe('ChatTurnWordingUtil.toolUseOf', () => {
  const fold = {
    calls: [
      {
        key: 'c1', toolName: 'Read', inputText: 'a.ts', state: 'ok', startedAt: null
      },
      {
        key: 'c2', toolName: 'Read', inputText: 'b.ts', state: 'unanswered', startedAt: null
      },
      {
        key: 'c3', toolName: 'Grep', inputText: 'basket', state: 'running', startedAt: null
      },
    ],
    toolCounts: [{ toolName: 'Read', count: 2 }, { toolName: 'Grep', count: 1 }],
    errorCount: 1,
  } as const;

  test('a closed fold counts its tools and errors; the working one says how many so far and starts open', () => {
    expect(ChatTurnWordingUtil.toolUseOf(fold, false)).toMatchObject({
      summaryText: 'Used 3 tools', namesText: 'Read ×2 · Grep', errorText: '1 error', openAtFirst: false
    });
    expect(ChatTurnWordingUtil.toolUseOf(fold, true)).toMatchObject({ summaryText: 'Using tools · 3 so far', openAtFirst: true });
  });

  test('a call the turn ended without answering reads as an error with no result, a running one with none yet', () => {
    expect(ChatTurnWordingUtil.toolUseOf(fold, false).calls.map((call) => [call.outcome, call.resultText])).toEqual([['ok', 'ok'], ['error', 'no result'], ['running', null]]);
  });
});
