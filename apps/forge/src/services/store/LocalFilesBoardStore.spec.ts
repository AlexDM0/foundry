/**
 * What only the local files adapter promises, beyond the contract. What matters: a write cut short is finished by the next writer of
 * another store and reads as pending until then; a malformed hold journal names its file and stops every write; an unreadable ticket
 * file is reported with its key and its file and stays off the Board; the revision covers the progress record, the log and the gate
 * profile runs and no ticket; reads take no lock; and the pipeline is judged once, so a tracker in a folder reads a stored pipeline with
 * entities as malformed in every read, the reading a write opens the Board on. The `.git` folder is planted: finding the prefix runs no git.
 */
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
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

import type { PipelineEntity }                                          from '../../lib/tracker-model/@types/Pipeline.ts';
import type { ControlCommand }                                          from '../../shared/@types/ControlCommand.ts';
import { refusalIsOperationRefusal }                                    from '../../shared/OperationRefusal.ts';
import { ECHOED_CONTROL_CONTEXT }                                       from '../../testing/EchoedControlContext.ts';
import { createScratchDirectory, removeScratchDirectory }               from '../../testing/ScratchWorkspace.ts';
import { storedFileContentsOf }                                         from '../../testing/TrackerFileFixtures.ts';
import type { RecordReference }                                         from '../tracker/@types/BoardRecords.ts';
import type { BoardTransaction }                                        from '../tracker/BoardTransaction.ts';
import { NO_LOCK_HOLDER_READS_AS_GONE }                                 from '../tracker/GenerationLock.ts';
import { localStoreLayoutOf }                                           from '../tracker/LocalStoreLayout.ts';
import { workspacePathsFor, type Workspace }                            from '../tracker/Workspace.ts';
import type { BoardStore }                                              from './BoardStore.ts';
import { createLocalFilesBoardStore, type LocalFilesBoardStoreOptions } from './LocalFilesBoardStore.ts';

const STARTED_AT = '2026-11-20T09:00:00+01:00';
const CHANGED_AT = '2026-11-20T10:00:00+01:00';
const LATER_AT   = '2026-11-20T11:00:00+01:00';

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

function storeOptionsIn(projectFolder: string, afterFileWritten?: (location: string) => void): LocalFilesBoardStoreOptions {
  return {
    workspace:        workspacePathsFor(join(repositoryRoot, projectFolder)),
    now:              fixedNow,
    lockHolderIsGone: NO_LOCK_HOLDER_READS_AS_GONE,
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
    const expectedRefusal = { status: 'unrepaired', detail: { kind: 'malformed-hold-journal', journalFilePath: journalPath, reason: 'its "files" is not a list' } };

    expect(store.reads.readUnfinishedWrite()).toEqual({ verdict: 'malformed', location: journalPath, reason: 'its "files" is not a list' });
    expect(refusalDetailOf(await thrownFailureOf(() => applyCommand(store, { kind: 'concurrency-set', limit: 6 })))).toEqual(expectedRefusal);
    expect(refusalDetailOf(await thrownFailureOf(() => store.transactions.transact({ at: CHANGED_AT, mutate: () => 'Example' })))).toEqual(expectedRefusal);
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
