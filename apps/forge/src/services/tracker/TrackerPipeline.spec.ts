/**
 * The write pipeline on real tracker files: the mutation runs with the lock held, a Board refusal and any other throw leave every stored
 * file as it was, an unreadable tracker is refused before the mutation runs, and the write order holds (progress.json, the pipeline and the
 * constitution's sources, the tickets each after the content its hash keeps, the deletions, log.jsonl, and the setup record last, so an
 * Apply closes its record after everything it stored), observed by breaking one write from inside the mutation, with no clock. A file
 * whose bytes would not change is left in place, observed by its inode, so a hold that changes nothing writes no file.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';
import { TicketBodyHashUtil }                             from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { OperationRefusal, refusalIsOperationRefusal }    from '../../shared/OperationRefusal.ts';
import { EXAMPLE_PIPELINE_AGENT }                         from '../../testing/ExamplePipelineAgent.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                        from '../../testing/LockTakers.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import {
  BROKEN_LOG_TEXT,
  EXAMPLE_TICKET_FILE_NAME,
  storedFileContentsOf,
  writeReadableTracker
} from '../../testing/TrackerFileFixtures.ts';
import type { BoardTransaction }             from './BoardTransaction.ts';
import { LockGenerationSteps }               from './GenerationLock.ts';
import { localStoreLayoutOf }                from './LocalStoreLayout.ts';
import { listTickets }                       from './TicketStore.ts';
import { writeTracker }                      from './TrackerPipeline.ts';
import { workspacePathsFor, type Workspace } from './Workspace.ts';
import { thrownFailureOf }                   from './testing/ThrownFailure.ts';

const CHANGED_AT = '2026-09-18T20:05:00+02:00';

const now = (): Date => new Date('2026-09-18T18:05:00Z');


let workspace: Workspace;

function ticketFilePath(): string {
  return join(localStoreLayoutOf(workspace).ticketRecordsFolder, EXAMPLE_TICKET_FILE_NAME);
}

function newestLockRecord(): unknown {
  const newestGeneration = (LockGenerationSteps.generationsIn(localStoreLayoutOf(workspace).storeLockFolder) ?? []).at(-1);
  if (newestGeneration === undefined) return null;
  return JSON.parse(readFileSync(LockGenerationSteps.generationPathFor(localStoreLayoutOf(workspace).storeLockFolder, newestGeneration), 'utf8'));
}

/** An atomic replace lands a new inode, so a file keeping its inode was never written. */
function inodesOf(filePaths: readonly string[]): number[] {
  return filePaths.map((filePath) => statSync(filePath).ino);
}

function addExampleRow(change: BoardTransaction, name = 'Example rendered row'): void {
  change.board.addTask({ name, startsNow: false, movesTheLink: false }, change.at);
}

beforeEach(() => {
  workspace = workspacePathsFor(createScratchDirectory('tracker-pipeline'));
  mkdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder, { recursive: true });
});

afterEach(() => {
  removeScratchDirectory(workspace.rootDirectory);
});

