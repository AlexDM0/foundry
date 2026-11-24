/**
 * `epic-add` and `draft-open` over a record the store cannot read. What matters: an unreadable record is no part of the Board, so a new
 * epic or draft of its key would overwrite whatever hand edit broke it; the transaction's records refuse both `unreadable-file-in-the-way`,
 * naming the file a repair goes by, before the Board files the epic. A key no unreadable record holds is filed as before.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { OperationRefusal }                               from '../../shared/OperationRefusal.ts';
import { boardFixture, type BoardFixture }                from '../../testing/BoardFixtures.ts';
import { ECHOED_CONTROL_CONTEXT }                         from '../../testing/EchoedControlContext.ts';
import { NO_LISTED_TICKET_LOCATIONS }                     from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { UnreadableRecord, UnreadableRecords }       from '../tracker/@types/BoardRecords.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import { listDrafts }                                     from '../tracker/DraftStore.ts';
import { listEpics }                                      from '../tracker/EpicStore.ts';
import { createLocalRecordAllocation }                    from '../tracker/LocalRecordAllocation.ts';
import { localStoreLayoutOf }                             from '../tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                              from '../tracker/Workspace.ts';
import { ControlService }                                 from './ControlService.ts';

const AT = '2026-11-20T10:00:00+01:00';

const BROKEN_EPIC_KEY     = 'checkout';
const BROKEN_DRAFT_ID     = 'D1';
const HAND_EDIT_GONE_WRONG = 'A hand edit that broke the record.\n';

const scratchDirectories: string[] = [];

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) removeScratchDirectory(directory);
});

/** A board beside an epic and a draft file that will not parse, listed and keyed as the local adapter lists them. */
function boardBesideUnreadableFilings(): { fixture: BoardFixture; change: BoardTransaction } {
  const root = createScratchDirectory('filing-controls');
  scratchDirectories.push(root);
  const workspace = workspacePathsFor(root);
  mkdirSync(localStoreLayoutOf(workspace).epicRecordsFolder, { recursive: true });
  mkdirSync(localStoreLayoutOf(workspace).draftRecordsFolder, { recursive: true });
  writeFileSync(join(localStoreLayoutOf(workspace).epicRecordsFolder, `${BROKEN_EPIC_KEY}.md`), HAND_EDIT_GONE_WRONG);
  writeFileSync(join(localStoreLayoutOf(workspace).draftRecordsFolder, `${BROKEN_DRAFT_ID}.json`), HAND_EDIT_GONE_WRONG);
  const unreadableRecords: UnreadableRecords = {
    tickets: [], epics: listEpics(workspace).unreadable, drafts: listDrafts(workspace).unreadable, ticketDocuments: []
  };
  const fixture = boardFixture();
  const change  = {
    board:   fixture.board,
    workspace,
    at:      AT,
    records: createLocalRecordAllocation(workspace, fixture.board, unreadableRecords, NO_LISTED_TICKET_LOCATIONS),
    unreadableRecords,
  } as unknown as BoardTransaction;
  return { fixture, change };
}

function onlyUnreadableOf(unreadable: readonly UnreadableRecord[]): UnreadableRecord {
  const [onlyRecord] = unreadable;
  if (onlyRecord === undefined || unreadable.length > 1) throw new Error(`the store listed ${unreadable.length} unreadable records, not one`);
  return onlyRecord;
}

function operationRefusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('the command was not refused');
}

test('an epic whose key an unreadable epic file holds is refused unreadable-file-in-the-way, naming that file, and nothing is filed', () => {
  const { fixture, change } = boardBesideUnreadableFilings();
  const unreadableEpic       = onlyUnreadableOf(change.unreadableRecords.epics);

  const refusal = operationRefusalOf(() => ControlService.apply({
    kind: 'epic-add', key: BROKEN_EPIC_KEY, title: 'Example checkout', bodyText: 'Alex Example pays in one step.\n'
  }, change, ECHOED_CONTROL_CONTEXT));

  expect(unreadableEpic.location).toBe(join(localStoreLayoutOf(change.workspace).epicRecordsFolder, `${BROKEN_EPIC_KEY}.md`));
  expect(refusal.status).toBe('refused');
  expect(refusal.detail).toEqual({ kind: 'unreadable-file-in-the-way', filePath: unreadableEpic.location, record: 'epic' });
  expect(fixture.records).toEqual([]);
});

test('a draft whose id an unreadable draft file holds is refused unreadable-file-in-the-way, naming that file', () => {
  const { change }        = boardBesideUnreadableFilings();
  const unreadableDraft  = onlyUnreadableOf(change.unreadableRecords.drafts);

  const refusal = operationRefusalOf(() => ControlService.apply({
    kind: 'draft-open', title: 'Example basket', request: 'Alex Example wants a basket that keeps its items.', owner: 'User'
  }, change, ECHOED_CONTROL_CONTEXT));

  expect(unreadableDraft.location).toBe(join(localStoreLayoutOf(change.workspace).draftRecordsFolder, `${BROKEN_DRAFT_ID}.json`));
  expect(refusal.status).toBe('refused');
  expect(refusal.detail).toEqual({ kind: 'unreadable-file-in-the-way', filePath: unreadableDraft.location, record: 'draft' });
});

test('an epic of a key no unreadable record holds is filed, with no location in the model', () => {
  const { fixture, change } = boardBesideUnreadableFilings();

  const applied = ControlService.apply({
    kind: 'epic-add', key: 'returns', title: 'Example returns', bodyText: 'Alex Example sends a parcel back.\n'
  }, change, ECHOED_CONTROL_CONTEXT);

  expect(applied.outcome).toBe('done');
  expect(fixture.records.map((record) => record.kind)).toEqual(['epic-added']);
  expect(Object.keys(applied.result.epic).sort()).toEqual(['body', 'frontmatter']);
});
