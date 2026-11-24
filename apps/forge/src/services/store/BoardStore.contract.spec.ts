/**
 * What any adapter of the store port must do, through the port alone. What matters: a write is whole or absent (a refusal or a throw
 * leaves nothing), writes are exclusive and queue behind one another across an `await`, a command waits for a transaction rather than
 * slipping into it, every later read and every other client sees a write, the revision moves with the progress record and the log
 * only, and a committed ticket whose stored text is changed behind the store reads with the content its hash names until the next write
 * restores it. A ticket's documents a command changed are read back with every version's text. A second adapter joins `STORE_SUBJECTS`,
 * with the step that changes a ticket's stored text behind it.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                     from 'node:path';

import { expect } from 'bun:test';

import { BoardRefusal }                                       from '../../lib/tracker-model/BoardRefusal.ts';
import type { ControlCommand }                                from '../../shared/@types/ControlCommand.ts';
import { refusalIsOperationRefusal }                          from '../../shared/OperationRefusal.ts';
import { ECHOED_CONTROL_CONTEXT }                             from '../../testing/EchoedControlContext.ts';
import { parkingLockRetries }                                 from '../../testing/LockRetryWaits.ts';
import { LIVE_HOLDERS_LOCK_TAKER }                            from '../../testing/LockTakers.ts';
import { type PortClause, type PortSubject, runPortContract } from '../../testing/PortContract.ts';
import { createScratchDirectory }                             from '../../testing/ScratchWorkspace.ts';
import { waitUntil }                                          from '../../testing/WaitUntil.ts';
import type { BoardTransaction }                              from '../tracker/BoardTransaction.ts';
import { localStoreLayoutOf }                                 from '../tracker/LocalStoreLayout.ts';
import { workspacePathsFor }                                  from '../tracker/Workspace.ts';
import type { BoardStore }                                    from './BoardStore.ts';
import { createLocalFilesBoardStore }                         from './LocalFilesBoardStore.ts';

interface BoardStoreUnderContract {
  store:                          BoardStore;
  anotherClientOfTheSameBoard:    () => BoardStore;
  /** Changes a ticket's stored title and body the way a store that lets its text change would, with no write of the store's. */
  changeTicketTextBehindTheStore: (ticketId: string, title: string, body: string) => void;
}

type BoardStoreSubject = () => Promise<BoardStoreUnderContract>;

const STARTED_AT = '2026-11-20T09:00:00+01:00';
const CHANGED_AT = '2026-11-20T10:00:00+01:00';
const LATER_AT   = '2026-11-20T11:00:00+01:00';

const fixedNow = (): Date => new Date('2026-11-20T08:00:00Z');

const FRONTMATTER_CLOSING_FENCE = '\n---\n';

