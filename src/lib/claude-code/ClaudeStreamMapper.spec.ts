/**
 * The mapper is the Overseer's only reading of a Claude session, so each case replays a recorded 2.1.311 fixture
 * (`docs/development/overseer-claude-probe.md`) rather than a hand-written line: the start, a question the Overseer must deliver, the denials it
 * counts, the structured report it verifies, and the two rate-limit shapes of which only the top-level refusal may interrupt a job.
 * The API billing results (a refused key, a budget stop) have no recording yet: those cases plant their values over a recorded result line.
 * A subagent's spawning call has no recording either: its case writes the line, and holds that the call's description arrives whole.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { describe, expect, test } from 'bun:test';

import type { AgentSessionEvent } from '../agent-launch/AgentSessionEvent.ts';
import { claudeStreamEventsOf }   from './ClaudeStreamMapper.ts';

const FIXTURES_FOLDER = join(import.meta.dir, 'testing', 'fixtures');

function eventsOfFixture(name: string): AgentSessionEvent[] {
  return readFileSync(join(FIXTURES_FOLDER, `${name}.stdout.jsonl`), 'utf8').split('\n').flatMap((line) => [...claudeStreamEventsOf(line)]);
}

function eventsOfKind<Kind extends AgentSessionEvent['kind']>(events: readonly AgentSessionEvent[], kind: Kind): Extract<AgentSessionEvent, { kind: Kind }>[] {
  return events.filter((event): event is Extract<AgentSessionEvent, { kind: Kind }> => event.kind === kind);
}

describe('a session that asks a question and reports (ask-user-question-live-answer)', () => {
  const events = eventsOfFixture('ask-user-question-live-answer');

  test('starts with the session id, the CLI version, the model and the tools', () => {
    const [started] = eventsOfKind(events, 'started');
    expect(started).toMatchObject({ sessionId: '7a1f0c52-0001-4000-8000-000000000001', vendorVersion: '2.1.311', model: 'claude-haiku-5-5' });
    expect(started?.tools).toContain('AskUserQuestion');
  });

  test('delivers the AskUserQuestion can_use_tool as a question under its request id, in the tool\'s own shape', () => {
    expect(eventsOfKind(events, 'question')).toEqual([{
      kind:      'question',
      requestId: 'd29eebff-9e62-470d-b2ec-522342cd5f98',
      questions: [{
        question:    'Which colour should the button be?',
        header:      'Button colour',
        multiSelect: false,
        options:     [{ label: 'Red', description: 'User picks Red for the button.' }, { label: 'Blue', description: 'User picks Blue for the button.' }],
      }],
    }]);
  });

  test('records each top-level assistant turn by message id with its usage, and each tool call', () => {
    const turns = eventsOfKind(events, 'assistant-turn');
    expect(turns.length).toBeGreaterThan(0);
    expect(turns.every((turn) => turn.parentToolUseId === null && turn.messageId.startsWith('msg_') && turn.usage !== null)).toBe(true);
    expect(eventsOfKind(events, 'tool-call').map((call) => call.toolName)).toEqual(['AskUserQuestion', 'StructuredOutput']);
  });

  test('ends in one successful result carrying the structured report, the per-model totals and the context size', () => {
    const results = eventsOfKind(events, 'result');
    expect(results).toHaveLength(1);
    expect(results[0]?.isError).toBe(false);
    expect(results[0]?.structuredReport).toEqual({ colour: 'Blue' });
    expect(Object.keys(results[0]?.usageTotals?.byModel ?? {})).toEqual(['claude-haiku-5-5']);
    expect(results[0]?.contextTokens).toBeGreaterThan(0);
  });
});

describe('a session refused by its deny rules (permission-denials-under-deny-rules)', () => {
  test('reports each denied tool call listed on the result, ahead of the result', () => {
    const events = eventsOfFixture('permission-denials-under-deny-rules');
    expect(eventsOfKind(events, 'permission-denied').map((denial) => denial.toolName)).toEqual(['Write', 'Read', 'Write', 'Edit', 'Edit', 'Edit', 'Bash', 'Bash']);
    expect(events.at(-1)?.kind).toBe('result');
  });
});

describe('rate limits', () => {
  test('a top-level rejected limit refuses requests, and its error result has no report', () => {
    const events = eventsOfFixture('rate-limit-rejected');
    expect(eventsOfKind(events, 'usage-window')).toEqual([{
      kind: 'usage-window', window: 'five_hour', utilization: 1, resetsAt: new Date(1793142034000).toISOString(), status: 'rejected', requestsRefused: true,
    }]);
    expect(eventsOfKind(events, 'result')[0]).toMatchObject({ isError: true, structuredReport: null });
  });

  test('a warning on one window, another rejected under overage, refuses nothing', () => {
    const events = eventsOfFixture('rate-limit-window-rejected-under-allowed');
    expect(eventsOfKind(events, 'usage-window')).toEqual([{
      kind: 'usage-window', window: 'seven_day', utilization: 0.91, resetsAt: new Date(1793397634000).toISOString(), status: 'allowed_warning', requestsRefused: false,
    }]);
    expect(eventsOfKind(events, 'result')[0]?.isError).toBe(false);
  });
});

describe('a resumed session (resume-structured-output)', () => {
  test('keeps its session id and reports schema-valid output', () => {
    const events = eventsOfFixture('resume-structured-output');
    expect(eventsOfKind(events, 'started')[0]?.sessionId).toBe('7a1f0c52-0001-4000-8000-000000000001');
    expect(eventsOfKind(events, 'result')[0]?.structuredReport).toEqual({ colour: 'Blue' });
  });
});

/** The recorded result line of a fixture, with the values API billing would put in it planted over the recorded ones. */
function plantedResultLineOf(fixture: string, values: Readonly<Record<string, unknown>>): string {
  const resultLine = readFileSync(join(FIXTURES_FOLDER, `${fixture}.stdout.jsonl`), 'utf8').split('\n')
    .find((line) => line.includes('"type":"result"'));
  if (resultLine === undefined) throw new Error(`The fixture ${fixture} holds no result line.`);
  return JSON.stringify({ ...JSON.parse(resultLine) as Record<string, unknown>, ...values });
}

