/**
 * The refusal document forge serves. What matters: the code is the one the command line's refusal names, a board refusal's code its
 * reason; the fields are the detail's facts without the field the code already says; a refusal without a detail is `refused` with no
 * fields; and the sentence is the command line's (`messageOf`), never the API channel's, also where the two differ.
 */
import { describe, expect, test } from 'bun:test';

import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';
import { RefusalDocumentUtil }         from './RefusalDocumentUtil.ts';

describe('refusalDocumentOf', () => {
  test('a board refusal answers its reason as the code, its facts without the reason, and the command line\'s sentence', () => {
    const boardRefusal = { reason: 'claim-waits-on-dependencies', ticketId: 'EX-4', unsettledTicketIds: ['EX-1', 'EX-2'] } as const;
    const refusal = new OperationRefusal('refused', { kind: 'board-refusal', boardRefusal });
    expect(RefusalDocumentUtil.refusalDocumentOf(refusal)).toEqual({
      code:     'claim-waits-on-dependencies',
      fields:   { ticketId: 'EX-4', unsettledTicketIds: ['EX-1', 'EX-2'] },
      sentence: OperationRefusalWordingUtil.messageOf(refusal),
    });
  });

  test('a detail of another kind answers its kind as the code and its facts without the kind', () => {
    const refusal = new OperationRefusal('refused', { kind: 'machine-agent-limit-above-cpus', limit: 9, ceiling: 8 });
    expect(RefusalDocumentUtil.refusalDocumentOf(refusal)).toEqual({
      code:     'machine-agent-limit-above-cpus',
      fields:   { limit: 9, ceiling: 8 },
      sentence: OperationRefusalWordingUtil.messageOf(refusal),
    });
  });

  test('a detail with nested facts keeps them whole', () => {
    const refusal = new OperationRefusal('refused', {
      kind:             'install-version-mismatch',
      rootDirectory:    '/example/repository',
      manifestFilePath: '/example/repository/.example/version.json',
      installVersion:   30,
      mismatch:         { reason: 'older', installedVersion: 29 },
    });
    expect(RefusalDocumentUtil.refusalDocumentOf(refusal).fields).toEqual({
      rootDirectory:    '/example/repository',
      manifestFilePath: '/example/repository/.example/version.json',
      installVersion:   30,
      mismatch:         { reason: 'older', installedVersion: 29 },
    });
  });

  test('a refusal without a detail answers the code refused, no fields and its own words', () => {
    const refusal = new OperationRefusal('refused', 'Example Agency refused this for a reason of its own.');
    expect(RefusalDocumentUtil.refusalDocumentOf(refusal)).toEqual({ code: 'refused', fields: {}, sentence: OperationRefusalWordingUtil.messageOf(refusal), });
  });

  test('the sentence is the command line\'s, not the API channel\'s, for a refusal whose two channels differ', () => {
    const refusal = new OperationRefusal('refused', { kind: 'hephaestus-already-running', url: 'http://127.0.0.1:4242', hephaestusLockFilePath: '/example/lock-1.json' });
    const commandLineSentence = OperationRefusalWordingUtil.messageOf(refusal);
    expect(commandLineSentence).not.toBe(OperationRefusalWordingUtil.apiMessageOf(refusal));
    expect(RefusalDocumentUtil.refusalDocumentOf(refusal).sentence).toBe(commandLineSentence);
  });
});

describe('jsonFieldsOf', () => {
  test('leaves out the named field and every absent one, and writes a number JSON cannot hold as null', () => {
    const record = {
      code: 'usage-limit-holds', resetsAt: '2026-11-12T14:00:00.000Z', notSet: undefined, ratio: Number.NaN, counts: [1, undefined],
    };
    expect(RefusalDocumentUtil.jsonFieldsOf(record, 'code')).toEqual({ resetsAt: '2026-11-12T14:00:00.000Z', ratio: null, counts: [1, null] });
  });
});