/** A hand edit of the ticket's file: its `title` line and everything after the frontmatter. */
function rewriteTicketFile(ticketRecordsFolder: string, ticketId: string, title: string, body: string): void {
  const fileName = readdirSync(ticketRecordsFolder).find((name) => name.startsWith(`${ticketId}-`));
  if (fileName === undefined) throw new Error(`no file holds ticket #${ticketId}`);
  const filePath       = join(ticketRecordsFolder, fileName);
  const storedText     = readFileSync(filePath, 'utf8');
  const frontmatterEnd = storedText.indexOf(FRONTMATTER_CLOSING_FENCE) + FRONTMATTER_CLOSING_FENCE.length;
  const frontmatter    = storedText.slice(0, frontmatterEnd).replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`);
  writeFileSync(filePath, `${frontmatter}${body}`);
}

async function localFilesBoardStoreOnAScratchTracker(): Promise<BoardStoreUnderContract> {
  const options = { workspace: workspacePathsFor(createScratchDirectory('board-store')), now: fixedNow, lockTaker: LIVE_HOLDERS_LOCK_TAKER };
  const store   = createLocalFilesBoardStore(options);
  await store.initialise({ project: 'Example Agency', startedAt: STARTED_AT, trackerId: 'example-tracker' });
  const { ticketRecordsFolder } = localStoreLayoutOf(options.workspace);
  return {
    store,
    anotherClientOfTheSameBoard:    () => createLocalFilesBoardStore(options),
    changeTicketTextBehindTheStore: (ticketId, title, body) => { rewriteTicketFile(ticketRecordsFolder, ticketId, title, body); },
  };
}

const STORE_SUBJECTS: readonly PortSubject<BoardStoreSubject>[] = [
  { name: 'LocalFilesBoardStore on a scratch tracker', build: () => localFilesBoardStoreOnAScratchTracker },
];

function applyCommand<Command extends ControlCommand>(store: BoardStore, command: Command, at = CHANGED_AT) {
  return store.commands.apply({ command, at, context: ECHOED_CONTROL_CONTEXT });
}

async function thrownBy(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error('the action did not throw');
}

function refusalOf(thrown: unknown): unknown {
  return refusalIsOperationRefusal(thrown) ? { status: thrown.status, kind: thrown.detail?.kind } : thrown;
}

async function openedDraftIdOf(store: BoardStore): Promise<string> {
  const opened = await store.commands.apply({
    command: {
      kind: 'draft-open', title: 'Example intake', request: 'Alex Example asks for a basket.\n', owner: 'Alex Example'
    },
    at:      CHANGED_AT,
    context: ECHOED_CONTROL_CONTEXT,
  });
  return opened.result.draft.id;
}

async function committedTicketIdOf(store: BoardStore, title: string, body: string): Promise<string> {
  const committed = await store.transactions.transact({
    at:     CHANGED_AT,
    mutate: (transaction) => {
      const ticket = transaction.records.newTicket({
        title, type: 'ticket', bodyFor: () => body, at: transaction.at
      });
      transaction.board.fileTicket(ticket, transaction.at);
      transaction.board.readyDraftTickets([ticket.frontmatter.id], () => [], transaction.at);
      return ticket.frontmatter.id;
    },
  });
  return committed.result;
}

function restoredRecordCountOf(store: BoardStore): number {
  const logReading = store.reads.readLogRecords();
  return logReading.verdict === 'readable' ? logReading.records.filter((record) => record.kind === 'ticket-content-restored').length : -1;
}

const STORE_CLAUSES: readonly PortClause<BoardStoreSubject>[] = [
  {
    claim: 'a committed ticket whose stored text is changed behind the store reads with the content its hash names, and the next write restores it',
    check: async (subject) => {
      const { store, changeTicketTextBehindTheStore } = await subject();
      const ticketId = await committedTicketIdOf(store, 'Example basket page', 'The basket shows its items.\n');

      changeTicketTextBehindTheStore(ticketId, 'Example changed title', 'Changed behind the store.\n');
      const listing = store.reads.listTickets();

      expect(listing.tickets.map((ticket) => [ticket.frontmatter.title, ticket.body])).toEqual([['Example basket page', 'The basket shows its items.\n']]);
      expect(listing.contentRestored).toEqual([ticketId]);
      expect(store.reads.requireBoard().listing.contentRestored).toEqual([ticketId]);

      await store.transactions.transact({ at: LATER_AT, mutate: (transaction) => { transaction.board.setConcurrencyLimit(5, transaction.at); } });
      await store.transactions.transact({ at: LATER_AT, mutate: (transaction) => { transaction.board.setConcurrencyLimit(6, transaction.at); } });

      expect(store.reads.listTickets().contentRestored).toEqual([]);
      expect(store.reads.listTickets().tickets.map((ticket) => ticket.body)).toEqual(['The basket shows its items.\n']);
      expect(restoredRecordCountOf(store)).toBe(1);
    },
  },
  {
    claim: 'a new board reads as readable, with no ticket, epic or draft, no unreadable record and no unfinished write',
    check: async (subject) => {
      const { store } = await subject();
      const reading   = store.reads.readBoard();

      expect(reading.verdict).toBe('readable');
      if (reading.verdict !== 'readable') return;
      expect(reading.unfinishedWrite).toEqual({ verdict: 'none' });
      expect(reading.contents.listing).toEqual({ tickets: [], unreadable: [], contentRestored: [] });
      expect(reading.contents.epicListing).toEqual({ epics: [], unreadable: [] });
      expect(reading.contents.draftListing).toEqual({ drafts: [], unreadable: [] });
      expect(store.reads.readUnfinishedWrite()).toEqual({ verdict: 'none' });
    },
  },
  {
    claim: 'a ticket\'s documents a command changed are in every later read, each version with its text, and a new board holds none',
    check: async (subject) => {
      const { store, anotherClientOfTheSameBoard } = await subject();
      expect(store.reads.requireBoard().ticketDocumentListing).toEqual({ records: [], unreadable: [] });
      const opened = await store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => {
          const ticket = transaction.records.newTicket({
            title: 'Example basket page', type: 'ticket', bodyFor: () => '## Report\n\nEmpty.\n', at: transaction.at
          });
          transaction.board.fileTicket(ticket, transaction.at);
          transaction.board.ticketDocuments().open(ticket.frontmatter.id, transaction.at);
          return ticket.frontmatter.id;
        },
      });
      const specText = '## Acceptance\n\nA1. The basket shows.\n';

      const saved = await applyCommand(store, {
        kind: 'ticket-document-save', ticketReference: opened.result, document: 'spec', baseVersion: null, markdown: specText
      });

      expect(saved.outcome).toBe('done');
      const [loadedRecord] = anotherClientOfTheSameBoard().reads.requireBoard().ticketDocumentListing.records;
      expect(loadedRecord?.record.documents[0]?.versions.map((version) => version.number)).toEqual([1]);
      expect(Object.values(loadedRecord?.textOfContentHash ?? {})).toEqual([specText]);
    },
  },
  {
    claim: 'a clear of every ticket takes their documents with them, so a ticket that takes a cleared id opens documents of its own',
    check: async (subject) => {
      const { store, anotherClientOfTheSameBoard } = await subject();
      const fileTicketWithDocuments = (): Promise<{ result: string }> => store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => {
          const ticket = transaction.records.newTicket({
            title: 'Example basket page', type: 'ticket', bodyFor: () => '## Report\n\nEmpty.\n', at: transaction.at
          });
          transaction.board.fileTicket(ticket, transaction.at);
          transaction.board.ticketDocuments().open(ticket.frontmatter.id, transaction.at);
          return ticket.frontmatter.id;
        },
      });
      const first = await fileTicketWithDocuments();
      await applyCommand(store, {
        kind: 'ticket-document-save', ticketReference: first.result, document: 'spec', baseVersion: null, markdown: '## Acceptance\n\nA1. Shown.\n'
      });

      expect((await applyCommand(store, { kind: 'tracker-clear', scope: 'everything' })).outcome).toBe('done');
      expect(anotherClientOfTheSameBoard().reads.requireBoard().ticketDocumentListing).toEqual({ records: [], unreadable: [] });

      const second = await fileTicketWithDocuments();
      expect(second.result).toBe(first.result);
      const listing = anotherClientOfTheSameBoard().reads.requireBoard().ticketDocumentListing;
      expect(listing.unreadable).toEqual([]);
      expect(listing.records.map((loadedRecord) => loadedRecord.record.ticketId)).toEqual([first.result]);
    },
  },
  {
    claim: 'a document text that starts with a byte order mark is read back byte for byte, its record readable',
    check: async (subject) => {
      const { store, anotherClientOfTheSameBoard } = await subject();
      const opened = await store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => {
          const ticket = transaction.records.newTicket({
            title: 'Example basket page', type: 'ticket', bodyFor: () => '## Report\n\nEmpty.\n', at: transaction.at
          });
          transaction.board.fileTicket(ticket, transaction.at);
          transaction.board.ticketDocuments().open(ticket.frontmatter.id, transaction.at);
          return ticket.frontmatter.id;
        },
      });
      const specText = '\uFEFF## Acceptance\n\nA1. The basket shows.\n';

      await applyCommand(store, {
        kind: 'ticket-document-save', ticketReference: opened.result, document: 'spec', baseVersion: null, markdown: specText
      });

      const listing = anotherClientOfTheSameBoard().reads.requireBoard().ticketDocumentListing;
      expect(listing.unreadable).toEqual([]);
      expect(Object.values(listing.records[0]?.textOfContentHash ?? {})).toEqual([specText]);
    },
  },
  {
    claim: 'a command\'s change is in the board it answers and in every later read',
    check: async (subject) => {
      const { store } = await subject();

      const written = await applyCommand(store, { kind: 'concurrency-set', limit: 2 });

      expect(written.outcome).toBe('done');
      expect(written.board.concurrency().limit).toBe(2);
      expect(store.reads.requireProgress().concurrencyLimit).toBe(2);
      expect(store.reads.requireBoard().progress.concurrencyLimit).toBe(2);
    },
  },
  {
    claim: 'a command that changes nothing answers nothing-to-do and leaves the revision as it was',
    check: async (subject) => {
      const { store }       = await subject();
      const draftId         = await openedDraftIdOf(store);
      const revisionBefore  = store.reads.revision();

      const claimed = await applyCommand(store, {
        kind: 'draft-claim', draftId, owner: 'Alex Example', forces: false
      });

      expect(claimed.outcome).toBe('nothing-to-do');
      expect(store.reads.revision()).toBe(revisionBefore);
    },
  },
  {
    claim: 'a command the Board refuses changes nothing and leaves as a refused board-refusal',
    check: async (subject) => {
      const { store }      = await subject();
      const draftId        = await openedDraftIdOf(store);
      const revisionBefore = store.reads.revision();

      const thrown = await thrownBy(() => applyCommand(store, {
        kind: 'draft-claim', draftId, owner: 'Example Agency', forces: false
      }));

      expect(refusalOf(thrown)).toEqual({ status: 'refused', kind: 'board-refusal' });
      expect(store.reads.revision()).toBe(revisionBefore);
      expect(store.reads.requireBoard().draftListing.drafts.map((draft) => draft.claim?.owner)).toEqual(['Alex Example']);
    },
  },
  {
    claim: 'a ticket\'s content changes only through ticket-edit, and the edit is in every later read',
    check: async (subject) => {
      const { store } = await subject();
      const added     = await store.commands.apply({
        command: {
          kind:          'ticket-add',
          title:         'Example basket page',
          type:          'ticket',
          dependsOn:     [],
          epics:         [],
          network:       [],
          introducedBy:  null,
          foundInReview: null,
          bodyText:      'The basket shows its items.\n',
        },
        at:      CHANGED_AT,
        context: ECHOED_CONTROL_CONTEXT,
      });
      const ticketId = added.result.ticket.frontmatter.id;

      await applyCommand(store, {
        kind: 'ticket-edit', ticketReference: ticketId, bodyText: 'The basket shows its total.\n', appendsBody: true
      }, LATER_AT);

      const storedBody = store.reads.listTickets().tickets.map((ticket) => ticket.body).join('');
      expect(storedBody).toContain('The basket shows its items.\n');
      expect(storedBody).toContain('The basket shows its total.\n');
      expect(store.reads.requireBoard().listing.tickets.map((ticket) => ticket.body)).toEqual([storedBody]);
    },
  },
  {
    claim: 'a transaction\'s changes are in the board it answers and in every later read, and its result is answered',
    check: async (subject) => {
      const { store } = await subject();

      const written = await store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => {
          transaction.board.setConcurrencyLimit(5, transaction.at);
          return 'Example result';
        },
      });

      expect(written.result).toBe('Example result');
      expect(written.board.concurrency().limit).toBe(5);
      expect(store.reads.requireProgress().concurrencyLimit).toBe(5);
    },
  },
  {
    claim: 'a transaction that throws changes nothing: a Board refusal leaves as a refused board-refusal, any other throw as itself',
    check: async (subject) => {
      const { store }      = await subject();
      const revisionBefore = store.reads.revision();
      const limitBefore    = store.reads.requireProgress().concurrencyLimit;
      const otherFailure   = new Error('Example failure');

      const refused = await thrownBy(() => store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => {
          transaction.board.setConcurrencyLimit(6, transaction.at);
          throw new BoardRefusal({ reason: 'draft-claimed-by-another-owner', draftId: 'D1', owner: 'Alex Example' });
        },
      }));
      const failed = await thrownBy(() => store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => {
          transaction.board.setConcurrencyLimit(7, transaction.at);
          throw otherFailure;
        },
      }));

      expect(refusalOf(refused)).toEqual({ status: 'refused', kind: 'board-refusal' });
      expect(failed).toBe(otherFailure);
      expect(store.reads.revision()).toBe(revisionBefore);
      expect(store.reads.requireProgress().concurrencyLimit).toBe(limitBefore);
    },
  },
  {
    claim: 'two transactions started together run one after the other',
    check: async (subject) => {
      const { store, anotherClientOfTheSameBoard } = await subject();
      await applyCommand(store, { kind: 'concurrency-set', limit: 3 });
      const raiseByOne = (client: BoardStore) => client.transactions.transact({
        at:     CHANGED_AT,
        mutate: async (transaction) => {
          const limitRead = transaction.board.concurrency().limit;
          await Promise.resolve();
          transaction.board.setConcurrencyLimit(limitRead + 1, transaction.at);
        },
      });

      const { raises } = await parkingLockRetries(async (parkedRetries) => {
        const startedTogether = [raiseByOne(store), raiseByOne(anotherClientOfTheSameBoard())];
        await waitUntil(() => parkedRetries() === 1, 'one transaction queueing behind the other');
        await Promise.race(startedTogether);
        return { raises: startedTogether };
      });
      await Promise.all(raises);

      expect(store.reads.requireProgress().concurrencyLimit).toBe(5);
    },
  },
  {
    claim: 'a command waits for a transaction that holds the board, across an await inside it',
    check: async (subject) => {
      const { store, anotherClientOfTheSameBoard } = await subject();
      await applyCommand(store, { kind: 'concurrency-set', limit: 3 });

      const { waitingCommand, limitsSeenInside, limitAfterTheTransaction } = await parkingLockRetries(async (parkedRetries) => {
        const held = await store.transactions.transact({
          at:     CHANGED_AT,
          mutate: async (transaction) => {
            const command = applyCommand(anotherClientOfTheSameBoard(), { kind: 'concurrency-set', limit: 9 });
            await waitUntil(() => parkedRetries() === 1, 'the command queueing behind the transaction');
            const limitsSeen = [transaction.board.concurrency().limit, store.reads.requireProgress().concurrencyLimit];
            transaction.board.setConcurrencyLimit(4, transaction.at);
            return { command, limitsSeen };
          },
        });
        return { waitingCommand: held.result.command, limitsSeenInside: held.result.limitsSeen, limitAfterTheTransaction: store.reads.requireProgress().concurrencyLimit };
      });
      await waitingCommand;

      expect(limitsSeenInside).toEqual([3, 3]);
      expect(limitAfterTheTransaction).toBe(4);
      expect(store.reads.requireProgress().concurrencyLimit).toBe(9);
    },
  },
  {
    claim: 'the revision changes with a write that changes the progress record or the log, and a read changes nothing',
    check: async (subject) => {
      const { store }      = await subject();
      const revisionBefore = store.reads.revision();

      store.reads.readBoard();
      store.reads.readLogRecords();
      store.reads.listTickets();
      expect(store.reads.revision()).toBe(revisionBefore);

      await applyCommand(store, { kind: 'concurrency-set', limit: 3 });
      expect(store.reads.revision()).not.toBe(revisionBefore);
    },
  },
  {
    claim: 'a second client of the same board sees every write of the first',
    check: async (subject) => {
      const { store, anotherClientOfTheSameBoard } = await subject();
      const secondClient = anotherClientOfTheSameBoard();

      await applyCommand(store, { kind: 'concurrency-set', limit: 3 });
      const draftId = await openedDraftIdOf(store);

      expect(secondClient.reads.requireProgress().concurrencyLimit).toBe(3);
      expect(secondClient.reads.requireBoard().draftListing.drafts.map((draft) => draft.id)).toEqual([draftId]);
      expect(secondClient.reads.revision()).toBe(store.reads.revision());
    },
  },
  {
    claim: 'records.newTicket inside one transaction gives rising ids, and a later transaction continues past them',
    check: async (subject) => {
      const { store } = await subject();
      const fileNewTicket = (transaction: BoardTransaction, title: string): string => {
        const ticket = transaction.records.newTicket({
          title, type: 'ticket', bodyFor: (ticketId) => `# ${ticketId} — ${title}\n`, at: transaction.at
        });
        transaction.board.fileTicket(ticket, transaction.at);
        return ticket.frontmatter.id;
      };

      const firstIds = await store.transactions.transact({
        at:     CHANGED_AT,
        mutate: (transaction) => [fileNewTicket(transaction, 'Example first'), fileNewTicket(transaction, 'Example second')],
      });
      const laterIds = await store.transactions.transact({ at: LATER_AT, mutate: (transaction) => [fileNewTicket(transaction, 'Example third')] });

      const allIds = [...firstIds.result, ...laterIds.result].map(Number);
      expect(allIds).toEqual([...allIds].sort((a, b) => a - b));
      expect(new Set(allIds).size).toBe(allIds.length);
      expect(store.reads.listTickets().tickets.map((ticket) => ticket.frontmatter.id)).toEqual([...firstIds.result, ...laterIds.result]);
    },
  },
  {
    claim: 'a transaction\'s at is the stamp it was given, and the records it logs carry it',
    check: async (subject) => {
      const { store } = await subject();

      const written = await store.transactions.transact({
        at:     LATER_AT,
        mutate: (transaction) => {
          transaction.board.setConcurrencyLimit(8, transaction.at);
          return transaction.at;
        },
      });
      const logReading = store.reads.readLogRecords();

      expect(written.result).toBe(LATER_AT);
      expect(logReading.verdict === 'readable' ? logReading.records.map((record) => record.at) : logReading).toEqual([LATER_AT]);
    },
  },
];

runPortContract('BoardStore', STORE_SUBJECTS, STORE_CLAUSES);
