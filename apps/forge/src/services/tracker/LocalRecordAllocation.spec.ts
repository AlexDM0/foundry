/**
 * The local adapter's record allocation inside one hold. What matters: two tickets of one hold never share an id or a file, every ticket
 * the hold listed or allocated answers its file and any other id throws, a new epic or draft whose key an unreadable file holds is refused
 * rather than written over it, and each single record has its own file in the data folder.
 */
import { mkdirSync }               from 'node:fs';
import { basename, dirname }       from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { refusalIsOperationRefusal }                         from '../../shared/OperationRefusal.ts';
import { boardFixture }                                      from '../../testing/BoardFixtures.ts';
import { NO_LISTED_TICKET_LOCATIONS, NO_UNREADABLE_RECORDS } from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory }    from '../../testing/ScratchWorkspace.ts';
import type { RecordReference, UnreadableRecords }           from './@types/BoardRecords.ts';
import { createLocalRecordAllocation }                       from './LocalRecordAllocation.ts';
import { localStoreLayoutOf }                                from './LocalStoreLayout.ts';
import { workspacePathsFor, type Workspace }                 from './Workspace.ts';

const AT = '2026-09-18T20:05:00+02:00';

const EVERY_SINGLE_RECORD: readonly RecordReference['record'][] = [
  'progress',
  'pipeline',
  'pipeline-setup',
  'gate-profiles',
  'constitution-sources',
  'log',
  'unfinished-write',
];

let workspace: Workspace;

function scratchWorkspace(): Workspace {
  workspace = workspacePathsFor(createScratchDirectory('local-record-allocation'));
  mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
  return workspace;
}

function refusalDetailOf(attempt: () => unknown): unknown {
  try {
    attempt();
  } catch (error) {
    if (refusalIsOperationRefusal(error)) return { status: error.status, detail: error.detail };
    throw error;
  }
  throw new Error('The allocation was not refused.');
}

function unreadableRecordsHolding(record: 'epic' | 'draft', key: string, location: string): UnreadableRecords {
  const unreadable = [{
    record, key, location, reason: 'example unreadable record', line: 0
  }];
  return { ...NO_UNREADABLE_RECORDS, ...(record === 'epic' ? { epics: unreadable } : { drafts: unreadable }) };
}

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

test('two tickets allocated in one hold get consecutive ids and distinct slugs', () => {
  const { board }  = boardFixture();
  const allocation = createLocalRecordAllocation(scratchWorkspace(), board, NO_UNREADABLE_RECORDS, NO_LISTED_TICKET_LOCATIONS);
  const input      = {
    title: 'Example finding', type: 'bug' as const, bodyFor: () => '', at: AT
  };

  const first = allocation.newTicket(input);
  board.fileTicket(first, AT);
  const second = allocation.newTicket(input);

  expect([first.frontmatter.id, second.frontmatter.id]).toEqual(['001', '002']);
  expect(['001', '002'].map((ticketId) => basename(allocation.storedTicketLocationOf(ticketId)))).toEqual(['001-example-finding.md', '002-example-finding-2.md']);
});

test('a listed ticket answers the file it was read from, and an id never listed nor allocated throws naming the id', () => {
  const listedWorkspace = scratchWorkspace();
  const listedLocation  = `${localStoreLayoutOf(listedWorkspace).ticketRecordsFolder}/007-an-older-title.md`;
  const allocation      = createLocalRecordAllocation(listedWorkspace, boardFixture().board, NO_UNREADABLE_RECORDS, new Map([['007', listedLocation]]));

  expect(allocation.storedTicketLocationOf('007')).toBe(listedLocation);
  expect(() => allocation.storedTicketLocationOf('008')).toThrow('#008');
});

test('an epic key held by an unreadable file is refused unreadable-file-in-the-way, and a free key is let through', () => {
  const heldWorkspace = scratchWorkspace();
  const heldLocation  = `${localStoreLayoutOf(heldWorkspace).epicRecordsFolder}/example-epic.md`;
  const heldRecords   = unreadableRecordsHolding('epic', 'example-epic', heldLocation);
  const allocation    = createLocalRecordAllocation(heldWorkspace, boardFixture().board, heldRecords, NO_LISTED_TICKET_LOCATIONS);

  expect(refusalDetailOf(() => allocation.requireEpicKeyIsFree('example-epic'))).toEqual({
    status: 'refused',
    detail: { kind: 'unreadable-file-in-the-way', filePath: heldLocation, record: 'epic' },
  });
  expect(() => allocation.requireEpicKeyIsFree('example-other-epic')).not.toThrow();
});

test('a draft key held by an unreadable file is refused unreadable-file-in-the-way, and a free key is let through', () => {
  const heldWorkspace = scratchWorkspace();
  const heldLocation  = `${localStoreLayoutOf(heldWorkspace).draftRecordsFolder}/D7.json`;
  const allocation    = createLocalRecordAllocation(heldWorkspace, boardFixture().board, unreadableRecordsHolding('draft', 'D7', heldLocation), NO_LISTED_TICKET_LOCATIONS);

  expect(refusalDetailOf(() => allocation.requireDraftKeyIsFree('D7'))).toEqual({
    status: 'refused',
    detail: { kind: 'unreadable-file-in-the-way', filePath: heldLocation, record: 'draft' },
  });
  expect(() => allocation.requireDraftKeyIsFree('D8')).not.toThrow();
});

test('locationOf answers a distinct file inside the data folder for each single record', () => {
  const allocation = createLocalRecordAllocation(scratchWorkspace(), boardFixture().board, NO_UNREADABLE_RECORDS, NO_LISTED_TICKET_LOCATIONS);

  const locations = EVERY_SINGLE_RECORD.map((record) => allocation.locationOf({ record }));

  expect(new Set(locations).size).toBe(EVERY_SINGLE_RECORD.length);
  for (const location of locations) expect(dirname(location)).toBe(workspace.trackerDirectory);
});
