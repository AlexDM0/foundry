/**
 * PLAN 7.3's order of what waits on User across forges. What matters: escalated entries lead, then the oldest stamp, compared as an
 * instant whatever its offset; a tie keeps the forges' and each forge's own order; and only a forge read in full, or its last full reading
 * while it does not answer, lists entries by name.
 */
import { describe, expect, test } from 'bun:test';

import { FLEET_SNAPSHOT_FIVE_FORGES_READINGS } from '../../../adapters/page-api/testing/fleet-snapshot-five-forges.ts';
import type { AttentionItem }                  from '../../../shared/@types/AttentionItem.ts';
import type { ForgeReading }                   from '../../../shared/@types/ForgeReading.ts';

import { AttentionOrderUtil } from './AttentionOrderUtil.ts';

const READINGS = FLEET_SNAPSHOT_FIVE_FORGES_READINGS;

const QUESTION_TEMPLATE: AttentionItem = {
  key:                     'decision:E1',
  kind:                    'question',
  idText:                  'E1',
  ticketIds:               [],
  subject:                 'An example question',
  jobId:                   null,
  askedBy:                 null,
  decisionKind:            null,
  escalatedFromIncidentId: null,
  metaText:                null,
  stamp:                   '2026-11-12T12:00:00.000Z',
  stampWord:               'opened',
  actionLabel:             'Answer',
  boardRoute:              { tab: 'questions', item: 'E1' },
};

function questionOpenedAt(idText: string, stamp: string): AttentionItem {
  return {
    ...QUESTION_TEMPLATE, key: `decision:${idText}`, idText, stamp, boardRoute: { tab: 'questions', item: idText }
  };
}

function forgeWaitingOn(reading: ForgeReading, attention: AttentionItem[]): ForgeReading {
  return { ...reading, attention };
}

function idTextsOf(readings: readonly ForgeReading[]): string[] {
  return AttentionOrderUtil.fleetAttentionOf(readings).map((item) => item.idText);
}

describe('fleetAttentionOf', () => {
  test('holds the five rows of artboard A1 in its order, each with its forge', () => {
    const attention = AttentionOrderUtil.fleetAttentionOf(Object.values(READINGS));
    expect(attention.map((item) => [item.idText, item.trackerId])).toEqual([
      ['E4', READINGS.invoiceService.trackerId],
      ['#015', READINGS.exampleStorefront.trackerId],
      ['E1', READINGS.researchWiki.trackerId],
      ['#031', READINGS.invoiceService.trackerId],
      ['E2', READINGS.exampleStorefront.trackerId],
    ]);
  });

  test('puts an escalated entry before an older entry that is not escalated', () => {
    const escalated = { ...questionOpenedAt('E9', '2026-11-12T13:00:00.000Z'), kind: 'escalated-question' as const };
    const older     = questionOpenedAt('E1', '2026-11-12T08:00:00.000Z');
    expect(idTextsOf([forgeWaitingOn(READINGS.exampleStorefront, [older, escalated])])).toEqual(['E9', 'E1']);
  });

  test('compares stamps as instants, whatever offset each writer used', () => {
    const laterInAmsterdam = questionOpenedAt('E1', '2026-11-12T13:30:00.000+01:00');
    const earlierInUtc     = questionOpenedAt('E2', '2026-11-12T12:45:00.000Z');
    expect(idTextsOf([forgeWaitingOn(READINGS.exampleStorefront, [earlierInUtc]), forgeWaitingOn(READINGS.invoiceService, [laterInAmsterdam])]))
      .toEqual(['E1', 'E2']);
  });

  test('keeps the forges\' order and each forge\'s own order on a tie', () => {
    const stamp      = '2026-11-12T12:00:00.000Z';
    const storefront = forgeWaitingOn(READINGS.exampleStorefront, [questionOpenedAt('E3', stamp), questionOpenedAt('E1', stamp)]);
    const invoice    = forgeWaitingOn(READINGS.invoiceService, [questionOpenedAt('E2', stamp)]);
    expect(idTextsOf([invoice, storefront])).toEqual(['E2', 'E3', 'E1']);
    expect(idTextsOf([storefront, invoice])).toEqual(['E3', 'E1', 'E2']);
  });

  test('puts an entry whose stamp does not parse after every entry whose stamp does', () => {
    const unreadable = questionOpenedAt('E1', 'not a stamp');
    const readable   = questionOpenedAt('E2', '2026-11-12T23:00:00.000Z');
    expect(idTextsOf([forgeWaitingOn(READINGS.exampleStorefront, [unreadable, readable])])).toEqual(['E2', 'E1']);
  });

  test('keeps an unreachable forge\'s entries as last reported, and lists none of a forge it does not read in full', () => {
    const question = [questionOpenedAt('E1', '2026-11-12T12:00:00.000Z')];
    expect(idTextsOf([{ ...forgeWaitingOn(READINGS.invoiceService, question), fidelity: 'unreachable' }])).toEqual(['E1']);
    expect(idTextsOf([{ ...forgeWaitingOn(READINGS.invoiceService, question), fidelity: 'counts-only' }])).toEqual([]);
    expect(idTextsOf([{ ...forgeWaitingOn(READINGS.invoiceService, question), fidelity: 'newer-contract' }])).toEqual([]);
    expect(idTextsOf([{ ...forgeWaitingOn(READINGS.designSystem, question), fidelity: 'dormant' }])).toEqual([]);
  });
});
