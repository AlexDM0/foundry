/**
 * A ticket's title and body edited, leaving its status and `updated` stamp alone: only a transition stamps it. A new
 * title renames the ticket's own row and the body's generated heading, never a review bar, whose name records the title it was started under.
 */
import type { Logged }                           from './@types/BoardChanges.ts';
import type { LogRecord }                        from './@types/LogRecord.ts';
import type { Ticket }                           from './@types/Ticket.ts';
import type { BoardRecords }                     from './BoardRecords.ts';
import { BoardRefusal }                          from './BoardRefusal.ts';
import type { MarkdownBodyEdit }                 from './MarkdownBodyEdit.ts';
import { editedBodyOf }                          from './MarkdownBodyEdit.ts';
import { TICKET_STATUSES_WITH_EDITABLE_CONTENT } from './constants/Statuses.ts';
import { TicketBodyHashUtil }                    from './utils/TicketBodyHashUtil.ts';
import { TicketChartUtil }                       from './utils/TicketChartUtil.ts';

export interface TicketEdit {
  title?:    string;
  body?:     MarkdownBodyEdit;
  /**
   * `command` is refused from committed onward; `board` is the board's own record in the body (a Handoff, a review, waived items, an
   * answer), allowed in every status, and moves `contentHash`.
   */
  writtenBy: 'command' | 'board';
}

export interface TicketEdited extends Logged {
  ticket:  Readonly<Ticket>;
  /** False when the title and body already read exactly so, an empty append included; the ticket is then not written. */
  changed: boolean;
}

const LINE_FEED = '\n';

function generatedHeadingOf(ticketId: string, title: string): string {
  return `# ${ticketId} — ${title}`;
}

/** Only a first line reading exactly as `ticket add` generates it is rewritten, keeping its line ending; a hand-changed heading is the author's. */
function bodyWithHeadingRetitled(body: string, ticketId: string, previousTitle: string, title: string): string {
  const lineFeedIndex  = body.indexOf(LINE_FEED);
  const firstLineEnd   = lineFeedIndex === -1 ? body.length : lineFeedIndex;
  const headingEnd     = body[firstLineEnd - 1] === '\r' ? firstLineEnd - 1 : firstLineEnd;
  if (body.slice(0, headingEnd) !== generatedHeadingOf(ticketId, previousTitle)) return body;
  return `${generatedHeadingOf(ticketId, title)}${body.slice(headingEnd)}`;
}

export class TicketEdits {
  constructor(private readonly records: BoardRecords) {}

  /**
   * A command's edit of a committed ticket, or of one past it, is refused before anything else is read, so a claim and an edit sharing one
   * lock hold never both act on a stale status. The heading is retitled before the body edit applies, so a replacement is written as given
   * and an append lands on the retitled body. The board's own record moves the content hash to the new content, so agents build from it.
   */
  editTicket(ticketId: string, edit: TicketEdit, at: string): TicketEdited {
    const ticket            = this.records.requireTicket(ticketId);
    const { frontmatter }   = ticket;
    if (edit.writtenBy === 'command' && !TICKET_STATUSES_WITH_EDITABLE_CONTENT.includes(frontmatter.status)) {
      throw new BoardRefusal({ reason: 'content-of-a-committed-ticket', ticketId, status: frontmatter.status });
    }
    const previousTitle     = frontmatter.title;
    const title             = edit.title ?? previousTitle;
    const retitled          = title !== previousTitle;
    const retitledBody      = retitled ? bodyWithHeadingRetitled(ticket.body, ticketId, previousTitle, title) : ticket.body;
    const body              = edit.body === undefined ? retitledBody : editedBodyOf({ ...ticket, body: retitledBody }, edit.body);
    if (!retitled && body === ticket.body) return { logged: [], ticket, changed: false };

    if (frontmatter.contentHash !== undefined) frontmatter.contentHash = TicketBodyHashUtil.contentHashOf(title, body);
    ticket.body = body;
    this.records.markChanged(ticket);
    const logged: LogRecord[] = [];
    if (retitled) {
      frontmatter.title = title;
      const ownRow = this.records.linkedTaskRecordOf(ticket);
      if (ownRow !== undefined) ownRow.name = TicketChartUtil.rowNameOf(frontmatter);
      logged.push(this.records.logger.log({ kind: 'ticket-retitled', ticketId, fields: { from: previousTitle, to: title } }, at));
    }
    return { logged, ticket, changed: true };
  }

  /** The store read the ticket with the content its hash keeps, not its changed stored text: the ticket is written back as it reads. */
  restoreKeptContent(ticketId: string, at: string): Logged {
    this.records.markChanged(this.records.requireTicket(ticketId));
    return { logged: [this.records.logger.log({ kind: 'ticket-content-restored', ticketId, fields: {} }, at)] };
  }
}