describe('writeTracker', () => {
  test('the mutation runs with the lock held', async () => {
    writeReadableTracker(workspace);

    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    () => newestLockRecord(),
    });

    expect(written.result).toMatchObject({ holder: { processId: process.pid }, state: 'held' });
  });

  test('the returned Board carries the mutation', async () => {
    writeReadableTracker(workspace);

    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => addExampleRow(change),
    });

    expect(written.board.tasks().map((task) => task.name)).toEqual(['Example rendered row']);
    expect(written.unreadableRecords).toEqual({ tickets: [], epics: [], drafts: [] });
  });

  test('a Board refusal arrives as a refused OperationRefusal carrying its detail, and every file stays byte for byte', async () => {
    writeReadableTracker(workspace);
    const filesBefore = storedFileContentsOf(workspace);

    const failure = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        addExampleRow(change);
        change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
        change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
      },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('refused');
    expect(refusalIsOperationRefusal(failure) ? failure.detail : null).toEqual({
      kind:         'board-refusal',
      boardRefusal: { reason: 'ticket-already-held', ticketId: '001' },
    });
    expect(storedFileContentsOf(workspace)).toEqual(filesBefore);
  });

  test('any other throw arrives as it was thrown, and nothing is written', async () => {
    writeReadableTracker(workspace);
    const filesBefore   = storedFileContentsOf(workspace);
    const thrownFailure = new Error('the mutation failed');

    const failure = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        addExampleRow(change);
        throw thrownFailure;
      },
    }));

    expect(failure).toBe(thrownFailure);
    expect(storedFileContentsOf(workspace)).toEqual(filesBefore);
  });

  test('an OperationRefusal thrown by the mutation arrives as it was thrown, with its own status', async () => {
    writeReadableTracker(workspace);
    const thrownRefusal = new OperationRefusal('refused', 'Example refusal from the mutation.');

    const failure = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    () => { throw thrownRefusal; },
    }));

    expect(failure).toBe(thrownRefusal);
  });

  test('an unreadable tracker is refused as unrepaired, and the mutation is never called', async () => {
    writeReadableTracker(workspace);
    writeFileSync(localStoreLayoutOf(workspace).logRecordPath, BROKEN_LOG_TEXT);
    let mutationWasCalled = false;

    const failure = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    () => { mutationWasCalled = true; },
    }));

    expect(refusalIsOperationRefusal(failure) ? failure.status : null).toBe('unrepaired');
    expect(refusalIsOperationRefusal(failure) ? failure.detail?.kind : null).toBe('unreadable-tracker');
    expect(mutationWasCalled).toBe(false);
  });

  test('a ticket write that fails does so after progress.json is written and before log.jsonl', async () => {
    writeReadableTracker(workspace);
    const logBefore = readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8');

    const failure = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        addExampleRow(change);
        change.board.holdTicket('001', 'Waiting on Alex Example', change.at);
        rmSync(ticketFilePath());
        mkdirSync(ticketFilePath());
      },
    }));

    expect(String(failure), 'the ticket write is what failed').toContain(`/${EXAMPLE_TICKET_FILE_NAME}'`);
    expect(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8')).toContain('Example rendered row');
    expect(readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8')).toBe(logBefore);
  });

  test('the ticket files are deleted after progress.json is written, and the callback is handed their count', async () => {
    writeReadableTracker(workspace);
    writeFileSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, '002-broken-by-hand.md'), 'no frontmatter here\n');
    const observedDeletions: { deletedTicketCount: number; progressAtDeletion: string }[] = [];

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        addExampleRow(change);
        change.deleteAllTicketFilesAfterwards((deletedTicketCount) => {
          observedDeletions.push({ deletedTicketCount, progressAtDeletion: readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8') });
        });
      },
    });

    expect(observedDeletions.map((deletion) => deletion.deletedTicketCount)).toEqual([2]);
    expect(observedDeletions[0]?.progressAtDeletion ?? '').toContain('Example rendered row');
    expect(readdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder)).toEqual([]);
  });

  test('the stored log entry count is the count read before the mutation logged anything', async () => {
    writeReadableTracker(workspace);

    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        change.board.recordNote('Example note', change.at);
        return change.storedLogEntryCount;
      },
    });

    expect(written.result).toBe(1);
    expect(readFileSync(localStoreLayoutOf(workspace).logRecordPath, 'utf8').trimEnd().split('\n')).toHaveLength(2);
  });

  // The Hatch inbox applies every pending relayed `ticket add` in one hold, before any ticket file is written.
  test('two tickets filed in one hold take two ids and two files, and both list', async () => {
    writeReadableTracker(workspace);
    const fileExampleTicket = (change: BoardTransaction): void => {
      const ticket = change.records.newTicket({
        title: 'Example finding', type: 'bug', bodyFor: () => '# Example finding\n', at: change.at
      });
      change.board.fileTicket(ticket, change.at);
    };

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        fileExampleTicket(change);
        fileExampleTicket(change);
      },
    });

    const listing = listTickets(workspace);
    expect(listing.unreadable).toEqual([]);
    expect(listing.tickets.map((ticket) => basename(listing.ticketLocations.get(ticket.frontmatter.id) ?? ''))).toEqual([
      EXAMPLE_TICKET_FILE_NAME,
      '002-example-finding.md',
      '003-example-finding-2.md',
    ]);
  });

  // The model holds no location, so a retitle must not drift the ticket to a fresh `<id>-<slug>.md` beside its file.
  test('a changed ticket is written to the file it was read from, also after a retitle', async () => {
    writeReadableTracker(workspace);
    const handNamedPath = join(localStoreLayoutOf(workspace).ticketRecordsFolder, '001-named-by-hand.md');
    renameSync(ticketFilePath(), handNamedPath);

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.editTicket('001', { title: 'Example retitled checkout', writtenBy: 'board' }, change.at),
    });

    expect(readdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder)).toEqual(['001-named-by-hand.md']);
    expect(listTickets(workspace).tickets.map((ticket) => ticket.frontmatter.title)).toEqual(['Example retitled checkout']);
  });

  test('a ticket committed in the hold is journaled after its kept content, and a hold cut between the two replays to the same board', async () => {
    writeReadableTracker(workspace);
    const commitATicket = (change: BoardTransaction): void => {
      const ticket = change.records.newTicket({
        title: 'Example kept page', type: 'ticket', bodyFor: () => 'Kept.\n', at: change.at
      });
      change.board.fileTicket(ticket, change.at);
      change.board.readyDraftTickets([ticket.frontmatter.id], () => [], change.at);
    };
    const keptPath = join(localStoreLayoutOf(workspace).committedContentFolder, `${TicketBodyHashUtil.contentHashOf('Example kept page', 'Kept.\n')}.json`);
    const journalText = (): string => readFileSync(localStoreLayoutOf(workspace).holdJournalPath, 'utf8');

    await thrownFailureOf(() => writeTracker({
      lockTaker:        LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           commitATicket,
      afterFileWritten: (filePath) => {
        if (filePath === keptPath) throw new Error('Example cut after the kept content');
      },
    }));
    const journaledPaths = (JSON.parse(journalText()) as { files: { path: string }[] }).files.map((file) => file.path);
    const keptIndex      = journaledPaths.findIndex((path) => path.startsWith('committed-content/'));
    expect(keptIndex).toBeGreaterThanOrEqual(0);
    expect(keptIndex).toBeLessThan(journaledPaths.findIndex((path) => path.startsWith('tickets/002-')));

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER, workspace, at: CHANGED_AT, now, mutate: () => 'Example'
    });

    const replayed = listTickets(workspace);
    expect(replayed.unreadable).toEqual([]);
    const keptHash = TicketBodyHashUtil.contentHashOf('Example kept page', 'Kept.\n');
    expect(replayed.tickets.find((ticket) => ticket.frontmatter.id === '002')?.frontmatter).toMatchObject({ status: 'committed', contentHash: keptHash });
  });

  test('a ticket the Board changed that the store never listed nor allocated throws, and nothing is written', async () => {
    writeReadableTracker(workspace);
    const storedBefore = storedFileContentsOf(workspace);

    const failure = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        const [stored] = change.board.tickets();
        if (stored === undefined) throw new Error('the example tracker holds no ticket');
        change.board.fileTicket({ ...stored, frontmatter: { ...stored.frontmatter, id: '009' } }, change.at);
      },
    }));

    expect(String(failure)).toContain('#009');
    expect(storedFileContentsOf(workspace)).toEqual(storedBefore);
  });

  test('an added epic is written to <key>.md and a removed one is removed from there', async () => {
    writeReadableTracker(workspace);
    const addition = { key: 'example-epic', title: 'Example epic', body: 'Alex Example pays in one step.\n' };

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.addEpic(addition, change.at)
    });
    expect(readdirSync(localStoreLayoutOf(workspace).epicRecordsFolder)).toEqual(['example-epic.md']);

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.removeEpic('example-epic', change.at)
    });
    expect(readdirSync(localStoreLayoutOf(workspace).epicRecordsFolder)).toEqual([]);
  });

  test('the mutation gets the unreadable records, keyed, and the records a hold allocates from; the caller gets the same report', async () => {
    writeReadableTracker(workspace);
    mkdirSync(localStoreLayoutOf(workspace).epicRecordsFolder, { recursive: true });
    mkdirSync(localStoreLayoutOf(workspace).draftRecordsFolder, { recursive: true });
    writeFileSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, '004-broken-by-hand.md'), 'not a ticket at all\n');
    writeFileSync(join(localStoreLayoutOf(workspace).epicRecordsFolder, 'example-epic.md'), 'not an epic at all\n');
    writeFileSync(join(localStoreLayoutOf(workspace).draftRecordsFolder, 'D7.json'), '{');

    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => ({
        unreadableKeys: [change.unreadableRecords.tickets, change.unreadableRecords.epics, change.unreadableRecords.drafts]
          .map((unreadable) => unreadable.map(({ record, key }) => `${record} ${key}`)),
        newTicketId: change.records.newTicket({
          title: 'Example finding', type: 'bug', bodyFor: () => '', at: change.at
        }).frontmatter.id,
        progressPlace: change.records.locationOf({ record: 'progress' }),
      }),
    });

    expect(written.result).toEqual({
      unreadableKeys: [['ticket 004'], ['epic example-epic'], ['draft D7']],
      newTicketId:    '005',
      progressPlace:  localStoreLayoutOf(workspace).progressRecordPath,
    });
    expect(written.unreadableRecords.tickets.map(({ location }) => location)).toEqual([join(localStoreLayoutOf(workspace).ticketRecordsFolder, '004-broken-by-hand.md')]);
    expect(written.unreadableRecords.epics.map(({ location }) => location)).toEqual([join(localStoreLayoutOf(workspace).epicRecordsFolder, 'example-epic.md')]);
  });

  test('a hold that changes nothing writes no file: every stored file keeps its inode and its bytes', async () => {
    writeReadableTracker(workspace);
    const storedFilePaths = [localStoreLayoutOf(workspace).progressRecordPath, localStoreLayoutOf(workspace).logRecordPath, ticketFilePath()];
    const inodesBefore = inodesOf(storedFilePaths);
    const contentsBefore = storedFileContentsOf(workspace);
    const filesWritten: string[] = [];

    await writeTracker({
      lockTaker:        LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           () => {},
      afterFileWritten: (filePath) => filesWritten.push(filePath),
    });

    expect(filesWritten).toEqual([]);
    expect(inodesOf(storedFilePaths)).toEqual(inodesBefore);
    expect(storedFileContentsOf(workspace)).toEqual(contentsBefore);
  });

  test('a hold writes only the files whose bytes change: a held ticket rewrites its ticket and the log, and progress.json stays in place', async () => {
    writeReadableTracker(workspace);
    const progressInodeBefore = inodesOf([localStoreLayoutOf(workspace).progressRecordPath]);
    const filesWritten: string[] = [];

    await writeTracker({
      lockTaker:        LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => { change.board.holdTicket('001', 'Waiting on Alex Example', change.at); },
      afterFileWritten: (filePath) => filesWritten.push(filePath),
    });

    expect(filesWritten).toEqual([ticketFilePath(), localStoreLayoutOf(workspace).logRecordPath]);
    expect(inodesOf([localStoreLayoutOf(workspace).progressRecordPath])).toEqual(progressInodeBefore);
    expect(readFileSync(ticketFilePath(), 'utf8')).toContain('Waiting on Alex Example');
  });
});

