/**
 * The meters' arithmetic, against its own contract. What matters: the fill percent is the share of the limit, clamped at 0 and 100, and 0
 * for a zero limit, which would otherwise divide by zero; the slot cells are `limit` long with the filled ones first, a filled count past
 * the limit adds one `over` cell per extra job, and a count below zero draws nothing.
 */
import { describe, expect, test } from 'bun:test';

import { MeterUtil } from './MeterUtil.ts';

const CALL_BUDGET = 150;
const SLOT_LIMIT = 3;

describe('the fill percent', () => {
  test('is the share of the limit used', () => {
    expect([MeterUtil.fillPercentOf(0, CALL_BUDGET), MeterUtil.fillPercentOf(75, CALL_BUDGET), MeterUtil.fillPercentOf(30, CALL_BUDGET)]).toEqual([0, 50, 20]);
  });

  test('clamps at 0 and 100', () => {
    expect([MeterUtil.fillPercentOf(-5, CALL_BUDGET), MeterUtil.fillPercentOf(CALL_BUDGET, CALL_BUDGET), MeterUtil.fillPercentOf(400, CALL_BUDGET)]).toEqual([0, 100, 100]);
  });

  test('is 0 for a limit of zero or less', () => {
    expect([MeterUtil.fillPercentOf(3, 0), MeterUtil.fillPercentOf(3, -1)]).toEqual([0, 0]);
  });
});

describe('the slot cells', () => {
  test('are limit long, the filled ones first', () => {
    expect([MeterUtil.slotCellsOf(0, SLOT_LIMIT), MeterUtil.slotCellsOf(2, SLOT_LIMIT), MeterUtil.slotCellsOf(SLOT_LIMIT, SLOT_LIMIT)]).toEqual([
      ['empty', 'empty', 'empty'],
      ['filled', 'filled', 'empty'],
      ['filled', 'filled', 'filled'],
    ]);
  });

  test('a filled count past the limit adds one over cell per extra job', () => {
    expect(MeterUtil.slotCellsOf(5, SLOT_LIMIT)).toEqual(['filled', 'filled', 'filled', 'over', 'over']);
  });

  test('a count below zero draws nothing, and a limit of zero draws only the over cells', () => {
    expect([MeterUtil.slotCellsOf(-2, SLOT_LIMIT), MeterUtil.slotCellsOf(0, -1), MeterUtil.slotCellsOf(2, 0)]).toEqual([
      ['empty', 'empty', 'empty'],
      [],
      ['over', 'over'],
    ]);
  });
});
