/**
 * The chat thread's model over the transcript entries Hephaestus streams: a `turn-end` closes a turn, so `working` and the open fold never
 * depend on a clock; a call takes its outcome from the result with its `toolUseId`; a stamp is never invented; and every key is unique.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardTranscriptEntryDocument }                                  from '../../@types/board/ConversationDocument.ts';
import { ChatThreadModelUtil, type AgentTurnThreadItem, type ChatThreadItem } from './ChatThreadModel.ts';

const { threadItemsOf, turnCountOf } = ChatThreadModelUtil;

let sequence = 0;

function entryOf(fields: Partial<BoardTranscriptEntryDocument> & Pick<BoardTranscriptEntryDocument, 'role'>): BoardTranscriptEntryDocument {
  sequence += 1;
  return {
    cursor:          `1.${sequence}`,
    entryKey:        `1.${sequence}.0`,
    text:            '',
    at:              `2026-11-10T14:00:${String(sequence % 60).padStart(2, '0')}.000Z`,
    toolName:        null,
    parentToolUseId: null,
    toolUseId:       null,
    asksUser:        false,
    model:           null,
    tokens:          null,
    clientAct:       null,
    sentBy:          null,
    chatSequence:    null,
    incidentIds:     [],
    pictures:        [],
    ...fields,
  };
}

function agentTurnsOf(items: readonly ChatThreadItem[]): AgentTurnThreadItem[] {
  return items.filter((item): item is AgentTurnThreadItem => item.kind === 'agent-turn');
}

describe('ChatThreadModelUtil.threadItemsOf', () => {
  test('the session\'s entries up to a turn-end are one closed turn, its prose the texts joined and its stamp the turn-end\'s', () => {
    const turnEnd = entryOf({ role: 'turn-end' });
    const items = threadItemsOf([
      entryOf({ role: 'assistant', text: 'Reading the incident.' }),
      entryOf({ role: 'assistant', text: '' }),
      entryOf({ role: 'assistant', text: 'J4 is not hung.' }),
      turnEnd,
    ], []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'agent-turn', working: false, prose: 'Reading the incident.\n\nJ4 is not hung.', at: turnEnd.at, toolFold: null
    });
  });

  test('the newest turn with no turn-end is working, with no stamp, and a turn before it is not', () => {
    const items = agentTurnsOf(threadItemsOf([
      entryOf({ role: 'assistant', text: 'First.' }),
      entryOf({ role: 'turn-end' }),
      entryOf({ role: 'user', text: 'And #002?' }),
      entryOf({ role: 'assistant', text: 'Looking.' }),
    ], []));
    expect(items.map((item) => [item.prose, item.working, item.at === null])).toEqual([['First.', false, false], ['Looking.', true, true]]);
  });

  test('a standing reply in the middle of a turn parts it, and only the newest part works', () => {
    const items = threadItemsOf([
      entryOf({
        role: 'tool-call', toolName: 'Bash', toolUseId: 'call-1', text: 'agent-progress status'
      }),
      entryOf({ role: 'talos', text: '{"type":"control_response"}' }),
      entryOf({ role: 'tool-result', toolUseId: 'call-1' }),
      entryOf({ role: 'assistant', text: 'Done reading.' }),
    ], []);
    expect(items.map((item) => item.kind)).toEqual(['agent-turn', 'system', 'agent-turn']);
    expect(agentTurnsOf(items).map((item) => item.working)).toEqual([false, true]);
    expect(agentTurnsOf(items)[0]?.toolFold?.calls[0]?.state).toBe('ok');
  });

  test('a subagent\'s entries stay out of the thread', () => {
    const items = threadItemsOf([
      entryOf({
        role: 'tool-call', toolName: 'Task', toolUseId: 'task-1', text: 'Read the review'
      }),
      entryOf({ role: 'assistant', text: 'Subagent prose', parentToolUseId: 'task-1' }),
      entryOf({
        role: 'tool-call', toolName: 'Read', toolUseId: 'sub-1', text: 'review-brief.md', parentToolUseId: 'task-1'
      }),
      entryOf({ role: 'tool-result', toolUseId: 'task-1' }),
      entryOf({ role: 'turn-end' }),
    ], []);
    expect(agentTurnsOf(items).map((item) => [item.prose, item.toolFold?.calls.map((call) => call.toolName)])).toEqual([['', ['Task']]]);
  });

  test('a call takes its outcome from the result with its toolUseId, even when calls share a log line', () => {
    const sharedLine = { cursor: '7.3', at: '2026-11-10T14:00:00.000Z' };
    const items = threadItemsOf([
      entryOf({
        ...sharedLine, entryKey: '7.3.0', role: 'tool-call', toolName: 'Bash', toolUseId: 'call-a', text: 'git status'
      }),
      entryOf({
        ...sharedLine, entryKey: '7.3.1', role: 'tool-call', toolName: 'Read', toolUseId: 'call-b', text: 'README.md'
      }),
      entryOf({ role: 'tool-result', toolUseId: 'call-b', text: 'error' }),
      entryOf({ role: 'tool-result', toolUseId: 'call-a' }),
    ], []);
    const fold = agentTurnsOf(items)[0]?.toolFold;
    expect(fold?.calls.map((call) => [call.key, call.state])).toEqual([['7.3.0', 'ok'], ['7.3.1', 'error']]);
    expect(fold?.errorCount).toBe(1);
  });

  test('a call with no result runs while its turn works, and reads as unanswered once a turn-end came after it', () => {
    const running = threadItemsOf([entryOf({
      role: 'tool-call', toolName: 'Read', toolUseId: 'call-1', text: 'review-brief.md'
    })], []);
    expect(agentTurnsOf(running)[0]?.toolFold?.calls[0]?.state).toBe('running');
    const ended = threadItemsOf([
      entryOf({
        role: 'tool-call', toolName: 'Read', toolUseId: 'call-1', text: 'review-brief.md'
      }),
      entryOf({ role: 'turn-end', text: 'error' }),
    ], []);
    expect(agentTurnsOf(ended)[0]?.toolFold).toMatchObject({ errorCount: 1, calls: [{ state: 'unanswered' }] });
  });

  test('the fold counts its tools most used first, a tie in the order the tools first ran', () => {
    const calls = ['Grep', 'Bash', 'Read', 'Bash', 'Bash', 'Bash'].map((toolName, position) => entryOf({
      role: 'tool-call', toolName, toolUseId: `call-${position}`, text: 'input'
    }));
    const fold = agentTurnsOf(threadItemsOf([...calls, entryOf({ role: 'turn-end' })], []))[0]?.toolFold;
    expect(fold?.toolCounts).toEqual([{ toolName: 'Bash', count: 4 }, { toolName: 'Grep', count: 1 }, { toolName: 'Read', count: 1 }]);
  });

  test('Hephaestus\'s first chat is the boot line with its prompt, a later one with incidents a delivery, any other a plain chat', () => {
    const items = threadItemsOf([
      entryOf({
        role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', chatSequence: 1, text: 'You are the Assistant.'
      }),
      entryOf({ role: 'turn-end' }),
      entryOf({
        role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', chatSequence: 3, incidentIds: ['I2'], text: 'I2 opened.'
      }),
      entryOf({
        role: 'hephaestus', clientAct: 'chat', sentBy: 'hephaestus', text: 'Wind down.'
      }),
    ], []);
    expect(items.map((item) => (item.kind === 'system' ? [item.facts, item.revealText] : item.kind))).toEqual([
      [{ form: 'boot', chatSequence: 1 }, 'You are the Assistant.'],
      [{ form: 'incident-delivery', chatSequence: 3, incidentIds: ['I2'] }, 'I2 opened.'],
      [{ form: 'hephaestus-chat' }, 'Wind down.'],
    ]);
  });

  test('a Talos line is a standing reply that shows no text, and a client act names its act and who did it', () => {
    const items = threadItemsOf([
      entryOf({ role: 'talos', text: '{"type":"control_response"}' }),
      entryOf({ role: 'hephaestus', clientAct: 'interrupt', sentBy: 'hephaestus' }),
      entryOf({
        role: 'hephaestus', clientAct: 'answer', sentBy: 'assistant', text: 'Retry the gate'
      }),
    ], []);
    expect(items.map((item) => (item.kind === 'system' ? [item.facts, item.revealText] : item.kind))).toEqual([
      [{ form: 'standing-reply' }, null],
      [{ form: 'client-act', act: 'interrupt', sender: 'hephaestus' }, null],
      [{ form: 'client-act', act: 'answer', sender: 'assistant' }, null],
    ]);
  });

  test('User\'s message keeps its own stamp, and an entry with no stamp gives none', () => {
    const stamped = entryOf({ role: 'user', text: 'Why did #001 restart twice?' });
    const items = threadItemsOf([stamped, entryOf({ role: 'user', text: 'Hold #008.', at: null })], []);
    expect(items.map((item) => item.at)).toEqual([stamped.at, null]);
  });

  test('the queued messages come after everything else, in the order they were sent', () => {
    const items = threadItemsOf([entryOf({ role: 'assistant', text: 'Looking.' })], [
      { at: '2026-11-10T15:12:10+01:00', text: 'Hold #008 until #007 lands.' },
      { at: '2026-11-10T15:12:30+01:00', text: 'Hold #008 until #007 lands.' },
    ]);
    expect(items.map((item) => (item.kind === 'user-message' ? [item.text, item.queued] : item.kind)))
      .toEqual(['agent-turn', ['Hold #008 until #007 lands.', true], ['Hold #008 until #007 lands.', true]]);
  });

  test('every item has its own key, entries that share a log line included', () => {
    const sharedLine = { cursor: '2.1', at: null };
    const items = threadItemsOf([
      entryOf({
        ...sharedLine, entryKey: '2.1.0', role: 'assistant', text: 'One.'
      }),
      entryOf({
        ...sharedLine, entryKey: '2.1.1', role: 'turn-end', text: ''
      }),
      entryOf({
        ...sharedLine, entryKey: '2.1.2', role: 'user', text: 'Two.'
      }),
    ], [{ at: '2026-11-10T15:12:10+01:00', text: 'Three.' }]);
    const keys = items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(['2.1.0', '2.1.2', 'queued.0']);
  });

  test('a markup-looking text is carried as text', () => {
    const planted = '<img src=x onerror="window.planted = true">';
    expect(agentTurnsOf(threadItemsOf([entryOf({ role: 'assistant', text: planted })], []))[0]?.prose).toBe(planted);
  });
});

describe('ChatThreadModelUtil.turnCountOf', () => {
  test('counts closed turns and the working one, a turn parted by a standing reply once', () => {
    expect(turnCountOf([
      entryOf({ role: 'hephaestus', clientAct: 'chat', text: 'Boot.' }),
      entryOf({ role: 'assistant', text: 'One.' }),
      entryOf({ role: 'turn-end' }),
      entryOf({
        role: 'tool-call', toolName: 'Bash', toolUseId: 'call-1', text: 'ls'
      }),
      entryOf({ role: 'talos', text: 'reply' }),
      entryOf({ role: 'tool-result', toolUseId: 'call-1' }),
      entryOf({ role: 'turn-end' }),
      entryOf({ role: 'assistant', text: 'Three.' }),
    ])).toBe(3);
  });

  test('a turn-end with no entry of the session before it counts no turn', () => {
    expect(turnCountOf([entryOf({ role: 'user', text: 'Hello' }), entryOf({ role: 'turn-end', text: 'error' })])).toBe(0);
  });
});
