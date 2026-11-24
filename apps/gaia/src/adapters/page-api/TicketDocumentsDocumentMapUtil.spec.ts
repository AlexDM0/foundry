/**
 * A ticket's spec and plan mapped out to the page's contract, on hand-built documents that set every optional value somewhere. What
 * matters: every value of the model reaches its page field under the same name, the document carries its contract version, and the
 * Markdown leaves as its source text, never rendered, since the page parses it and draws it as text.
 */
import { describe, expect, test } from 'bun:test';

import { PAGE_CONTRACT_VERSIONS }         from '../../shared/constants/PageContractVersions.ts';
import { TicketDocumentsDocumentMapUtil } from './TicketDocumentsDocumentMapUtil.ts';
import { modelLeavesOf, pageLeavesOf }    from './testing/BoardModelLeaves.ts';
import { EXAMPLE_TICKET_DOCUMENTS }       from './testing/ExampleTicketDocuments.ts';

describe('ticketDocumentsDocumentOf', () => {
  test('carries every value of the documents to its page field', () => {
    const document = TicketDocumentsDocumentMapUtil.ticketDocumentsDocumentOf(EXAMPLE_TICKET_DOCUMENTS);
    expect(Object.fromEntries(pageLeavesOf(document))).toEqual(Object.fromEntries(modelLeavesOf(EXAMPLE_TICKET_DOCUMENTS)));
  });

  test('carries the page contract\'s version', () => {
    expect(TicketDocumentsDocumentMapUtil.ticketDocumentsDocumentOf(EXAMPLE_TICKET_DOCUMENTS).ticketDocumentsVersion).toBe(PAGE_CONTRACT_VERSIONS.gaiaTicketDocuments);
  });

  test('leaves the Markdown as its source text, raw HTML included', () => {
    const [spec] = EXAMPLE_TICKET_DOCUMENTS.documents;
    if (spec === undefined) throw new Error('The example holds a spec.');
    const withRawHtml = { ...EXAMPLE_TICKET_DOCUMENTS, documents: [{ ...spec, markdown: '<script>example()</script>\n# Example' }] };
    const [mappedSpec] = TicketDocumentsDocumentMapUtil.ticketDocumentsDocumentOf(withRawHtml).documents;
    expect(mappedSpec?.markdown).toBe('<script>example()</script>\n# Example');
  });
});

describe('commentAnchorOut', () => {
  test('maps an anchor with no columns, quote or diagram to nulls', () => {
    const anchor = {
      view: 'code', versionNumber: 2, lines: { from: 17, to: 23 }, columns: null, sectionPath: ['Behaviour'], quote: null, surroundingLines: { from: 14, to: 26 }, diagram: null,
    } as const;
    expect(TicketDocumentsDocumentMapUtil.commentAnchorOut(anchor)).toEqual(anchor);
  });
});
