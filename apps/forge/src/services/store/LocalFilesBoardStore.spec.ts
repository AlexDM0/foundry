/**
 * What only the local files adapter promises beyond the contract: a cut-short write is finished by the next writer; a malformed hold journal
 * stops every write; an unreadable ticket stays off the Board; reads take no lock; committed content is written before the ticket file, so a
 * write cut between the two leaves a board that reads. The `.git` folder is planted, so finding the prefix runs no git.
 */
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join, sep } from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
} from 'bun:test';

import { GENERATION_RECORD_FORMAT_VERSION }                             from '../../adapters/generation-record/GenerationRecordIngestion.ts';
import type { PipelineEntity }                                          from '../../domain/tracker-model/@types/Pipeline.ts';
import { TicketBodyHashUtil }                                           from '../../domain/tracker-model/utils/TicketBodyHashUtil.ts';
import type { ControlCommand }                                          from '../../shared/@types/ControlCommand.ts';
import { refusalIsOperationRefusal }                                    from '../../shared/OperationRefusal.ts';
import { ECHOED_CONTROL_CONTEXT }                                       from '../../testing/EchoedControlContext.ts';
import { lockRetryWaitsDuring }                                         from '../../testing/LockRetryWaits.ts';
import { LIVE_HOLDERS_LOCK_TAKER, lockTakerJudgingHoldersBy }           from '../../testing/LockTakers.ts';
import { createScratchDirectory, removeScratchDirectory }               from '../../testing/ScratchWorkspace.ts';
import { storedFileContentsOf }                                         from '../../testing/TrackerFileFixtures.ts';
import type { RecordReference }                                         from '../tracker/@types/BoardRecords.ts';
import type { BoardTransaction }                                        from '../tracker/BoardTransaction.ts';
import type { LockHolder, LockTaker }                                   from '../tracker/GenerationLock.ts';
import { localStoreLayoutOf }                                           from '../tracker/LocalStoreLayout.ts';
import { workspacePathsFor, type Workspace }                            from '../tracker/Workspace.ts';
import type { BoardStore }                                              from './BoardStore.ts';
import { createLocalFilesBoardStore, type LocalFilesBoardStoreOptions } from './LocalFilesBoardStore.ts';

const STARTED_AT = '2026-11-20T09:00:00+01:00';
const CHANGED_AT = '2026-11-20T10:00:00+01:00';
const LATER_AT   = '2026-11-20T11:00:00+01:00';

const FILES_NOT_A_LIST = { code: 'files-not-a-list', field: 'files' } as const;

const fixedNow = (): Date => new Date('2026-11-20T08:00:00Z');

const EXAMPLE_ENTITIES: Record<string, PipelineEntity> = {
  web: {
    kind: 'app', home: ['/apps/web'], prepare: [], gates: [], phases: { build: [], review: [], merge: [] }
  },
};

const EVERY_RECORD_REFERENCE: readonly RecordReference[] = (
  ['progress', 'pipeline', 'pipeline-setup', 'gate-profiles', 'constitution-sources', 'log', 'unfinished-write'] as const
).map((record) => ({ record }));

let repositoryRoot = '';

beforeEach(() => {
  repositoryRoot = createScratchDirectory('local-files-board-store');
  mkdirSync(join(repositoryRoot, '.git'));
});

afterEach(() => {
  removeScratchDirectory(repositoryRoot);
});

function storeOptionsIn(projectFolder: string, afterFileWritten?: (location: string) => void, lockTaker: LockTaker = LIVE_HOLDERS_LOCK_TAKER): LocalFilesBoardStoreOptions {
  return {
    workspace: workspacePathsFor(join(repositoryRoot, projectFolder)),
    now:       fixedNow,
    lockTaker,
    ...(afterFileWritten === undefined ? {} : { afterFileWritten }),
  };
}

async function initialisedStoreIn(projectFolder: string): Promise<{ store: BoardStore; workspace: Workspace }> {
  const options = storeOptionsIn(projectFolder);
  const store   = createLocalFilesBoardStore(options);
  await store.initialise({ project: 'Example Agency', startedAt: STARTED_AT, trackerId: 'example-tracker' });
  return { store, workspace: options.workspace };
}

