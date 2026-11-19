/**
 * log.jsonl is rewritten whole from the records read back, so a record the Board logged must map to itself byte for byte, in the Board's key
 * order (at, kind, taskId, ticketId, fields), and a key the tool does not know, at the top or inside the fields, must not travel on; a
 * refusal detail travels whole, since a lost Hatch reply is written again from it.
 */
import { expect, test } from 'bun:test';

import { everyRecordKindTheBoardLogs } from '../../../testing/EveryBoardLogRecord.ts';
import { LogRecordMappingUtil }        from './LogRecordMappingUtil.ts';

const { recordOf } = LogRecordMappingUtil;

const RECORDED_AT = '2026-09-18T21:30:54+02:00';

test('every record the Board logs maps back to the same line, key for key and in the same order', () => {
  for (const record of everyRecordKindTheBoardLogs(RECORDED_AT)) {
    const line = JSON.stringify(record);
    expect(JSON.stringify(recordOf(JSON.parse(line))), record.kind).toBe(line);
  }
});

test('a review-bar record keeps the order at, kind, taskId, ticketId, fields', () => {
  const stored = {
    fields:   { name: 'Review 1 #001 — Example checkout flow' },
    ticketId: '001',
    taskId:   7,
    kind:     'review-bar-started',
    at:       RECORDED_AT,
  };
  expect(JSON.stringify(recordOf(stored)))
    .toBe(`{"at":"${RECORDED_AT}","kind":"review-bar-started","taskId":7,"ticketId":"001","fields":{"name":"Review 1 #001 — Example checkout flow"}}`);
});

test('an agent-stopped record keeps the usage figures in the order the hook builds them', () => {
  const stored = {
    at:     RECORDED_AT,
    kind:   'agent-stopped',
    fields: {
      outputTokens:         1000,
      cacheReadInputTokens: 8000,
      totalInputTokens:     11_000,
      endContextTokens:     6800,
      apiCallCount:         2,
      agentType:            'general-purpose',
      agentId:              'agent_example',
    },
  };
  expect(Object.keys(recordOf(stored).fields))
    .toEqual(['agentId', 'agentType', 'apiCallCount', 'endContextTokens', 'totalInputTokens', 'cacheReadInputTokens', 'outputTokens']);
});

test('keys the kind does not know are dropped, at the top, inside the fields and inside an agent pair', () => {
  const stored = {
    at:       RECORDED_AT,
    kind:     'ticket-agents-changed',
    taskId:   3,
    ticketId: '001',
    source:   'a newer build',
    fields:   {
      from:    { model: 'opus', effort: 'medium', temperature: 1 },
      to:      { model: 'sonnet', effort: 'low' },
      comment: 'by hand',
    },
  };
  expect(recordOf(stored)).toEqual({
    at:       RECORDED_AT,
    kind:     'ticket-agents-changed',
    ticketId: '001',
    fields:   { from: { model: 'opus', effort: 'medium' }, to: { model: 'sonnet', effort: 'low' } },
  });
});

test('an automatic chart range keeps only its kind', () => {
  const stored = { at: RECORDED_AT, kind: 'chart-range-set', fields: { view: { kind: 'auto', from: '-2h' } } };
  expect(recordOf(stored)).toEqual({ at: RECORDED_AT, kind: 'chart-range-set', fields: { view: { kind: 'auto' } } });
});

test('a refused relayed request keeps its reply\'s status and whole detail, so the Hatch can write that reply again', () => {
  const line = JSON.stringify({
    at:     RECORDED_AT,
    kind:   'hatch-applied',
    jobId:  'J1',
    fields: {
      requestId:   'request-5',
      commandKind: 'ticket-add',
      outcome:     'refused',
      status:      'refused',
      detail:      { kind: 'role-command-refused', reason: 'example-reason', commandKind: 'ticket-add' },
    },
  });
  expect(JSON.stringify(recordOf(JSON.parse(line)))).toBe(line);
});

test('a gate run\'s cache reports travel byte for byte, and a key a gate\'s report does not know does not', () => {
  const fields = {
    tree:         '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    outcome:      'passed',
    cached:       false,
    cacheReports: { phase: 'build', gates: [{ gateName: 'verify', cacheReport: 'hit' }, { gateName: 'lint', cacheReport: null }] },
  };
  const line = JSON.stringify({ at: RECORDED_AT, kind: 'gate-ran', fields });
  const gatesWithAnUnknownKey = [{ gateName: 'verify', cacheReport: 'hit', tasks: 12 }, { gateName: 'lint', cacheReport: null }];
  const withAnUnknownKey = { at: RECORDED_AT, kind: 'gate-ran', fields: { ...fields, cacheReports: { ...fields.cacheReports, gates: gatesWithAnUnknownKey } } };

  expect([JSON.stringify(recordOf(JSON.parse(line))), JSON.stringify(recordOf(withAnUnknownKey))]).toEqual([line, line]);
});

test('a pipeline step\'s run reads back byte for byte with its phase and entity, and an install step\'s with neither', () => {
  const entityGate = {
    stepKind: 'gate', stepName: 'verify', phase: 'merge', entity: 'web', runMilliseconds: 4200, ending: 'time-bound'
  };
  const installStep = {
    stepKind: 'prepare', stepName: 'install', runMilliseconds: 61000, ending: 'passed'
  };
  const lines = [entityGate, installStep].map((fields) => JSON.stringify({ at: RECORDED_AT, kind: 'pipeline-step-ran', fields }));

  expect(lines.map((line) => JSON.stringify(recordOf(JSON.parse(line))))).toEqual(lines);
});
