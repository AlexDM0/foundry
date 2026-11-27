/**
 * Every way an id-to-path mapping can go wrong in a directory a person also edits: the `3`/`003`/`#3`
 * spellings, colliding slugs, a deleted file whose number stays spent, and a file that no longer parses. A hold
 * spends ids the disk does not show yet: a ticket filed earlier in it, and one whose filing only the log keeps.
 */

import {
  copyFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import {
  afterEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { createProgressFileWriter }                       from '../../adapters/progress/ProgressFileWriter.ts';
import { createTicketFileWriter }                         from '../../adapters/tickets/TicketFileWriter.ts';
import type { LogRecord }                                 from '../../domain/tracker-model/@types/LogRecord.ts';
import type { TicketType }                                from '../../domain/tracker-model/@types/Ticket.ts';
import { TaskRecordUtil }                                 from '../../domain/tracker-model/utils/TaskRecordUtil.ts';
import { emptyProgress }                                  from '../../testing/ProgressFixtures.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { localStoreLayoutOf }                             from './LocalStoreLayout.ts';
import {
  type CreatedTicket,
  createTicket,
  everyTicketFilePathIn,
  listTickets,
  nextTicketId,
  readTicket,
  type TicketsSpentInHold,
} from './TicketStore.ts';
import { workspacePathsFor, type Workspace } from './Workspace.ts';

const FILED_AT    = '2026-09-18T09:00:00+02:00';
const TICKET_BODY = '# Example\n\n## Report\n\nReported by Alex Example.\n';

const NOTHING_SPENT_IN_HOLD: TicketsSpentInHold = { tickets: () => [], logRecordsSoFar: () => [] };
const NO_HELD_TICKET_LOCATIONS: readonly string[] = [];

const scratchRootDirectories: string[] = [];

function scratchWorkspace(): Workspace {
  const workspace = workspacePathsFor(createScratchDirectory('tickets'));
  mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
  scratchRootDirectories.push(workspace.rootDirectory);
  return workspace;
}

function fileTicket(workspace: Workspace, title: string, type: TicketType): CreatedTicket {
  const created = createTicket(workspace, NOTHING_SPENT_IN_HOLD, NO_HELD_TICKET_LOCATIONS, {
    title,
    type,
    bodyFor: () => TICKET_BODY,
    at:      FILED_AT,
  });
  createTicketFileWriter().write(created.ticket, created.location);
  return created;
}

afterEach(() => {
  for (const rootDirectory of scratchRootDirectories) removeScratchDirectory(rootDirectory);
  scratchRootDirectories.length = 0;
});

describe('createTicket and listTickets', () => {
  test('files three tickets as <id>-<slug>.md and lists them in id order, each with its file by its id', () => {
    const workspace = scratchWorkspace();

    fileTicket(workspace, 'Fix the export dialog', 'bug');
    fileTicket(workspace, 'Add a keyboard shortcut', 'research');
    fileTicket(workspace, 'Tidy the seed data', 'ticket');

    const listing = listTickets(workspace);

    expect(listing.unreadable).toEqual([]);
    expect(listing.tickets.map((ticket) => basename(listing.ticketLocations.get(ticket.frontmatter.id) ?? ''))).toEqual([
      '001-fix-the-export-dialog.md',
      '002-add-a-keyboard-shortcut.md',
      '003-tidy-the-seed-data.md',
    ]);
    expect(listing.tickets.map((ticket) => ticket.frontmatter.id)).toEqual(['001', '002', '003']);
  });

  test('a new ticket opens as a draft with no timeline and no task row of its own', () => {
    const workspace = scratchWorkspace();
    const { ticket } = createTicket(workspace, NOTHING_SPENT_IN_HOLD, NO_HELD_TICKET_LOCATIONS, {
      title:   'Fix the export dialog',
      type:    'bug',
      group:   'export-dialog',
      bodyFor: () => TICKET_BODY,
      at:      FILED_AT,
    });

    expect(ticket.frontmatter.status).toBe('draft');
    expect(ticket.frontmatter.filed).toBe(FILED_AT);
    expect(ticket.frontmatter.updated).toBe(FILED_AT);
    expect(ticket.frontmatter.started).toBeNull();
    expect(ticket.frontmatter.delivered).toBeNull();
    expect(ticket.frontmatter.group).toBe('export-dialog');
    expect(ticket.frontmatter.task).toBeNull();
    expect(ticket.body).toBe(TICKET_BODY);
  });

  // The command layer writes a new ticket after the progress file; a write in here would come first, and a second time.
  test('writes no file, and composes the body from the id it assigns', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');

    const { ticket } = createTicket(workspace, NOTHING_SPENT_IN_HOLD, NO_HELD_TICKET_LOCATIONS, {
      title:   'Add a keyboard shortcut',
      type:    'research',
      bodyFor: (ticketId) => `# ${ticketId} — Add a keyboard shortcut\n`,
      at:      FILED_AT,
    });

    expect(ticket.body).toBe('# 002 — Add a keyboard shortcut\n');
    expect(listTickets(workspace).tickets.map((listed) => listed.frontmatter.id)).toEqual(['001']);
  });

  test('a repeated title takes a suffixed slug, so the file names stay tellable apart without their ids', () => {
    const workspace = scratchWorkspace();

    fileTicket(workspace, 'Fix the export dialog', 'bug');
    const second = fileTicket(workspace, 'Fix the export dialog', 'bug');
    const third  = fileTicket(workspace, 'Fix the export dialog', 'bug');

    expect(basename(second.location)).toBe('002-fix-the-export-dialog-2.md');
    expect(basename(third.location)).toBe('003-fix-the-export-dialog-3.md');
  });

  test('a file that does not parse is reported with its key, path and line while the other tickets still list', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    const brokenPath = join(localStoreLayoutOf(workspace).ticketRecordsFolder, '002-broken.md');
    writeFileSync(brokenPath, '---\nid: "002"\ntitle: "No fence"\n');

    const listing = listTickets(workspace);

    expect(listing.tickets.map((ticket) => ticket.frontmatter.id)).toEqual(['001']);
    expect(listing.unreadable).toEqual([{
      record: 'ticket', key: '002', location: brokenPath, reason: 'the frontmatter has no closing `---` fence', line: 3
    }]);
  });

  test('a file that does not parse and whose name carries no number is keyed null', () => {
    const workspace  = scratchWorkspace();
    const brokenPath = join(localStoreLayoutOf(workspace).ticketRecordsFolder, 'notes-by-hand.md');
    writeFileSync(brokenPath, 'not a ticket at all\n');

    expect(listTickets(workspace).unreadable.map((unreadable) => [unreadable.key, unreadable.location])).toEqual([[null, brokenPath]]);
  });

  test('a tickets directory that does not exist reads as no tickets rather than as a failure', () => {
    const workspace = scratchWorkspace();
    rmSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true, force: true });

    expect(listTickets(workspace)).toEqual({
      tickets: [], unreadable: [], contentRestored: [], ticketLocations: new Map()
    });
    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('001');
  });
});