function applyCommand<Command extends ControlCommand>(store: BoardStore, command: Command, at = CHANGED_AT) {
  return store.commands.apply({ command, at, context: ECHOED_CONTROL_CONTEXT });
}

async function thrownFailureOf(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('the action did not fail');
}

function refusalDetailOf(thrown: unknown): unknown {
  return refusalIsOperationRefusal(thrown) ? { status: thrown.status, detail: thrown.detail } : thrown;
}

function storeNoGatesWithEntities(transaction: BoardTransaction): void {
  transaction.board.setNoGates(transaction.at).pipeline.entities = EXAMPLE_ENTITIES;
}

describe('a write cut short and a malformed hold journal', () => {
  test('a write cut short after its first file reads as pending, and the next write of another store finishes it', async () => {
    await initialisedStoreIn('');
    const cutShortStore = createLocalFilesBoardStore(storeOptionsIn('', () => {
      throw new Error('Example cut after the first file');
    }));
    const nextStore = createLocalFilesBoardStore(storeOptionsIn(''));

    await thrownFailureOf(() => applyCommand(cutShortStore, { kind: 'concurrency-set', limit: 6 }));
    expect(nextStore.reads.readUnfinishedWrite()).toEqual({ verdict: 'pending' });
    const pendingReading = nextStore.reads.readBoard();
    expect(pendingReading.verdict === 'readable' ? pendingReading.unfinishedWrite : pendingReading).toEqual({ verdict: 'pending' });

    await applyCommand(nextStore, {
      kind: 'draft-open', title: 'Example intake', request: 'Alex Example asks for a basket.\n', owner: 'Alex Example'
    }, LATER_AT);

    expect(nextStore.reads.readUnfinishedWrite()).toEqual({ verdict: 'none' });
    expect(nextStore.reads.requireProgress().concurrencyLimit).toBe(6);
    const logReading = nextStore.reads.readLogRecords();
    expect(logReading.verdict === 'readable' ? logReading.records.map((record) => record.kind) : logReading).toEqual(['concurrency-limit-set', 'draft-opened']);
  });

  test('a malformed hold journal reads as malformed at its location, and every write refuses it', async () => {
    const { store }     = await initialisedStoreIn('');
    const journalPath   = store.reads.locationOf({ record: 'unfinished-write' });
    writeFileSync(journalPath, '{"version":1,"files":"not a list"}\n');
    const expectedRefusal = { status: 'unrepaired', detail: { kind: 'malformed-hold-journal', journalFilePath: journalPath, problem: FILES_NOT_A_LIST } };

    expect(store.reads.readUnfinishedWrite()).toEqual({ verdict: 'malformed', location: journalPath, problem: FILES_NOT_A_LIST });
    expect(refusalDetailOf(await thrownFailureOf(() => applyCommand(store, { kind: 'concurrency-set', limit: 6 })))).toEqual(expectedRefusal);
    expect(refusalDetailOf(await thrownFailureOf(() => store.transactions.transact({ at: CHANGED_AT, mutate: () => 'Example' })))).toEqual(expectedRefusal);
  });
});

const KEPT_TITLE = 'Example basket page';
const KEPT_BODY  = 'The basket shows its items.\n';
const KEPT_HASH  = TicketBodyHashUtil.contentHashOf(KEPT_TITLE, KEPT_BODY);

function commitATicket(transaction: BoardTransaction): string {
  const ticket = transaction.records.newTicket({
    title: KEPT_TITLE, type: 'ticket', bodyFor: () => KEPT_BODY, at: transaction.at
  });
  transaction.board.fileTicket(ticket, transaction.at);
  transaction.board.readyDraftTickets([ticket.frontmatter.id], () => [], transaction.at);
  return ticket.frontmatter.id;
}

function ticketFilePathIn(workspace: Workspace): string {
  const { ticketRecordsFolder } = localStoreLayoutOf(workspace);
  return join(ticketRecordsFolder, readdirSync(ticketRecordsFolder)[0] ?? '');
}

