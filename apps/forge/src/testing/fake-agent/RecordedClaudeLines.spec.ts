/**
 * The fake agent prints only recorded `claude` lines. What matters: a line is the recorded one with only the selector's values put in; a
 * kind or a key no recording holds is refused; a line already filled comes back unchanged, since the child fills every line again; and an
 * OS with no recording fails, naming the command that records it.
 */
import { describe, expect, test } from 'bun:test';

import { recordCommandOf } from '../BoundaryRecordings.ts';
import {
  fakeAssistantTurnLine,
  fakeQuestionLine,
  fakeRateLimitedResultLine,
  fakeResultLine,
  fakeStartedLine
} from '../FakeAgentAdapter.ts';
import { CLAUDE_WIRE_BOUNDARY, recordedLineOf, recordedSessionOf } from './RecordedClaudeLines.ts';

const QUESTION = {
  question: 'Which colour?', header: 'Colour', multiSelect: false, options: [{ label: 'Blue', description: 'Blue.', isRecommended: false }]
};

function recordedStdoutLineOf(scenario: Parameters<typeof recordedSessionOf>[0], type: string, subtype?: string): Record<string, unknown> {
  const line = recordedSessionOf(scenario).wire
    .filter((entry) => entry.from === 'stdout')
    .map((entry) => JSON.parse(entry.line) as Record<string, unknown>)
    .find((parsed) => parsed['type'] === type && parsed['subtype'] === subtype);
  if (line === undefined) throw new Error(`no recorded ${type} line in ${scenario}`);
  return line;
}

describe('a recorded claude line', () => {
  test('the started line is the recorded init line with only its session id changed', () => {
    const recorded = recordedStdoutLineOf('turn-that-ends', 'system', 'init');
    expect(JSON.parse(fakeStartedLine('fake-session'))).toEqual({ ...recorded, session_id: 'fake-session' });
  });

  test('the result line carries the report whole, whatever the recorded report held', () => {
    const recorded = recordedStdoutLineOf('turn-that-ends', 'result', 'success');
    const report = { outcome: 'built', gates: [{ name: 'checks', commit: '{{HEAD}}' }] };
    expect(JSON.parse(fakeResultLine(report))).toEqual({
      ...recorded, structured_output: report, is_error: false, permission_denials: []
    });
  });

  test('the question keeps the recorded request around the questions it is given', () => {
    const line = JSON.parse(fakeQuestionLine('request-1', [QUESTION])) as { request_id: string; request: Record<string, unknown> & { input: { questions: unknown } } };
    expect(line.request_id).toBe('request-1');
    expect(line.request.input.questions).toEqual([QUESTION]);
    expect(Object.keys(line.request)).toEqual(Object.keys(recordedStdoutLineOf('turn-that-ends', 'control_request')['request'] as object));
  });

  test('a line already filled comes back unchanged', () => {
    for (const line of [fakeStartedLine('s'), fakeAssistantTurnLine('m'), fakeResultLine({ word: 'cobalt' }), fakeQuestionLine('r', [QUESTION]), fakeRateLimitedResultLine()]) {
      expect(recordedLineOf(line)).toBe(line);
    }
  });

  test('a kind no recording holds is refused, naming the line', () => {
    const line = JSON.stringify({ type: 'result', subtype: 'error_during_execution', is_error: true });
    expect(() => recordedLineOf(line)).toThrow(`there is no recorded result/error_during_execution line this line: ${line}`);
  });

  test('a key no recorded line of its kind holds is refused', () => {
    expect(() => recordedLineOf(JSON.stringify({ type: 'system', subtype: 'init', invented_key: true }))).toThrow('no recorded system/init line holds every key of');
  });

  test('a line that is not JSON is refused, as the real claude prints only JSON', () => {
    expect(() => recordedLineOf('Example reply')).toThrow('prints only JSON lines');
  });

  test('an OS with no recording fails, naming the command that records it', () => {
    expect(() => recordedLineOf(JSON.stringify({ type: 'system', subtype: 'init' }), 'example-os'))
      .toThrow(`Record it with \`${recordCommandOf(CLAUDE_WIRE_BOUNDARY)}\``);
  });
});
