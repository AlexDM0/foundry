/**
 * A body edit changes the body alone and keeps its line ending, so a one-line CRLF body does not gain an LF; a new title renames only the
 * ticket's own row and a generated heading, never a hand-changed one. Past `ready-for-review` a command's edit is refused, while the board's
 * own record lands in every status and moves the content hash, so agents build from what the board wrote.
 */
import { describe, expect, test } from 'bun:test';

import { boardFixture, taskFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { BoardRefusal }                             from './BoardRefusal.ts';
import { TicketBodyHashUtil }                       from './utils/TicketBodyHashUtil.ts';

const EDITED_AT = '2026-09-26T10:15:00+02:00';

describe('editTicket, the body', () => {
  test('a replacement changes the body only, stamps nothing, logs nothing and marks the ticket', () => {
    const ticket = ticketFixture({ status: 'draft' });
    const { board, records } = boardFixture({ tickets: [ticket] });
    const frontmatterBefore  = structuredClone(ticket.frontmatter);

    const edited = board.editTicket('001', { body: { text: 'Replaced.\n', appends: false }, writtenBy: 'command' }, EDITED_AT);

    expect(edited.changed).toBe(true);
    expect(ticket.body).toBe('Replaced.\n');
    expect(ticket.frontmatter).toEqual(frontmatterBefore);
    expect(records).toEqual([]);
    expect(board.changedTickets()).toEqual([ticket]);
  });

  test('an append to a one-line body of a CRLF ticket separates and converts with CRLF', () => {
    const ticket = { ...ticketFixture({ status: 'draft' }), body: 'One line', lineEnding: '\r\n' as const };
    const { board } = boardFixture({ tickets: [ticket] });

    board.editTicket('001', { body: { text: 'Second\nThird\n', appends: true }, writtenBy: 'command' }, EDITED_AT);

    expect(ticket.body).toBe('One line\r\nSecond\r\nThird\r\n');
  });

  test('an edit that leaves the body as it reads marks nothing for writing', () => {
    const ticket = { ...ticketFixture({ status: 'draft' }), body: 'Same.\n' };
    const { board } = boardFixture({ tickets: [ticket] });

    expect(board.editTicket('001', { body: { text: '', appends: true }, writtenBy: 'command' }, EDITED_AT).changed).toBe(false);
    expect(board.editTicket('001', { body: { text: 'Same.\n', appends: false }, writtenBy: 'command' }, EDITED_AT).changed).toBe(false);
    expect(board.changedTickets()).toEqual([]);
  });
});

describe('editTicket from committed onward, and the content hash', () => {
  test('a command edit of a draft and of a ticket ready for review lands, and leaves them holding no content hash', () => {
    for (const status of ['draft', 'ready-for-review'] as const) {
      const ticket = { ...ticketFixture({ status }), body: 'Draft.\n' };
      const { board } = boardFixture({ tickets: [ticket] });

      expect(board.editTicket('001', { body: { text: 'Replaced.\n', appends: false }, writtenBy: 'command' }, EDITED_AT).changed).toBe(true);
      expect(board.editTicket('001', { title: 'Example payment page', writtenBy: 'command' }, EDITED_AT).changed).toBe(true);
      expect(ticket.body).toBe('Replaced.\n');
      expect(ticket.frontmatter.contentHash).toBeUndefined();
    }
  });

  test('a command edit or retitle from committed onward is refused with the status, changing and marking nothing', () => {
    for (const status of ['committed', 'in-progress', 'in-review', 'reviewed', 'delivered', 'abandoned'] as const) {
      const ticket = { ...ticketFixture({ status }), body: 'Kept.\n' };
      const { board, records } = boardFixture({ tickets: [ticket] });

      expect(() => board.editTicket('001', { body: { text: 'Replaced.\n', appends: false }, writtenBy: 'command' }, EDITED_AT)).toThrow(
        expect.objectContaining({ detail: { reason: 'content-of-a-committed-ticket', ticketId: '001', status } }),
      );
      expect(() => board.editTicket('001', { title: 'Example payment page', writtenBy: 'command' }, EDITED_AT)).toThrow(BoardRefusal);
      expect(ticket.body).toBe('Kept.\n');
      expect(ticket.frontmatter.title).toBe('Example checkout page');
      expect(records).toEqual([]);
      expect(board.changedTickets()).toEqual([]);
    }
  });

  test('a held committed ticket is refused the same way', () => {
    const ticket = ticketFixture({ hold: 'waiting on Example Agency' });
    const { board } = boardFixture({ tickets: [ticket] });

    expect(() => board.editTicket('001', { body: { text: 'Replaced.\n', appends: false }, writtenBy: 'command' }, EDITED_AT)).toThrow(BoardRefusal);
  });

  test('the board\'s own record lands in an in-review ticket, logs nothing and moves the content hash to the new content', () => {
    const ticket = { ...ticketFixture({ status: 'in-review', contentHash: TicketBodyHashUtil.contentHashOf('Example checkout page', 'Built.\n') }), body: 'Built.\n' };
    const { board, records } = boardFixture({ tickets: [ticket] });

    const edited = board.editTicket('001', { body: { text: '## Review\n', appends: true }, writtenBy: 'board' }, EDITED_AT);

    expect(edited.changed).toBe(true);
    expect(ticket.body).toBe('Built.\n## Review\n');
    expect(ticket.frontmatter.contentHash).toBe(TicketBodyHashUtil.contentHashOf('Example checkout page', 'Built.\n## Review\n'));
    expect(records).toEqual([]);
    expect(board.changedTickets()).toEqual([ticket]);
  });

  test('the board\'s own record in a ticket that holds no content hash gives it none', () => {
    const ticket = { ...ticketFixture({ status: 'in-progress' }), body: 'Committed before content hashes.\n' };
    const { board } = boardFixture({ tickets: [ticket] });

    board.editTicket('001', { body: { text: 'Rewritten.\n', appends: false }, writtenBy: 'board' }, EDITED_AT);

    expect(ticket.body).toBe('Rewritten.\n');
    expect(ticket.frontmatter.contentHash).toBeUndefined();
  });

  test('a kept content restored by the store marks the ticket for writing and logs it once', () => {
    const ticket = ticketFixture();
    const { board, records } = boardFixture({ tickets: [ticket] });

    board.restoreKeptTicketContent('001', EDITED_AT);

    expect(records).toEqual([{
      at: EDITED_AT, kind: 'ticket-content-restored', ticketId: '001', fields: {}
    }]);
    expect(board.changedTickets()).toEqual([ticket]);
  });
});

describe('editTicket, the title', () => {
  function retitlingFixture(body: string): ReturnType<typeof boardFixture> & { ticket: ReturnType<typeof ticketFixture> } {
    const ticket = { ...ticketFixture({ task: 1, status: 'in-review' }), body };
    const fixture = boardFixture({
      tickets: [ticket],
      tasks:   [
        taskFixture({
          id: 1, name: '#001 Example checkout page', ticket: '001', status: 'in-review'
        }),
        taskFixture({
          id: 2, name: 'Review 1 #001 — Example checkout page', ticket: '001', status: 'in-progress'
        }),
      ],
    });
    return { ...fixture, ticket };
  }

  test('a new title renames the own row but no review bar, stamps nothing and logs one record naming both titles', () => {
    const {
      board, records, progress, ticket
    } = retitlingFixture('## Report\n');
    const updatedBefore = ticket.frontmatter.updated;

    const edited = board.editTicket('001', { title: 'Example payment page', writtenBy: 'board' }, EDITED_AT);

    expect(edited.changed).toBe(true);
    expect(ticket.frontmatter.title).toBe('Example payment page');
    expect(ticket.frontmatter.updated).toBe(updatedBefore);
    expect(progress.tasks.map((task) => task.name)).toEqual(['#001 Example payment page', 'Review 1 #001 — Example checkout page']);
    expect(records).toEqual([{
      at: EDITED_AT, kind: 'ticket-retitled', ticketId: '001', fields: { from: 'Example checkout page', to: 'Example payment page' }
    }]);
    expect(edited.logged).toEqual(records);
    expect(board.changedTickets()).toEqual([ticket]);
  });

  test('the generated heading follows the title, keeping its CRLF, and nothing else in the body changes', () => {
    const { board, ticket } = retitlingFixture('# 001 — Example checkout page\r\n\r\n# 001 — Example checkout page\r\n');

    board.editTicket('001', { title: 'Example payment page', writtenBy: 'board' }, EDITED_AT);

    expect(ticket.body).toBe('# 001 — Example payment page\r\n\r\n# 001 — Example checkout page\r\n');
  });

  test('a hand-changed heading, or a heading-only body without a line ending that reads otherwise, is kept byte for byte', () => {
    for (const body of ['# 001 — Example checkout page, revised\n', '# Example checkout page\n', '#  001 — Example checkout page']) {
      const { board, ticket } = retitlingFixture(body);
      board.editTicket('001', { title: 'Example payment page', writtenBy: 'board' }, EDITED_AT);
      expect(ticket.body).toBe(body);
    }
  });

  test('a body that is only the generated heading without a line ending is retitled', () => {
    const { board, ticket } = retitlingFixture('# 001 — Example checkout page');

    board.editTicket('001', { title: 'Example payment page', writtenBy: 'board' }, EDITED_AT);

    expect(ticket.body).toBe('# 001 — Example payment page');
  });

  test('a title and an append apply together, the append landing on the retitled body', () => {
    const { board, records, ticket } = retitlingFixture('# 001 — Example checkout page\n');

    board.editTicket('001', { title: 'Example payment page', body: { text: 'Appended.\n', appends: true }, writtenBy: 'board' }, EDITED_AT);

    expect(ticket.body).toBe('# 001 — Example payment page\nAppended.\n');
    expect(records.map((record) => record.kind)).toEqual(['ticket-retitled']);
  });

  test('the title the ticket already has changes nothing, logs nothing and marks nothing', () => {
    const {
      board, records, progress, ticket
    } = retitlingFixture('# 001 — Example checkout page\n');

    const edited = board.editTicket('001', { title: 'Example checkout page', writtenBy: 'board' }, EDITED_AT);

    expect(edited.changed).toBe(false);
    expect(ticket.body).toBe('# 001 — Example checkout page\n');
    expect(progress.tasks[0]?.name).toBe('#001 Example checkout page');
    expect(records).toEqual([]);
    expect(board.changedTickets()).toEqual([]);
  });

  test('a low draft without a row is retitled without one', () => {
    const ticket = ticketFixture({ priority: 'low', status: 'draft' });
    const { board, progress } = boardFixture({ tickets: [ticket] });

    board.editTicket('001', { title: 'Example payment page', writtenBy: 'command' }, EDITED_AT);

    expect(ticket.frontmatter.title).toBe('Example payment page');
    expect(progress.tasks).toEqual([]);
  });
});