function keptContentPathIn(workspace: Workspace): string {
  return join(localStoreLayoutOf(workspace).committedContentFolder, `${KEPT_HASH}.json`);
}

function contentRestoredCountOf(store: BoardStore): number {
  const logReading = store.reads.readLogRecords();
  return logReading.verdict === 'readable' ? logReading.records.filter((record) => record.kind === 'ticket-content-restored').length : -1;
}

describe('the content kept at the commit', () => {
  test('a ticket committed in a hold has its kept content written whole, before its ticket file', async () => {
    const { workspace } = await initialisedStoreIn('');
    const writtenLocations: string[] = [];
    const store = createLocalFilesBoardStore(storeOptionsIn('', (location) => { writtenLocations.push(location); }));

    await store.transactions.transact({ at: CHANGED_AT, mutate: commitATicket });

    const keptPath = keptContentPathIn(workspace);
    expect(writtenLocations.indexOf(keptPath)).toBeGreaterThanOrEqual(0);
    expect(writtenLocations.indexOf(keptPath)).toBeLessThan(writtenLocations.indexOf(ticketFilePathIn(workspace)));
    expect(JSON.parse(readFileSync(keptPath, 'utf8'))).toEqual({ title: KEPT_TITLE, body: KEPT_BODY });
    expect(store.reads.listTickets().tickets.map((ticket) => ticket.frontmatter.contentHash)).toEqual([KEPT_HASH]);
  });

  test('a hold cut between the kept content and the ticket file replays to the same board', async () => {
    const { workspace } = await initialisedStoreIn('');
    const keptPath = keptContentPathIn(workspace);
    const cutAfterTheKeptContent = createLocalFilesBoardStore(storeOptionsIn('', (location) => {
      if (location === keptPath) throw new Error('Example cut after the kept content');
    }));
    const nextStore = createLocalFilesBoardStore(storeOptionsIn(''));

    await thrownFailureOf(() => cutAfterTheKeptContent.transactions.transact({ at: CHANGED_AT, mutate: commitATicket }));
    expect(nextStore.reads.listTickets().unreadable).toEqual([]);
    await nextStore.transactions.transact({ at: LATER_AT, mutate: () => 'Example' });

    const listing = nextStore.reads.listTickets();
    expect(listing.tickets.map((ticket) => [ticket.frontmatter.status, ticket.frontmatter.contentHash, ticket.body])).toEqual([['committed', KEPT_HASH, KEPT_BODY]]);
    expect(listing.unreadable).toEqual([]);
  });

  test('a ticket file whose body was changed on disk reads with the kept body, listed restored, until the next write puts it back once', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    const { result: ticketId } = await store.transactions.transact({ at: CHANGED_AT, mutate: commitATicket });
    const storedText = readFileSync(ticketFilePathIn(workspace), 'utf8');
    appendFileSync(ticketFilePathIn(workspace), 'A line Alex Example added.\n');

    const listing = store.reads.listTickets();
    expect(listing.tickets.map((ticket) => ticket.body)).toEqual([KEPT_BODY]);
    expect(listing.contentRestored).toEqual([ticketId]);

    await store.transactions.transact({ at: LATER_AT, mutate: () => 'Example' });
    await store.transactions.transact({ at: LATER_AT, mutate: () => 'Example' });

    expect(readFileSync(ticketFilePathIn(workspace), 'utf8')).toBe(storedText);
    expect(store.reads.listTickets().contentRestored).toEqual([]);
    expect(contentRestoredCountOf(store)).toBe(1);
  });

  test('a missing kept content makes the ticket unreadable with committed-content-missing, located at the kept file', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    const { result: ticketId } = await store.transactions.transact({ at: CHANGED_AT, mutate: commitATicket });
    rmSync(keptContentPathIn(workspace));

    const listing = store.reads.listTickets();

    expect(listing.tickets).toEqual([]);
    expect(listing.unreadable.map(({ record, key, location }) => ({ record, key, location })))
      .toEqual([{ record: 'ticket', key: ticketId, location: keptContentPathIn(workspace) }]);
    expect(listing.unreadable[0]?.problem.code).toBe('committed-content-missing');
  });

  test('a kept content whose title and body do not hash to its name is unreadable the same way', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    await store.transactions.transact({ at: CHANGED_AT, mutate: commitATicket });
    writeFileSync(keptContentPathIn(workspace), `${JSON.stringify({ title: KEPT_TITLE, body: 'Changed in the kept file.\n' })}\n`);

    expect(store.reads.listTickets().unreadable[0]?.problem.code).toBe('committed-content-missing');
  });

  test('clearing every ticket removes the kept content too', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    await store.transactions.transact({ at: CHANGED_AT, mutate: commitATicket });

    await store.transactions.transact({
      at:     LATER_AT,
      mutate: (transaction) => {
        transaction.board.clearTracker({ ticketsSurvive: false }, transaction.at);
        transaction.deleteAllTicketFilesAfterwards(() => {});
      },
    });

    expect(readdirSync(localStoreLayoutOf(workspace).committedContentFolder)).toEqual([]);
  });
});

