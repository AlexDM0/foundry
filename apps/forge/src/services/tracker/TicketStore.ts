/**
 * The tickets directory as a store. Nothing here throws because a ticket file is bad: a malformed
 * file is a listing entry and a `null`, so one broken file cannot take down `status` or `render`.
 */

import { basename, join }                                                from 'node:path';
import { ProgressFileIngestion }                                         from '../../adapters/progress/ProgressFileIngestion.ts';
import { CommittedContentFile }                                          from '../../adapters/tickets/CommittedContentFile.ts';
import { TicketFileIngestion }                                           from '../../adapters/tickets/TicketFileIngestion.ts';
import type { LogRecord }                                                from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Ticket, TicketFrontmatter }                                from '../../domain/tracker-model/@types/Ticket.ts';
import { FIRST_TICKET_NUMBER }                                           from '../../domain/tracker-model/constants/TicketFields.ts';
import { TicketIdUtil }                                                  from '../../domain/tracker-model/utils/TicketIdUtil.ts';
import type { UnreadableTicketProblem }                                  from '../../shared/@types/UnreadableTicketProblem.ts';
import type { CreateTicketInput, TicketListing, UnreadableTicketRecord } from './@types/BoardRecords.ts';
import { localStoreLayoutOf }                                            from './LocalStoreLayout.ts';
import { slugFromTitle }                                                 from './SlugFromTitle.ts';
import { storeFolderFileNamesIn }                                        from './StoreFolderListing.ts';
import type { Workspace }                                                from './Workspace.ts';

/**
 * What a hold has spent beyond the disk: the Board's tickets, a filed one not yet written among them, and every ticket its log names as
 * filed, a ticket deleted by hand among them. A Board satisfies it.
 */
export interface TicketsSpentInHold {
  tickets():         readonly Readonly<Pick<Ticket, 'frontmatter'>>[];
  logRecordsSoFar(): readonly LogRecord[];
}

/** The port's listing with each listed ticket's file by its id: the local adapter's alone, never answered past the store. */
export interface LocalTicketListing extends TicketListing {
  ticketLocations: ReadonlyMap<string, string>;
}

/** A ticket filed in a hold and the file this hold stores it in. */
export interface CreatedTicket {
  ticket:   Ticket;
  location: string;
}

const TICKET_FILE_EXTENSION      = '.md';
const IDENTIFIER_PREFIX_MATCH    = /^(\d+)-/;
const FILE_NAME_IDENTIFIER_MATCH = /^(\d+)(?:-|\.md$)/;

/**
 * A ticket is known by its frontmatter `id`. A file whose name carries another number, and every file holding an id another
 * also holds, is listed as unreadable with its problem, since which of them is the ticket cannot be judged. A ticket holding a content
 * hash reads with the title and body kept under it. Ordered by id numerically.
 */
export function listTickets(workspace: Workspace): LocalTicketListing {
  const parsedFiles: ParsedTicketFile[] = [];
  const unreadable: UnreadableTicketRecord[] = [];

  for (const fileName of ticketFileNamesIn(workspace)) {
    const filePath = join(localStoreLayoutOf(workspace).ticketRecordsFolder, fileName);
    const reading  = new TicketFileIngestion(filePath).read();

    if (reading.verdict === 'parsed') {
      parsedFiles.push({
        fileName, location: filePath, ticket: reading.ticket, identifierLine: reading.identifierLine
      });
    } else {
      unreadable.push({
        record: 'ticket', key: identifierInFileName(fileName), location: filePath, problem: reading.problem, line: reading.line
      });
    }
  }

  const namedConsistently: ParsedTicketFile[] = [];
  for (const parsedFile of parsedFiles) {
    const identifierInName = identifierInFileName(parsedFile.fileName);
    const { id }           = parsedFile.ticket.frontmatter;

    if (identifierInName !== null && identifierInName !== id) {
      unreadable.push(unreadableEntryOf(parsedFile, {
        code: 'file-name-names-another-id', field: 'id', idInFileName: identifierInName, storedId: id
      }));
    } else {
      namedConsistently.push(parsedFile);
    }
  }

  const listedFiles: ParsedTicketFile[] = [];
  for (const parsedFile of namedConsistently) {
    const otherHolders = namedConsistently.filter((other) => other !== parsedFile && other.ticket.frontmatter.id === parsedFile.ticket.frontmatter.id);

    if (otherHolders.length > 0) {
      const otherFileNames = otherHolders.map((other) => other.fileName);
      unreadable.push(unreadableEntryOf(parsedFile, {
        code: 'id-held-twice', field: 'id', storedId: parsedFile.ticket.frontmatter.id, otherFileNames
      }));
    } else {
      listedFiles.push(parsedFile);
    }
  }

  const keptContentReading = withKeptContent(workspace, listedFiles);
  const { readableFiles } = keptContentReading;
  unreadable.push(...keptContentReading.unreadable);
  readableFiles.sort((a, b) => Number(a.ticket.frontmatter.id) - Number(b.ticket.frontmatter.id));
  unreadable.sort((a, b) => (a.location < b.location ? -1 : Number(a.location > b.location)));
  return {
    tickets:         readableFiles.map((readableFile) => readableFile.ticket),
    unreadable,
    contentRestored: keptContentReading.contentRestored.sort((a, b) => Number(a) - Number(b)),
    ticketLocations: new Map(readableFiles.map((readableFile) => [readableFile.ticket.frontmatter.id, readableFile.location])),
  };
}