function resultOf(line: string): Extract<AgentSessionEvent, { kind: 'result' }> | undefined {
  return eventsOfKind([...claudeStreamEventsOf(line)], 'result')[0];
}

describe('API billing results', () => {
  test('the result carries the session cost from total_cost_usd, and no failure on a turn that answered', () => {
    expect(eventsOfKind(eventsOfFixture('ask-user-question-live-answer'), 'result')[0]).toMatchObject({ costUsd: 0.01125043, failure: null });
  });

  test('a result with no total_cost_usd names no cost', () => {
    const line = plantedResultLineOf('ask-user-question-live-answer', {});
    const withoutCost = JSON.stringify({ ...JSON.parse(line) as Record<string, unknown>, total_cost_usd: undefined });
    expect(resultOf(withoutCost)?.costUsd).toBeNull();
  });

  test('the recorded 429 error result is a rate-limited failure, whatever its subtype success says', () => {
    expect(eventsOfKind(eventsOfFixture('rate-limit-rejected'), 'result')[0]?.failure).toMatchObject({ kind: 'rate-limited', httpStatus: 429 });
  });

  test.each([401, 403])('an error result with api_error_status %d is an authentication failure that keeps the vendor text', (status) => {
    const line = plantedResultLineOf('rate-limit-rejected', { api_error_status: status, api_error: 'authentication_error', result: 'Invalid API key · Please run /login' });
    expect(resultOf(line)?.failure).toEqual({ kind: 'authentication-failed', httpStatus: status, text: 'Invalid API key · Please run /login' });
  });

  test('a result of subtype error_max_budget_usd is a budget stop with no refused call, and keeps its cost', () => {
    const line = plantedResultLineOf('ask-user-question-live-answer', { subtype: 'error_max_budget_usd', is_error: true, total_cost_usd: 3.02 });
    expect(resultOf(line)).toMatchObject({ isError: true, costUsd: 3.02, failure: { kind: 'budget-reached', httpStatus: null } });
  });

  test('an error result of another status, or none, is no failure the Overseer acts on', () => {
    expect(resultOf(plantedResultLineOf('rate-limit-rejected', { api_error_status: 500 }))?.failure).toBeNull();
    expect(resultOf(plantedResultLineOf('rate-limit-rejected', { api_error_status: undefined }))?.failure).toBeNull();
  });
});