// The Board's `pipelineIsSet` is "a pipeline was handed in", so the hold of resumes and new work rests on this mapping of the reading.
describe('the pipeline a hold hands the Board', () => {
  test.each<[string, string | null, 'older' | 'malformed' | null]>([
    ['no file', null, null],
    ['an older file', '{ "prepare": [], "gates": [] }\n', 'older'],
    ['a malformed file', '{ "version": 5, "prepare": [], "gates": [] }\n', 'malformed'],
  ])('%s gives the Board no pipeline, as unset, and names the unreadable verdict to the change', async (_case, pipelineText, verdict) => {
    writeReadableTracker(workspace);
    if (pipelineText !== null) writeFileSync(localStoreLayoutOf(workspace).pipelineRecordPath, pipelineText);

    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => ({ pipeline: change.board.pipeline(), unreadableVerdict: change.unreadablePipeline?.verdict ?? null }),
    });

    expect(written.result).toEqual({ pipeline: null, unreadableVerdict: verdict });
  });

  test('a readable minimal file gives the Board that pipeline, which counts as set', async () => {
    writeReadableTracker(workspace);
    writeFileSync(localStoreLayoutOf(workspace).pipelineRecordPath, '{ "version": 5, "prepare": [], "gates": [], "phases": { "build": [], "review": [], "merge": [] } }\n');

    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.pipeline()
    });

    expect(written.result).toEqual({
      version: 5, prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
    });
  });
});

