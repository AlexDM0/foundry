/**
 * The page ticket's text parts: a view quotes a ticket's Wanted and Brief and its Acceptance items, and shows them escaped, so what
 * matters is that each section and item arrives as its source text and never passes through the Markdown renderer (a ticket's `bodyHtml`
 * stays its only HTML), that a waived item is marked, and that a ticket without an Acceptance has no items rather than a missing key.
 * The section and item reading itself is pinned in `src/adapters/tickets/utils/TicketAcceptanceUtil.spec.ts`.
 */
import { describe, expect, test } from 'bun:test';

import type { Ticket }                 from '../../lib/tracker-model/@types/Ticket.ts';
import { boardFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { boardFactsOf }                from './BoardFacts.ts';
import { assemblePagePayload }         from './PagePayloadAssembly.ts';
import type { AssembledPagePayload }   from './PagePayloadAssembly.ts';

const GENERATED_AT = new Date('2026-09-18T19:10:00Z');

const RENDERED_MARKER = 'rendered:';

const EXPORT_BODY = [
  '# 4 — Example export',
  '',
  '## Wanted',
  '',
  'The export names <b>Alex Example</b>.',
  '',
  '## Acceptance',
  '',
  'A1. The export names Alex Example',
  '    on every page.',
  'A2. Waived: the footer moved to Example Agency.',
  '',
  '## Brief',
  'Work belongs in: `src/example/Export.ts`.',
  '',
].join('\n');

function ticketWithBody(id: string, body: string): Ticket {
  return { ...ticketFixture({ id }), body };
}

function assembledFor(tickets: Ticket[]): AssembledPagePayload {
  const { board, progress } = boardFixture({ tickets });
  return assemblePagePayload({
    progress,
    logRecords:        [],
    tickets,
    epics:             [],
    pageScriptFailure: null,
    generatedAt:       GENERATED_AT,
    concurrency:       { limit: 2, agentsInFlight: 0 },
    boardFacts:        boardFactsOf(board),
    renderMarkdown:    (markdown) => `${RENDERED_MARKER}${markdown}`,
  });
}

describe('assemblePagePayload page tickets', () => {
  test('a ticket carries its `##` sections and its Acceptance items as source text, in written order', () => {
    const [ticket] = assembledFor([ticketWithBody('004', EXPORT_BODY)]).tickets;

    expect(ticket?.sections).toEqual([
      { heading: 'Wanted',     markdown: 'The export names <b>Alex Example</b>.' },
      { heading: 'Acceptance', markdown: 'A1. The export names Alex Example\n    on every page.\nA2. Waived: the footer moved to Example Agency.' },
      { heading: 'Brief',      markdown: 'Work belongs in: `src/example/Export.ts`.' },
    ]);
    expect(ticket?.acceptanceItems).toEqual([
      { label: 'A1', text: 'The export names Alex Example on every page.', waived: false },
      { label: 'A2', text: 'Waived: the footer moved to Example Agency.', waived: true },
    ]);
  });

  test('the excerpts never pass through the renderer, and the body is still rendered whole as the one HTML', () => {
    const [ticket] = assembledFor([ticketWithBody('004', EXPORT_BODY)]).tickets;

    expect(ticket?.bodyHtml.startsWith(RENDERED_MARKER)).toBe(true);
    for (const { markdown } of ticket?.sections ?? []) expect(markdown).not.toContain(RENDERED_MARKER);
    for (const { text } of ticket?.acceptanceItems ?? []) expect(text).not.toContain(RENDERED_MARKER);
  });

  test('a ticket without `## Acceptance`, or with an empty body, has no items and keeps both keys', () => {
    const { tickets } = assembledFor([ticketWithBody('005', '## Wanted\nExample.\n'), ticketWithBody('006', '')]);

    expect(tickets.map(({ id, sections, acceptanceItems }) => ({ id, sections, acceptanceItems }))).toEqual([
      { id: '005', sections: [{ heading: 'Wanted', markdown: 'Example.' }], acceptanceItems: [] },
      { id: '006', sections: [], acceptanceItems: [] },
    ]);
  });
});
