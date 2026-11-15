/**
 * A row's label and displayed name. What matters: a review row is labelled by the ticket it reviews and a free-standing row as a task, and
 * only a leading number equal to the row's own ticket is dropped, so a name that merely starts with another number keeps it.
 */
import { describe, expect, test } from 'bun:test';

import { RowLabelUtil } from './RowLabelUtil.ts';

describe('rowLabelOf', () => {
  test('labels a row by its own ticket, a review row by the ticket it reviews, and a free-standing row as a task', () => {
    expect(RowLabelUtil.rowLabelOf({ ticket: '004' })).toBe('#004');
    expect(RowLabelUtil.rowLabelOf({ ticket: null, reviewOf: '008' })).toBe('#008');
    expect(RowLabelUtil.rowLabelOf({ ticket: null })).toBe('TASK');
  });
});

describe('displayedRowNameOf', () => {
  test('drops a leading number equal to the row\'s own ticket, padded or not', () => {
    expect(RowLabelUtil.displayedRowNameOf({ name: '#004 Example dark mode', ticket: '004' })).toBe('Example dark mode');
    expect(RowLabelUtil.displayedRowNameOf({ name: '#4 Example dark mode', ticket: '004' })).toBe('Example dark mode');
  });

  test('keeps a leading number of another ticket, and every name of a row without a ticket', () => {
    expect(RowLabelUtil.displayedRowNameOf({ name: '#005 Example dark mode', ticket: '004' })).toBe('#005 Example dark mode');
    expect(RowLabelUtil.displayedRowNameOf({ name: '#004 Example dark mode', ticket: null })).toBe('#004 Example dark mode');
  });
});
