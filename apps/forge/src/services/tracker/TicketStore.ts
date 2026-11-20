/**
 * The tickets directory as a store. Nothing here throws because a ticket file is bad: a malformed
 * file is a listing entry and a `null`, so one broken file cannot take down `status` or `render`.
 */

import { basename, join }                                          from 'node:path';
import { ProgressFileIngestion }                                   from '../../adapters/progress/ProgressFileIngestion.ts';
import { TicketFileIngestion }                                     from '../../adapters/tickets/TicketFileIngestion.ts';
import type { LogRecord }                                          from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Ticket, TicketFrontmatter }                          from '../../lib/tracker-model/@types/Ticket.ts';
import { FIRST_TICKET_NUMBER }                                     from '../../lib/tracker-model/constants/TicketFields.ts';
import { TicketIdUtil }                                            from '../../lib/tracker-model/utils/TicketIdUtil.ts';
import type { CreateTicketInput, TicketListing, UnreadableRecord } from './@types/BoardRecords.ts';
import { slugFromTitle }                                           from './SlugFromTitle.ts';
import { storeFolderFileNamesIn }                                  from './StoreFolderListing.ts';
import type { Workspace }                                          from './Workspace.ts';

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
 * also holds, is listed as unreadable with its reason, since which of them is the ticket cannot be judged. Ordered by id numerically.
 */
export function listTickets(workspace: Workspace): LocalTicketListing {
  const parsedFiles: ParsedTicketFile[] = [];
  const unreadable: UnreadableRecord[]  = [];

  for (const fileName of ticketFileNamesIn(workspace)) {
    const filePath = join(workspace.ticketsDirectory, fileName);
    const reading  = new TicketFileIngestion(filePath).read();

    if (reading.verdict === 'parsed') {
      parsedFiles.push({
        fileName, location: filePath, ticket: reading.ticket, identifierLine: reading.identifierLine
      });
    } else {
      unreadable.push({
        record: 'ticket', key: identifierInFileName(fileName), location: filePath, reason: reading.reason, line: reading.line
      });
    }
  }

  const namedConsistently: ParsedTicketFile[] = [];
  for (const parsedFile of parsedFiles) {
    const identifierInName = identifierInFileName(parsedFile.fileName);
    const { id }           = parsedFile.ticket.frontmatter;

    if (identifierInName !== null && identifierInName !== id) {
      unreadable.push(unreadableEntryOf(parsedFile, `the file name says #${identifierInName} but its \`id\` is ${id}`));
    } else {
      namedConsistently.push(parsedFile);
    }
  }

  const listedFiles: ParsedTicketFile[] = [];
  for (const parsedFile of namedConsistently) {
    const otherHolders = namedConsistently.filter((other) => other !== parsedFile && other.ticket.frontmatter.id === parsedFile.ticket.frontmatter.id);

    if (otherHolders.length > 0) {
      const otherFileNames = otherHolders.map((other) => other.fileName).join(', ');
      unreadable.push(unreadableEntryOf(parsedFile, `ticket #${parsedFile.ticket.frontmatter.id} is also held by ${otherFileNames}`));
    } else {
      listedFiles.push(parsedFile);
    }
  }

  listedFiles.sort((a, b) => Number(a.ticket.frontmatter.id) - Number(b.ticket.frontmatter.id));
  unreadable.sort((a, b) => (a.location < b.location ? -1 : Number(a.location > b.location)));
  return {
    tickets:         listedFiles.map((listedFile) => listedFile.ticket),
    unreadable,
    ticketLocations: new Map(listedFiles.map((listedFile) => [listedFile.ticket.frontmatter.id, listedFile.location])),
  };
}

/** The port's listing alone, for an answer that leaves the store. */
export function ticketListingOf(listing: LocalTicketListing): TicketListing {
  return { tickets: listing.tickets, unreadable: listing.unreadable };
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
    const reading = new TicketFileIngestion(join(workspace.ticketsDirectory, fileName)).read();
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
  return { ticket: { frontmatter, body: input.bodyFor(identifier) }, location: join(workspace.ticketsDirectory, fileName) };
}

/** Every ticket file `clear --all` removes, whether or not it parses. */
export function everyTicketFilePathIn(workspace: Workspace): string[] {
  return ticketFileNamesIn(workspace).map((fileName) => join(workspace.ticketsDirectory, fileName));
}

interface ParsedTicketFile {
  fileName:       string;
  location:       string;
  ticket:         Ticket;
  identifierLine: number;
}

/** Keyed as a reference finds it: by the file name's number, or by the `id` it holds when the name carries none. */
function unreadableEntryOf(parsedFile: ParsedTicketFile, reason: string): UnreadableRecord {
  return {
    record:   'ticket',
    key:      identifierInFileName(parsedFile.fileName) ?? parsedFile.ticket.frontmatter.id,
    location: parsedFile.location,
    reason,
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
  const reading = new ProgressFileIngestion(workspace.progressFilePath).read();
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
  return storeFolderFileNamesIn(workspace.ticketsDirectory, TICKET_FILE_EXTENSION);
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