/** The port's listing alone, for an answer that leaves the store. */
export function ticketListingOf(listing: LocalTicketListing): TicketListing {
  return { tickets: listing.tickets, unreadable: listing.unreadable, contentRestored: listing.contentRestored };
}

/** Where the local store keeps the content a hash names: one file per hash, shared by every ticket that ever held that content. */
export function committedContentLocationOf(workspace: Workspace, contentHash: string): string {
  return join(localStoreLayoutOf(workspace).committedContentFolder, CommittedContentFile.fileNameOf(contentHash));
}

/** Every kept content `clear --all` removes with the tickets. */
export function everyCommittedContentFilePathIn(workspace: Workspace): string[] {
  const { committedContentFolder } = localStoreLayoutOf(workspace);
  return storeFolderFileNamesIn(committedContentFolder, CommittedContentFile.KEPT_CONTENT_FILE_EXTENSION).map((fileName) => join(committedContentFolder, fileName));
}

interface KeptContentReading {
  readableFiles:   ParsedTicketFile[];
  unreadable:      UnreadableTicketRecord[];
  contentRestored: string[];
}

/**
 * A ticket whose stored title or body differs from the content its hash keeps takes the kept content and is listed as restored; one whose
 * kept content cannot be read is unreadable, located at the kept file, since that is what a repair goes by.
 */
function withKeptContent(workspace: Workspace, listedFiles: readonly ParsedTicketFile[]): KeptContentReading {
  const reading: KeptContentReading = { readableFiles: [], unreadable: [], contentRestored: [] };
  for (const listedFile of listedFiles) {
    const { ticket }      = listedFile;
    const { contentHash } = ticket.frontmatter;
    if (contentHash === undefined) {
      reading.readableFiles.push(listedFile);
      continue;
    }
    const keptLocation = committedContentLocationOf(workspace, contentHash);
    const kept         = CommittedContentFile.read(keptLocation, contentHash);
    if (kept.verdict === 'unreadable') {
      reading.unreadable.push({ ...unreadableEntryOf(listedFile, { code: 'committed-content-missing', contentProblem: kept.problem }), location: keptLocation, line: 0 });
      continue;
    }
    if (ticket.frontmatter.title !== kept.content.title || ticket.body !== kept.content.body) {
      ticket.frontmatter.title = kept.content.title;
      ticket.body              = kept.content.body;
      reading.contentRestored.push(ticket.frontmatter.id);
    }
    reading.readableFiles.push(listedFile);
  }
  return reading;
}

/** Looked up by frontmatter `id`, never by file name; a ticket `listTickets` reports as unreadable answers for no id. */
export function readTicket(workspace: Workspace, reference: string): Ticket | null {
  const identifier = TicketIdUtil.parseTicketReference(reference);
  if (identifier === null) {
    return null;
  }
  return listTickets(workspace).tickets.find((ticket) => ticket.frontmatter.id === identifier) ?? null;
}

/**
 * One past the highest of every file name's number, every parsed frontmatter `id`, every `ticket` a row in the progress file names
 * and every ticket the hold spent, so neither a malformed file, a file renamed or deleted by hand, a row whose ticket file was never
 * written nor a ticket filed earlier in the same hold has its id issued again. Gaps are tolerated and never filled.
 */
export function nextTicketId(workspace: Workspace, spentInHold: TicketsSpentInHold): string {
  let highest = 0;
  const markIdentifierSpent = (identifier: string | null): void => {
    if (identifier !== null) highest = Math.max(highest, Number(identifier));
  };

  for (const fileName of ticketFileNamesIn(workspace)) {
    markIdentifierSpent(identifierInFileName(fileName));
    const reading = new TicketFileIngestion(join(localStoreLayoutOf(workspace).ticketRecordsFolder, fileName)).read();
    if (reading.verdict === 'parsed') markIdentifierSpent(reading.ticket.frontmatter.id);
  }
  for (const identifier of ticketIdsNamedByTaskRows(workspace)) {
    markIdentifierSpent(identifier);
  }
  for (const ticket of spentInHold.tickets()) {
    markIdentifierSpent(ticket.frontmatter.id);
  }
  for (const record of spentInHold.logRecordsSoFar()) {
    if (record.kind === 'ticket-filed') markIdentifierSpent(TicketIdUtil.parseTicketReference(record.ticketId));
  }
  return TicketIdUtil.padTicketId(Math.max(highest + 1, FIRST_TICKET_NUMBER));
}