describe('the setup record a hold reads and writes', () => {
  const FIRST_SETUP = {
    mode: 'setup', billing: { mode: 'subscription' }, agent: EXAMPLE_PIPELINE_AGENT, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  } as const;

  test('a setup move writes pipeline-setup.json after log.jsonl, and a start over removes it', async () => {
    writeReadableTracker(workspace);
    const writtenPaths: string[] = [];

    await writeTracker({
      lockTaker:        LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => change.board.openSetup(FIRST_SETUP, change.at),
      afterFileWritten: (filePath) => writtenPaths.push(filePath)
    });

    const layout = localStoreLayoutOf(workspace);
    expect(writtenPaths).toEqual([layout.progressRecordPath, layout.logRecordPath, layout.pipelineSetupRecordPath]);
    expect(JSON.parse(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8'))).toMatchObject({ nextSetupId: 2 });
    expect(JSON.parse(readFileSync(localStoreLayoutOf(workspace).pipelineSetupRecordPath, 'utf8'))).toMatchObject({ formatVersion: 3, setupId: 'S1', currentStep: 'research' });
    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.pipelineSetup()?.setupId
    });
    expect(written.result).toBe('S1');

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.startOverSetup('S1', change.at)
    });
    expect(existsSync(localStoreLayoutOf(workspace).pipelineSetupRecordPath)).toBe(false);
  });

  test('an Apply writes the pipeline and the constitution\'s sources after progress.json, then log.jsonl, and removes the record last', async () => {
    writeReadableTracker(workspace);
    const constitution = { path: 'CONSTITUTION.md', markdown: '# Example Agency\n\n- Keep the basket page fast.\n', blob: 'b'.repeat(40) };
    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => {
        const { setup } = change.board.openSetup(FIRST_SETUP, change.at);
        change.board.setConstitution(setup.setupId, {
          markdown:    constitution.markdown,
          annotations: [{
            lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'research', path: null
          }]
        }, change.at);
      },
    });
    const writtenPaths: string[] = [];

    await writeTracker({
      lockTaker:        LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => change.board.requestApply('S1', { draftRevision: 0, resumesBoard: true, mainConstitution: constitution }, change.at),
      afterFileWritten: (filePath) => writtenPaths.push(filePath),
    });

    const layout = localStoreLayoutOf(workspace);
    expect(writtenPaths).toEqual([
      layout.progressRecordPath, layout.pipelineRecordPath, layout.constitutionSourcesRecordPath, layout.logRecordPath, layout.pipelineSetupRecordPath
    ]);
    expect(existsSync(localStoreLayoutOf(workspace).pipelineSetupRecordPath)).toBe(false);
    expect(JSON.parse(readFileSync(localStoreLayoutOf(workspace).pipelineRecordPath, 'utf8'))).toMatchObject({ version: 5, constitution: { path: 'CONSTITUTION.md' } });
    expect(JSON.parse(readFileSync(localStoreLayoutOf(workspace).constitutionSourcesRecordPath, 'utf8'))).toMatchObject({ formatVersion: 1, blob: constitution.blob });
    expect(JSON.parse(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8'))).toMatchObject({ hephaestusState: 'running' });
  });

  test('a malformed record is a verdict: other writes go on, a setup move is refused, and the file stays byte for byte', async () => {
    writeReadableTracker(workspace);
    writeFileSync(localStoreLayoutOf(workspace).pipelineSetupRecordPath, '{ "formatVersion": 3 }\n');

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    addExampleRow
    });
    const refusal = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.openSetup(FIRST_SETUP, change.at)
    }));

    expect(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8')).toContain('Example rendered row');
    const boardRefusal = { reason: 'pipeline-setup-unreadable', problem: 'setupId is missing' } as const;
    expect(refusalIsOperationRefusal(refusal) && refusal.detail).toEqual({ kind: 'board-refusal', boardRefusal });
    expect(readFileSync(localStoreLayoutOf(workspace).pipelineSetupRecordPath, 'utf8')).toBe('{ "formatVersion": 3 }\n');
  });
});

