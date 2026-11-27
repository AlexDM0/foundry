/**
 * The page ticket's text parts: each section and Acceptance item arrives as its source text, a waived item is marked, a ticket without an
 * Acceptance has no items, and a ticket with documents takes its items from its approved spec. Forge renders no HTML: no key ends in `Html`.
 * The section and item reading is pinned in `src/adapters/tickets/utils/TicketAcceptanceUtil.spec.ts`.
 */
import { describe, expect, test } from 'bun:test';

import type { Epic }                                from '../../lib/tracker-model/@types/Epic.ts';
import type { Ticket }                              from '../../lib/tracker-model/@types/Ticket.ts';
import { boardFixture, epicFixture, ticketFixture } from '../../testing/BoardFixtures.ts';
import { loadedRecordFixture }                      from '../../testing/TicketDocumentRecordFixtures.ts';
import { boardFactsOf }                             from './BoardFacts.ts';
import { assemblePagePayload }                      from './PagePayloadAssembly.ts';
import type { AssembledPagePayload }                from './PagePayloadAssembly.ts';

const GENERATED_AT = new Date('2026-09-18T19:10:00Z');

const EPIC_DESCRIPTION = '# Example checkout\r\n\r\nPays an <b>example</b> order, see [the plan](javascript:alert(1)).\n\n  \n';

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

function assembledFor(tickets: Ticket[], epics: Epic[] = []): AssembledPagePayload {
  const { board, progress } = boardFixture({ tickets });
  return assemblePagePayload({
    progress,
    logRecords:        [],
    tickets,
    epics,
    pageScriptFailure: null,
    generatedAt:       GENERATED_AT,
    concurrency:       { limit: 2, agentsInFlight: 0 },
    boardFacts:        boardFactsOf(board),
  });
}

describe('assemblePagePayload page tickets', () => {
  test('a ticket with documents takes its Acceptance items from its approved spec, not its body', () => {
    const tickets = [ticketWithBody('004', EXPORT_BODY)];
    const { board, progress } = boardFixture({
      tickets,
      ticketDocumentRecords: [loadedRecordFixture('004', { spec: { texts: ['## Acceptance\n\nA1. The basket shows.\n'], approvals: [{ number: 1, by: 'person' }] } })],
    });
    const [ticket] = assemblePagePayload({
      progress,
      logRecords:        [],
      tickets,
      epics:             [],
      pageScriptFailure: null,
      generatedAt:       GENERATED_AT,
      concurrency:       { limit: 2, agentsInFlight: 0 },
      boardFacts:        boardFactsOf(board),
      documentRecords:   board,
    }).tickets;
    expect(ticket?.acceptanceItems).toEqual([{ label: 'A1', text: 'The basket shows.', waived: false }]);
  });

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

  test('a ticket carries its stored body as Markdown with the Acceptance items separated, raw HTML and all', () => {
    const [ticket] = assembledFor([ticketWithBody('004', EXPORT_BODY)]).tickets;

    expect(ticket?.bodyMarkdown).toBe(EXPORT_BODY.replace('    on every page.\nA2.', '    on every page.\n\nA2.'));
    expect(ticket?.bodyMarkdown).toContain('The export names <b>Alex Example</b>.');
  });

  test('an epic carries its stored description byte for byte', () => {
    const { payload } = assembledFor([], [{ ...epicFixture({ key: 'example-checkout' }), body: EPIC_DESCRIPTION }]);

    expect(payload.epicDescriptions).toEqual([{ key: 'example-checkout', descriptionMarkdown: EPIC_DESCRIPTION }]);
  });

  test('no key of the document ends in Html', () => {
    const assembled = assembledFor([ticketWithBody('004', EXPORT_BODY)], [{ ...epicFixture({ key: 'example-checkout' }), body: EPIC_DESCRIPTION }]);
    const keysOf = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(keysOf);
      if (typeof value !== 'object' || value === null) return [];
      return Object.entries(value).flatMap(([key, held]) => [key, ...keysOf(held)]);
    };

    expect(keysOf(assembled).filter((key) => key.endsWith('Html'))).toEqual([]);
    expect(keysOf(assembled)).toContain('bodyMarkdown');
  });

  test('a ticket without `## Acceptance`, or with an empty body, has no items and keeps both keys', () => {
    const { tickets } = assembledFor([ticketWithBody('005', '## Wanted\nExample.\n'), ticketWithBody('006', '')]);

    expect(tickets.map(({ id, sections, acceptanceItems }) => ({ id, sections, acceptanceItems }))).toEqual([
      { id: '005', sections: [{ heading: 'Wanted', markdown: 'Example.' }], acceptanceItems: [] },
      { id: '006', sections: [], acceptanceItems: [] },
    ]);
  });
});
