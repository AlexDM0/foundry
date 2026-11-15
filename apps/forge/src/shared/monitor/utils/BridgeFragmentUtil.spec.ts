/**
 * How a Bridge route is written. What matters: a tab alone is `#<tab>`; an item follows it after a `/`, each of its segments encoded on its
 * own, so an item's own `/` stays a separator and any other character the address bar would read is escaped; a detail item is `<form>/<id>`.
 */
import { describe, expect, test } from 'bun:test';

import { BridgeFragmentUtil } from './BridgeFragmentUtil.ts';

describe('BridgeFragmentUtil.fragmentOf', () => {
  test('a tab alone, then a tab with an item whose segments are each encoded', () => {
    expect(BridgeFragmentUtil.fragmentOf('questions', null)).toBe('#questions');
    expect(BridgeFragmentUtil.fragmentOf('agents', 'J12')).toBe('#agents/J12');
    expect(BridgeFragmentUtil.fragmentOf('epics', 'epic/example key#1')).toBe('#epics/epic/example%20key%231');
  });
});

describe('BridgeFragmentUtil.detailItemTextOf', () => {
  test('names the form, then the id', () => {
    expect(BridgeFragmentUtil.fragmentOf('kanban', BridgeFragmentUtil.detailItemTextOf('ticket', '009'))).toBe('#kanban/ticket/009');
    expect(BridgeFragmentUtil.detailItemTextOf('draft', 'D2')).toBe('draft/D2');
  });
});