describe('the lock', () => {
  test('a lock record left by a holder judged gone is taken over by the next apply, which waits for no retry', async () => {
    const { workspace } = await initialisedStoreIn('');
    const lockFolder = localStoreLayoutOf(workspace).storeLockFolder;
    const leftHolder = { processId: 4242, startStamp: '1763370000', bootIdentity: 'example-boot' };
    writeFileSync(join(lockFolder, 'generation-99'), JSON.stringify({
      version: GENERATION_RECORD_FORMAT_VERSION, holder: leftHolder, acquiredAt: STARTED_AT, state: 'held'
    }));
    const judged: LockHolder[] = [];
    const store = createLocalFilesBoardStore(storeOptionsIn('', undefined, lockTakerJudgingHoldersBy((holder) => {
      judged.push(holder);
      return true;
    })));

    const { sleepMilliseconds } = await lockRetryWaitsDuring(() => applyCommand(store, { kind: 'concurrency-set', limit: 6 }));

    expect(judged).toEqual([leftHolder]);
    expect(sleepMilliseconds).toEqual([]);
    expect(store.reads.requireProgress().concurrencyLimit).toBe(6);
  });
});

describe('the records the read side reports', () => {
  test('an unreadable ticket file is listed with its key and its location, and is not on the Board', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    const brokenTicketPath     = join(localStoreLayoutOf(workspace).ticketRecordsFolder, '012-broken-by-hand.md');
    writeFileSync(brokenTicketPath, 'Not a ticket.\n');

    const listing = store.reads.listTickets();

    expect(listing.tickets).toEqual([]);
    expect(listing.unreadable.map(({ record, key, location }) => ({ record, key, location }))).toEqual([{ record: 'ticket', key: '012', location: brokenTicketPath }]);
    expect(store.reads.requireBoard().listing.tickets).toEqual([]);
    const written = await store.transactions.transact({ at: CHANGED_AT, mutate: (transaction) => transaction.board.tickets().length });
    expect(written.result).toBe(0);
    expect(written.unreadableRecords.tickets.map(({ key }) => key)).toEqual(['012']);
  });

  test('the revision is unchanged by a ticket body changed on disk, and changed by a changed progress file', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    await applyCommand(store, {
      kind: 'ticket-add', title: 'Example basket page', type: 'ticket', dependsOn: [], epics: [], network: [], introducedBy: null, foundInReview: null, bodyText: null
    });
    const [ticketFileName] = readdirSync(localStoreLayoutOf(workspace).ticketRecordsFolder);
    const revisionBefore   = store.reads.revision();

    appendFileSync(join(localStoreLayoutOf(workspace).ticketRecordsFolder, ticketFileName ?? ''), 'A line Alex Example added.\n');
    expect(store.reads.revision()).toBe(revisionBefore);

    writeFileSync(localStoreLayoutOf(workspace).progressRecordPath, `${readFileSync(localStoreLayoutOf(workspace).progressRecordPath, 'utf8')}\n`);
    expect(store.reads.revision()).not.toBe(revisionBefore);
  });

  test('a read answers at once while another store holds the lock', async () => {
    const { store } = await initialisedStoreIn('');
    const reader    = createLocalFilesBoardStore(storeOptionsIn(''));

    const written = await store.transactions.transact({
      at:     CHANGED_AT,
      mutate: async (transaction) => {
        await Promise.resolve();
        transaction.board.setConcurrencyLimit(4, transaction.at);
        return {
          boardVerdict:    reader.reads.readBoard().verdict,
          limit:           reader.reads.requireProgress().concurrencyLimit,
          pipeline:        reader.reads.readPipeline().verdict,
          unfinishedWrite: reader.reads.readUnfinishedWrite(),
          revision:        reader.reads.revision(),
        };
      },
    });

    expect(written.result).toEqual({
      boardVerdict: 'readable', limit: 2, pipeline: 'absent', unfinishedWrite: { verdict: 'none' }, revision: written.result.revision
    });
    expect(reader.reads.requireProgress().concurrencyLimit).toBe(4);
  });

  test('locationOf answers paths inside the data folder', async () => {
    const { store, workspace } = await initialisedStoreIn('');

    const locations = EVERY_RECORD_REFERENCE.map((reference) => store.reads.locationOf(reference));

    expect(locations.filter((location) => !location.startsWith(`${workspace.trackerDirectory}${sep}`))).toEqual([]);
    expect(new Set(locations).size).toBe(EVERY_RECORD_REFERENCE.length);
  });

  test('initialise on an existing tracker answers already-exists and writes nothing', async () => {
    const { store, workspace } = await initialisedStoreIn('');
    await applyCommand(store, { kind: 'concurrency-set', limit: 3 });
    const filesBefore = storedFileContentsOf(workspace);

    const creation = await store.initialise({ project: 'Example Agency', startedAt: LATER_AT, trackerId: 'another-example-tracker' });

    expect(creation).toEqual({ verdict: 'already-exists' });
    expect(storedFileContentsOf(workspace)).toEqual(filesBefore);
  });
});