describe('lines that are no event', () => {
  test('a non-JSON line, a JSON array, an unknown record type and a non-question permission request map to nothing', () => {
    expect(claudeStreamEventsOf('not json')).toEqual([]);
    expect(claudeStreamEventsOf('[1,2]')).toEqual([]);
    expect(claudeStreamEventsOf('{"type":"system","subtype":"task_summary"}')).toEqual([]);
    expect(claudeStreamEventsOf('{"type":"control_request","request_id":"r1","request":{"subtype":"can_use_tool","tool_name":"Bash","input":{}}}')).toEqual([]);
  });

  test('a subagent\'s assistant turn keeps its parent tool call id', () => {
    const line = JSON.stringify({ type: 'assistant', parent_tool_use_id: 'toolu_parent', message: { id: 'msg_child', model: 'claude-haiku-5-5', content: [] } });
    expect(claudeStreamEventsOf(line)).toEqual([{
      kind: 'assistant-turn', messageId: 'msg_child', parentToolUseId: 'toolu_parent', model: 'claude-haiku-5-5', usage: null, text: ''
    }]);
  });

  test('a turn keeps its text and each tool call its id, and a user record\'s tool result names the call it answers', () => {
    const turnLine = JSON.stringify({
      type:               'assistant',
      parent_tool_use_id: null,
      message:            {
        id:      'msg_turn',
        model:   'claude-opus-5-5',
        content: [{ type: 'text', text: 'Reading it.' }, {
          type: 'tool_use', id: 'toolu_read', name: 'Read', input: {}
        }]
      },
    });
    expect(claudeStreamEventsOf(turnLine)).toEqual([
      {
        kind: 'assistant-turn', messageId: 'msg_turn', parentToolUseId: null, model: 'claude-opus-5-5', usage: null, text: 'Reading it.'
      },
      {
        kind: 'tool-call', toolUseId: 'toolu_read', toolName: 'Read', inputSummary: '{}', description: null, parentToolUseId: null
      },
    ]);
    const resultContent = [{ type: 'tool_result', tool_use_id: 'toolu_read', is_error: true }];
    const resultLine = JSON.stringify({ type: 'user', parent_tool_use_id: 'toolu_parent', message: { content: resultContent } });
    expect(claudeStreamEventsOf(resultLine)).toEqual([{
      kind: 'tool-result', toolUseId: 'toolu_read', parentToolUseId: 'toolu_parent', isError: true
    }]);
  });

  // The input summary is cut short, so a subagent's task would read clipped; the description is carried whole.
  test.each(['Agent', 'Task'])('a %s call that spawns a subagent carries its description whole, and a description that is no string reads null', (toolName) => {
    const description = `Review the example storefront's basket badge and checkout pages, ${'and every page they link to, '.repeat(8)}then report`;
    const callLineOf = (input: unknown) => JSON.stringify({
      type:               'assistant',
      parent_tool_use_id: null,
      message:            {
        id:      'msg_spawn',
        model:   'claude-opus-5-5',
        content: [{
          type: 'tool_use', id: 'toolu_spawn', name: toolName, input
        }]
      },
    });
    const spawnCallOf = (input: unknown) => claudeStreamEventsOf(callLineOf(input)).find((event) => event.kind === 'tool-call');
    expect(spawnCallOf({ description, prompt: 'Example prompt' })).toMatchObject({ toolName, description });
    expect(spawnCallOf({ description: 7 })).toMatchObject({ description: null });
    expect(spawnCallOf({ prompt: 'Example prompt' })).toMatchObject({ description: null });
  });
});
