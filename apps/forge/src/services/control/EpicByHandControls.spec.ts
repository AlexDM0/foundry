/**
 * The by-hand epic kinds over the Board fixtures. What matters: `epic-edit` and `epic-remove` change the Board exactly as the `epic` verbs'
 * own Board calls did, `epic-edit` answering the epic's rollup as the hold left it; a key the Board refuses, unknown or still named by a
 * ticket, leaves as the Board's own refusal.
 */
import { describe, expect, test } from 'bun:test';

import type { Board }          from '../../domain/tracker-model/Board.ts';
import type { ControlCommand } from '../../shared/@types/ControlCommand.ts';
import {
  boardFixture,
  epicFixture,
  refusalDetailOf,
  ticketFixture
} from '../../testing/BoardFixtures.ts';
import type { BoardFixture }                                    from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                               from '../../testing/EchoedControlContext.ts';
import { createFixtureRecordAllocation, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import type { BoardTransaction }                                from '../tracker/BoardTransaction.ts';
import { workspacePathsFor }                                    from '../tracker/Workspace.ts';
import { ControlService }                                       from './ControlService.ts';

const CHANGED_AT = '2026-11-20T10:00:00+01:00';

function storefrontFixture(): BoardFixture {
  return boardFixture({
    epics:   [epicFixture({ key: 'example-checkout' }), epicFixture({ key: 'example-search', title: 'Example search', slot: 2 })],
    tickets: [ticketFixture({ id: '003', epics: ['example-checkout'] })],
  });
}

function changeOf(board: Board): BoardTransaction {
  return {
    board,
    workspace:                      workspacePathsFor('/example-agency/storefront'),
    at:                             CHANGED_AT,
    records:                        createFixtureRecordAllocation(board),
    unreadableRecords:              NO_UNREADABLE_RECORDS,
    unreadablePipeline:             null,
    storedLogEntryCount:            0,
    storedLogRecords:               [],
    deleteAllTicketFilesAfterwards: () => undefined,
  };
}

function appliedTo(fixture: BoardFixture, command: ControlCommand): unknown {
  return ControlService.apply(command, changeOf(fixture.board), ECHOED_CONTROL_CONTEXT).result;
}

describe('the by-hand epic kinds', () => {
  test('epic-edit of the title and an appended body does what the verb did, with the rollup the hold left', () => {
    const applied = storefrontFixture();
    const byVerb  = storefrontFixture();

    const result = appliedTo(applied, {
      kind: 'epic-edit', key: 'example-checkout', title: 'Example basket', body: { text: 'Pay by card too.', appends: true }
    });
    const edited = byVerb.board.editEpic('example-checkout', { title: 'Example basket', body: { text: 'Pay by card too.', appends: true } }, CHANGED_AT);

    expect(result).toEqual({ ...edited, rollup: byVerb.board.epicRollupOf(edited.epic) });
    expect(applied.board.epics()).toEqual(byVerb.board.epics());
    expect(applied.records).toEqual(byVerb.records);
  });

  test('epic-edit of the title alone leaves the body as it was', () => {
    const applied = storefrontFixture();
    const byVerb  = storefrontFixture();

    appliedTo(applied, { kind: 'epic-edit', key: 'example-checkout', title: 'Example basket' });
    byVerb.board.editEpic('example-checkout', { title: 'Example basket' }, CHANGED_AT);

    expect(applied.board.epics()).toEqual(byVerb.board.epics());
  });

  test('epic-remove of an epic no ticket names does what the verb did', () => {
    const applied = storefrontFixture();
    const byVerb  = storefrontFixture();

    expect(appliedTo(applied, { kind: 'epic-remove', key: 'example-search' })).toEqual(byVerb.board.removeEpic('example-search', CHANGED_AT));
    expect(applied.board.epics()).toEqual(byVerb.board.epics());
    expect(applied.board.tickets()).toEqual(byVerb.board.tickets());
    expect(applied.records).toEqual(byVerb.records);
  });

  test.each([
    { kind: 'epic-edit', key: 'example-missing', title: 'Example' },
    { kind: 'epic-remove', key: 'example-missing' },
    { kind: 'epic-remove', key: 'example-checkout' },
  ] satisfies ControlCommand[] as ControlCommand[])('$kind $key the Board refuses leaves as the Board\'s refusal and changes nothing', (command) => {
    const fixture = storefrontFixture();
    const before  = fixture.board.epics();

    expect(refusalDetailOf(() => appliedTo(fixture, command)).reason).toBeString();
    expect(fixture.board.epics()).toEqual(before);
  });
});