describe('the one pipeline reading', () => {
  test('a tracker in a folder reads a stored pipeline with entities as malformed in every read, and refuses to store one, writing nothing', async () => {
    const atTheRoot  = await initialisedStoreIn('');
    const inAFolder  = await initialisedStoreIn('apps/web');
    await atTheRoot.store.transactions.transact({ at: CHANGED_AT, mutate: storeNoGatesWithEntities });
    const filesBefore = storedFileContentsOf(inAFolder.workspace);

    const refused = await thrownFailureOf(() => inAFolder.store.transactions.transact({ at: CHANGED_AT, mutate: storeNoGatesWithEntities }));

    const pipelineLocation = inAFolder.store.reads.locationOf({ record: 'pipeline' });
    expect(refusalDetailOf(refused)).toEqual({ status: 'refused', detail: { kind: 'entities-in-a-folder', filePath: pipelineLocation, projectPrefix: 'apps/web' } });
    expect(storedFileContentsOf(inAFolder.workspace)).toEqual(filesBefore);

    const pipelineWithEntities = atTheRoot.store.reads.storedPipelineText() ?? '';
    writeFileSync(pipelineLocation, pipelineWithEntities);
    const pipelineReading = inAFolder.store.reads.readPipeline();
    const boardReading    = inAFolder.store.reads.readBoard();

    expect(pipelineReading).toMatchObject({ verdict: 'malformed', unsupportedEntities: { kind: 'entities-in-a-folder', projectPrefix: 'apps/web' } });
    expect(boardReading.verdict === 'readable' ? boardReading.contents.pipelineReading : boardReading).toEqual(pipelineReading);
    const openedOn = await inAFolder.store.transactions.transact({ at: LATER_AT, mutate: (transaction) => transaction.unreadablePipeline });
    expect(openedOn.result).toEqual(pipelineReading.verdict === 'malformed' ? pipelineReading : null);
    expect(inAFolder.store.reads.storedPipelineText()).toBe(pipelineWithEntities);
    expect(atTheRoot.store.reads.readPipeline().verdict).toBe('readable');
  });
});