/**
 * Writes nothing: the caller holds the lock and writes the ticket after the progress file, so the id it assigns is only safe to use inside that
 * hold. `heldTicketLocations` are the files the hold already holds tickets in, those filed in it and not yet written among them.
 */
export function createTicket(
  workspace: Workspace,
  spentInHold: TicketsSpentInHold,
  heldTicketLocations: Iterable<string>,
  input: CreateTicketInput,
): CreatedTicket {
  const identifier  = nextTicketId(workspace, spentInHold);
  const fileName    = `${identifier}-${unusedSlugFor(workspace, heldTicketLocations, slugFromTitle(input.title))}${TICKET_FILE_EXTENSION}`;
  const frontmatter: TicketFrontmatter = {
    id:          identifier,
    title:       input.title,
    type:        input.type,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    status:      'draft',
    filed:       input.at,
    updated:     input.at,
    started:     null,
    finished:    null,
    delivered:   null,
    abandonedAt: null,
    ...(input.group === undefined ? {} : { group: input.group }),
    task:        null,
    extra:       [],
  };
  return { ticket: { frontmatter, body: input.bodyFor(identifier) }, location: join(localStoreLayoutOf(workspace).ticketRecordsFolder, fileName) };
}

/** Every ticket file `clear --all` removes, whether or not it parses. */
export function everyTicketFilePathIn(workspace: Workspace): string[] {
  const { ticketRecordsFolder } = localStoreLayoutOf(workspace);
  return ticketFileNamesIn(workspace).map((fileName) => join(ticketRecordsFolder, fileName));
}

interface ParsedTicketFile {
  fileName:       string;
  location:       string;
  ticket:         Ticket;
  identifierLine: number;
}

/** Keyed as a reference finds it: by the file name's number, or by the `id` it holds when the name carries none. */
function unreadableEntryOf(parsedFile: ParsedTicketFile, problem: UnreadableTicketProblem): UnreadableTicketRecord {
  return {
    record:   'ticket',
    key:      identifierInFileName(parsedFile.fileName) ?? parsedFile.ticket.frontmatter.id,
    location: parsedFile.location,
    problem,
    line:     parsedFile.identifierLine,
  };
}

/** `012-slug.md` and `012.md` carry a number; any other name carries none, and a number no ticket could have counts as none. */
function identifierInFileName(fileName: string): string | null {
  const found = FILE_NAME_IDENTIFIER_MATCH.exec(fileName);
  return found === null ? null : TicketIdUtil.parseTicketReference(found[1] ?? '');
}

/** A progress file that is absent or unreadable names nothing: every command that files a ticket has already refused an unreadable one. */
function ticketIdsNamedByTaskRows(workspace: Workspace): string[] {
  const reading = new ProgressFileIngestion(localStoreLayoutOf(workspace).progressRecordPath).read();
  if (reading.verdict !== 'readable') {
    return [];
  }

  const identifiers: string[] = [];
  for (const task of reading.progress.tasks) {
    const identifier = task.ticket === null ? null : TicketIdUtil.parseTicketReference(task.ticket);
    if (identifier !== null) identifiers.push(identifier);
  }
  return identifiers;
}

/** A missing tickets directory reads as "no tickets" rather than as a failure. */
function ticketFileNamesIn(workspace: Workspace): string[] {
  return storeFolderFileNamesIn(localStoreLayoutOf(workspace).ticketRecordsFolder, TICKET_FILE_EXTENSION);
}

/** The id already makes the path unique, so the `-2` suffix buys readability, not collision safety. */
function unusedSlugFor(workspace: Workspace, heldTicketLocations: Iterable<string>, slug: string): string {
  const heldFileNames = [...heldTicketLocations].map((location) => basename(location));
  const takenSlugs    = new Set([...ticketFileNamesIn(workspace), ...heldFileNames].map(slugPortionOf));
  let candidate       = slug;
  let attempt         = 2;

  while (takenSlugs.has(candidate)) {
    candidate = `${slug}-${attempt}`;
    attempt++;
  }
  return candidate;
}

function slugPortionOf(fileName: string): string {
  return fileName.slice(0, -TICKET_FILE_EXTENSION.length).replace(IDENTIFIER_PREFIX_MATCH, '');
}
