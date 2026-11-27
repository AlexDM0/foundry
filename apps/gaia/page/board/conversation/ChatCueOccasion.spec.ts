/**
 * Which cue a chat's turns give Flint: only the newest turn that is not a system line counts, and the occasion key changes with the turn, so
 * the same cue on the next turn is a new happening.
 */
import { describe, expect, test } from 'bun:test';

import { chatCueOccasionOf }            from './ChatCueOccasion.ts';
import type { AgentChatTurn, ChatTurn } from './ChatThread.tsx';
import type { ToolCallLine }            from './ToolUseFold.tsx';

function callOf(outcome: ToolCallLine['outcome']): ToolCallLine {
  return {
    key: `call-${outcome}`, toolName: 'Bash', inputText: 'bun test', outcome, resultText: null, startedAt: null,
  };
}

function agentTurn(key: string, facts: { readonly working: boolean; readonly prose?: string; readonly calls?: readonly ToolCallLine[] }): AgentChatTurn {
  return {
    kind:        'agent',
    key,
    speaker:     'Assistant',
    state:       'in-progress',
    stamp:       null,
    workingText: facts.working ? 'working' : null,
    toolUse:     facts.calls === undefined
      ? null
      : {
        summaryText: 'Used tools', namesText: 'Bash', errorText: null, calls: facts.calls, openAtFirst: false,
      },
    prose: facts.prose ?? '',
  };
}

const SYSTEM_LINE: ChatTurn = {
  kind: 'system', key: 'system-1', text: 'Booting a fresh session.', stamp: null, revealText: null,
};

const USER_MESSAGE: ChatTurn = {
  kind: 'user', key: 'user-1', speaker: 'User', stamp: null, stampSuffix: null, text: 'Example question', queued: null, pictures: null,
};

describe('the newest turn that is not a system line gives the cue', () => {
  test('an empty thread and one of system lines alone give none', () => {
    expect(chatCueOccasionOf([])).toBeNull();
    expect(chatCueOccasionOf([SYSTEM_LINE])).toBeNull();
  });

  test('a system line after an agent turn leaves the agent turn\'s cue', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: false }), SYSTEM_LINE])).toEqual({ cueName: 'agent-is-done', occasionKey: 'turn-1:agent-is-done' });
  });

  test('User\'s message gives none', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: false }), USER_MESSAGE])).toBeNull();
  });

  test('a decision asks a question', () => {
    const decisionTurn: ChatTurn = { kind: 'decision', key: 'decision-D3', decisionId: 'D3' };
    expect(chatCueOccasionOf([decisionTurn])?.cueName).toBe('agent-asks-a-question');
  });
});

describe('an agent turn', () => {
  test('working with no prose and no running call thinks', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: true })])?.cueName).toBe('agent-is-thinking');
  });

  test('working with prose writes', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: true, prose: 'Example answer' })])?.cueName).toBe('agent-is-writing');
  });

  test('working while its last call runs calls a tool, also with prose before it', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: true, prose: 'Example answer', calls: [callOf('ok'), callOf('running')] })])?.cueName)
      .toBe('agent-calls-a-tool');
  });

  test('whose last call failed failed, working or ended', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: true, calls: [callOf('error')] })])?.cueName).toBe('agent-failed');
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: false, calls: [callOf('error')] })])?.cueName).toBe('agent-failed');
  });

  test('ended is done, a failed call before a good last call included', () => {
    expect(chatCueOccasionOf([agentTurn('turn-1', { working: false, calls: [callOf('error'), callOf('ok')] })])?.cueName).toBe('agent-is-done');
  });

  test('the same cue on the next turn is a new occasion', () => {
    const first = chatCueOccasionOf([agentTurn('turn-1', { working: false })]);
    const next = chatCueOccasionOf([agentTurn('turn-1', { working: false }), USER_MESSAGE, agentTurn('turn-2', { working: false })]);
    expect(first?.cueName).toBe(next?.cueName as string);
    expect(first?.occasionKey).not.toBe(next?.occasionKey as string);
  });
});
