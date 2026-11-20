/**
 * The local adapter's record allocation inside one hold. What matters: two tickets of one hold never share an id or a file, a new epic or
 * draft whose key an unreadable file holds is refused rather than written over it, and each single record has its own file in the data folder.
 */
import { mkdirSync }               from 'node:fs';
import { basename, dirname }       from 'node:path';
import { afterEach, expect, test } from 'bun:test';

import { refusalIsOperationRefusal }                      from '../../shared/OperationRefusal.ts';
import { boardFixture }                                   from '../../testing/BoardFixtures.ts';
import { NO_UNREADABLE_RECORDS }                          from '../../testing/FixtureRecordAllocation.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import type { RecordReference, UnreadableRecords }        from './@types/BoardRecords.ts';
import { createLocalRecordAllocation }                    from './LocalRecordAllocation.ts';
import { workspacePathsFor, type Workspace }              from './Workspace.ts';

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
  mkdirSync(workspace.ticketsDirectory, { recursive: true });
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
  const allocation = createLocalRecordAllocation(scratchWorkspace(), board, NO_UNREADABLE_RECORDS);
  const input      = {
    title: 'Example finding', type: 'bug' as const, bodyFor: () => '', at: AT
  };

  const first = allocation.newTicket(input);
  board.fileTicket(first, AT);
  const second = allocation.newTicket(input);

  expect([first.frontmatter.id, second.frontmatter.id]).toEqual(['001', '002']);
  expect([basename(first.filePath), basename(second.filePath)]).toEqual(['001-example-finding.md', '002-example-finding-2.md']);
});

test('an epic key held by an unreadable file is refused unreadable-file-in-the-way, and a free key answers its file', () => {
  const heldWorkspace = scratchWorkspace();
  const heldLocation  = `${heldWorkspace.epicsDirectory}/example-epic.md`;
  const allocation    = createLocalRecordAllocation(heldWorkspace, boardFixture().board, unreadableRecordsHolding('epic', 'example-epic', heldLocation));

  expect(refusalDetailOf(() => allocation.newEpicLocation('example-epic'))).toEqual({
    status: 'refused',
    detail: { kind: 'unreadable-file-in-the-way', filePath: heldLocation, record: 'epic' },
  });
  expect(allocation.newEpicLocation('example-other-epic')).toBe(`${heldWorkspace.epicsDirectory}/example-other-epic.md`);
});

test('a draft key held by an unreadable file is refused unreadable-file-in-the-way, and a free key is let through', () => {
  const heldWorkspace = scratchWorkspace();
  const heldLocation  = `${heldWorkspace.draftsDirectory}/D7.json`;
  const allocation    = createLocalRecordAllocation(heldWorkspace, boardFixture().board, unreadableRecordsHolding('draft', 'D7', heldLocation));

  expect(refusalDetailOf(() => allocation.requireDraftKeyIsFree('D7'))).toEqual({
    status: 'refused',
    detail: { kind: 'unreadable-file-in-the-way', filePath: heldLocation, record: 'draft' },
  });
  expect(() => allocation.requireDraftKeyIsFree('D8')).not.toThrow();
});

test('locationOf answers a distinct file inside the data folder for each single record', () => {
  const allocation = createLocalRecordAllocation(scratchWorkspace(), boardFixture().board, NO_UNREADABLE_RECORDS);

  const locations = EVERY_SINGLE_RECORD.map((record) => allocation.locationOf({ record }));

  expect(new Set(locations).size).toBe(EVERY_SINGLE_RECORD.length);
  for (const location of locations) expect(dirname(location)).toBe(workspace.trackerDirectory);
});