describe('readTicket', () => {
  test('resolves 2, 002, #2 and #002 to the same ticket', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    fileTicket(workspace, 'Add a keyboard shortcut', 'research');

    for (const reference of ['2', '002', '#2', '#002']) {
      expect(readTicket(workspace, reference)?.frontmatter.title).toBe('Add a keyboard shortcut');
    }
  });

  test('a reference that is not a ticket number, and an id with no file, both read as no ticket', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');

    expect(readTicket(workspace, 'the-export-one')).toBeNull();
    expect(readTicket(workspace, '404')).toBeNull();
  });

  test('a broken file reads as no ticket instead of throwing out of the store', () => {
    const workspace = scratchWorkspace();
    writeFileSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, '001-broken.md'), 'not a ticket at all\n');

    expect(readTicket(workspace, '1')).toBeNull();
  });

  test('every ticket stored in the current format is listed in id order', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    fileTicket(workspace, 'Add a keyboard shortcut', 'research');

    const listing = listTickets(workspace);

    expect(listing.tickets.map((listed) => listed.frontmatter.id)).toEqual(['001', '002']);
    expect(listing.unreadable).toEqual([]);
  });
});

describe('nextTicketId', () => {
  test('a gap left by a ticket deleted by hand is tolerated and never filled', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    const second = fileTicket(workspace, 'Add a keyboard shortcut', 'research');
    fileTicket(workspace, 'Tidy the seed data', 'ticket');
    unlinkSync(second.location);

    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('004');
  });

  // A draft has no row, so once its file is deleted by hand only its `ticket-filed` record still holds its id.
  test('a draft deleted by hand still spends its id through the log record of its filing', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    const draft = fileTicket(workspace, 'Add a keyboard shortcut', 'research');
    unlinkSync(draft.location);
    const filingRecord: LogRecord = {
      at: FILED_AT, kind: 'ticket-filed', ticketId: '002', fields: { title: 'Add a keyboard shortcut' }
    };

    expect(nextTicketId(workspace, { tickets: () => [], logRecordsSoFar: () => [filingRecord] })).toBe('003');
  });

  // Two relayed filings applied in one hold: the first is on the Board but not yet on disk when the second takes its id.
  test('a ticket filed earlier in the same hold, not yet written, spends its id and its slug', () => {
    const workspace  = scratchWorkspace();
    const unwritten  = createTicket(workspace, NOTHING_SPENT_IN_HOLD, NO_HELD_TICKET_LOCATIONS, {
      title: 'Fix the export dialog', type: 'bug', bodyFor: () => TICKET_BODY, at: FILED_AT
    });
    const second     = createTicket(workspace, { tickets: () => [unwritten.ticket], logRecordsSoFar: () => [] }, [unwritten.location], {
      title:   'Fix the export dialog',
      type:    'bug',
      bodyFor: () => TICKET_BODY,
      at:      FILED_AT,
    });

    expect(second.ticket.frontmatter.id).toBe('002');
    expect(basename(second.location)).toBe('002-fix-the-export-dialog-2.md');
  });

  test('a malformed file still spends its number', () => {
    const workspace = scratchWorkspace();
    writeFileSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, '002-broken.md'), 'not a ticket at all\n');

    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('003');
  });
});