describe('the gate profile runs a hold reads and writes', () => {
  const PROFILE_REQUEST = {
    setupId: null, phase: 'build', gate: { name: 'tests', run: 'bun test' }, prepare: []
  } as const;

  test('a profile move writes gate-profiles.json before log.jsonl, and a later hold reads the run back', async () => {
    writeReadableTracker(workspace);
    const writtenPaths: string[] = [];

    await writeTracker({
      lockTaker:        LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:               CHANGED_AT,
      now,
      mutate:           (change) => change.board.queueGateProfile(PROFILE_REQUEST, change.at),
      afterFileWritten: (filePath) => writtenPaths.push(filePath)
    });

    expect(writtenPaths).toEqual([localStoreLayoutOf(workspace).gateProfilesRecordPath, localStoreLayoutOf(workspace).logRecordPath]);
    const { gateProfilesRecordPath } = localStoreLayoutOf(workspace);
    expect(JSON.parse(readFileSync(gateProfilesRecordPath, 'utf8'))).toMatchObject({ formatVersion: 1, nextRunNumber: 2, runs: [{ profileRunId: 'P1' }] });
    const written = await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.gateProfileRuns().map((run) => run.state)
    });
    expect(written.result).toEqual(['queued']);
  });

  test('a malformed file is a verdict: other writes go on, a profile move is refused, and the file stays byte for byte', async () => {
    writeReadableTracker(workspace);
    writeFileSync(localStoreLayoutOf(workspace).gateProfilesRecordPath, '{ "formatVersion": 1 }\n');

    await writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    addExampleRow
    });
    const refusal = await thrownFailureOf(() => writeTracker({
      lockTaker: LIVE_HOLDERS_LOCK_TAKER,
      workspace,
      at:        CHANGED_AT,
      now,
      mutate:    (change) => change.board.queueGateProfile(PROFILE_REQUEST, change.at)
    }));

    expect(readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8')).toContain('Example rendered row');
    const boardRefusal = { reason: 'gate-profiles-unreadable', problem: 'nextRunNumber is missing' } as const;
    expect(refusalIsOperationRefusal(refusal) && refusal.detail).toEqual({ kind: 'board-refusal', boardRefusal });
    expect(readFileSync(localStoreLayoutOf(workspace).gateProfilesRecordPath, 'utf8')).toBe('{ "formatVersion": 1 }\n');
  });
});
