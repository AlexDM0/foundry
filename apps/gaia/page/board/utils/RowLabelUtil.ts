/** What a chart row is called wherever it shows: its ticket's `#NNN` label, and its name without a leading `#NNN` that label already says. */

const TICKETLESS_ROW_LABEL = 'TASK';

const LEADING_TICKET_NUMBER_PATTERN = /^#(\d+)\s+/;

/** A row's own ticket, else the ticket it reviews; the row's own id never shows. */
function rowLabelOf(row: { readonly ticket?: string | null; readonly reviewOf?: string }): string {
  const ticket = row.ticket ?? row.reviewOf ?? null;
  return ticket === null ? TICKETLESS_ROW_LABEL : `#${ticket}`;
}

/** A name opening with its own ticket's `#NNN` drops it; any other name is kept. */
function displayedRowNameOf(row: { readonly name: string; readonly ticket?: string | null }): string {
  const leadingNumber = LEADING_TICKET_NUMBER_PATTERN.exec(row.name);
  if (row.ticket === undefined || row.ticket === null || leadingNumber === null || Number(leadingNumber[1]) !== Number(row.ticket)) return row.name;
  return row.name.slice(leadingNumber[0].length);
}

export const RowLabelUtil = Object.freeze({ rowLabelOf, displayedRowNameOf });