// A person renames ticket files by hand; the id the frontmatter holds is the ticket's identity, never the name it was given.
describe('a ticket file renamed by hand', () => {
  test('a file renamed without its number still spends its id, so the next ticket is not issued it again', () => {
    const workspace = scratchWorkspace();
    const first     = fileTicket(workspace, 'Fix the export dialog', 'bug');
    renameSync(first.location, join(localStoreLayoutOf(workspace).ticketRecordsFolder, 'renamed-by-hand.md'));

    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('002');
    expect(readTicket(workspace, '1')?.frontmatter.title).toBe('Fix the export dialog');
  });

  test('a file renamed to another number answers for neither number, and is listed as unreadable naming both, keyed by its name', () => {
    const workspace   = scratchWorkspace();
    const first       = fileTicket(workspace, 'Fix the export dialog', 'bug');
    const renamedPath = join(localStoreLayoutOf(workspace).ticketRecordsFolder, '012-renamed.md');
    renameSync(first.location, renamedPath);

    expect(readTicket(workspace, '12')).toBeNull();
    expect(readTicket(workspace, '1')).toBeNull();
    expect(listTickets(workspace)).toEqual({
      tickets:         [],
      ticketLocations: new Map(),
      contentRestored: [],
      unreadable:      [{
        record: 'ticket', key: '012', location: renamedPath, reason: 'the file name says #012 but its `id` is 001', line: 2
      }],
    });
    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('013');
  });

  test('two files holding one id are both listed as unreadable keyed by that id, and neither answers for it', () => {
    const workspace = scratchWorkspace();
    const first     = fileTicket(workspace, 'Fix the export dialog', 'bug');
    const copyPath  = join(localStoreLayoutOf(workspace).ticketRecordsFolder, 'copy-of-the-first.md');
    copyFileSync(first.location, copyPath);

    expect(readTicket(workspace, '1')).toBeNull();
    expect(listTickets(workspace)).toEqual({
      tickets:         [],
      ticketLocations: new Map(),
      contentRestored: [],
      unreadable:      [
        {
          record: 'ticket', key: '001', location: first.location, reason: 'ticket #001 is also held by copy-of-the-first.md', line: 2
        },
        {
          record: 'ticket', key: '001', location: copyPath, reason: 'ticket #001 is also held by 001-fix-the-export-dialog.md', line: 2
        },
      ],
    });
  });

  // `ticket add` writes the progress file before the ticket file; a crash between the two leaves a row naming an id no file holds.
  test('an id a task row names spends its number although no ticket file holds it', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    const progress = emptyProgress();
    createProgressFileWriter(localStoreLayoutOf(workspace).progressRecordPath).write({
      ...progress,
      nextTaskId: 4,
      tasks:      [
        TaskRecordUtil.filedTaskOf(1, { name: 'Fix the export dialog', ticket: '001' }),
        TaskRecordUtil.filedTaskOf(2, { name: 'Example row of a ticket never written', ticket: '005' }),
        TaskRecordUtil.filedTaskOf(3, { name: 'Example free row' }),
      ],
    });

    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('006');
  });

  test('a progress file that does not parse leaves the ids to the ticket files', () => {
    const workspace = scratchWorkspace();
    fileTicket(workspace, 'Fix the export dialog', 'bug');
    writeFileSync(localStoreLayoutOf(workspace).progressRecordPath, '{ not json');

    expect(nextTicketId(workspace, NOTHING_SPENT_IN_HOLD)).toBe('002');
  });
});

describe('everyTicketFilePathIn', () => {
  test('answers every ticket file, a file that does not parse included, and removes none', () => {
    const workspace = scratchWorkspace();
    const first     = fileTicket(workspace, 'Fix the export dialog', 'bug');
    const second    = fileTicket(workspace, 'Add a keyboard shortcut', 'research');
    writeFileSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, '003-broken-by-hand.md'), 'no frontmatter here\n');

    const brokenFilePath = join(localStoreLayoutOf(workspace).ticketRecordsFolder, '003-broken-by-hand.md');
    expect(everyTicketFilePathIn(workspace).toSorted()).toEqual([first.location, second.location, brokenFilePath].toSorted());
    expect(listTickets(workspace).tickets).toHaveLength(2);
  });
});
