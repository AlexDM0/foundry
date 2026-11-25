/**
 * The ticket documents mapper against its own contract. What matters: every field of a full document is mapped by name, an anchor's
 * absent columns, quote and diagram read as `null`, every list is copied rather than shared, and a document with no head maps to none.
 * The recorded answer only shows a spec at its first version, so the messages, proposals, approvals, out-of-date plan and effect readings
 * are written here as the contract types them.
 */
import { describe, expect, test } from 'bun:test';

import type { ForgeTicketDocumentsDocument, TicketDocumentDocument } from 'forge-contracts/TicketDocumentsDocument';

import { TicketDocumentsMapUtil } from './TicketDocumentsMapUtil.ts';

const VERSION_ONE = {
  number: 1, contentHash: 'a0285626eb925b57', author: 'person', jobId: null, at: '2026-11-24T10:00:00+01:00', constitutionCommit: null, constitutionNumber: null,
} as const;

const VERSION_TWO = {
  number: 2, contentHash: 'b17f02c9d4e81a36', author: 'agent', jobId: 'J4', at: '2026-11-24T10:05:00+01:00', constitutionCommit: '5d2f9c1', constitutionNumber: 3,
} as const;

const SPEC: TicketDocumentDocument = {
  document:        'spec',
  standing:        'approved',
  reviewer:        'person',
  holdsAcceptance: true,
  editable:        false,
  proposalMode:    'auto-apply',
  head:            VERSION_TWO,
  markdown:        '# Example search\n\nSearch finds a book.\n',
  versions:        [VERSION_ONE, VERSION_TWO],
  approvals:       [{
    number:             2,
    contentHash:        VERSION_TWO.contentHash,
    by:                 'person',
    at:                 '2026-11-24T10:06:00+01:00',
    constitutionCommit: '5d2f9c1',
    constitutionNumber: 3,
    onSpecNumber:       null,
    onSpecContentHash:  null,
  }],
  messages: [
    {
      messageId:     'M1',
      commentNumber: 1,
      decisionId:    null,
      answer:        null,
      anchor:        {
        view:             'preview',
        versionNumber:    1,
        lines:            { from: 3, to: 3 },
        sectionPath:      ['Example search'],
        surroundingLines: { from: 1, to: 3 },
        diagram:          {
          lines: { from: 5, to: 8 }, diagramKind: 'flowchart', nodeId: 'authors', nodeLabel: 'Author index'
        },
      },
      placement:      { from: 3, to: 3 },
      orphaned:       false,
      text:           'Name the index.',
      from:           'person',
      state:          'applied',
      queuedAt:       '2026-11-24T10:01:00+01:00',
      deliveryNumber: 1,
      agentTurn:      1,
    },
    {
      messageId:      'M2',
      commentNumber:  null,
      decisionId:     null,
      answer:         null,
      anchor:         null,
      placement:      null,
      orphaned:       false,
      text:           'The effect reading found nothing.',
      from:           'board',
      state:          'queued',
      queuedAt:       '2026-11-24T10:07:00+01:00',
      deliveryNumber: null,
      agentTurn:      null,
    },
  ],
  proposals: [{
    proposalId: 'P1',
    jobId:      'J4',
    baseNumber: 1,
    edits:      [{
      fromLine: 3, toLine: 3, originalLines: ['Search finds a book.'], replacementLines: ['Search finds a book by its author.']
    }],
    summary:          'Name what search reads.',
    answersMessageId: 'M1',
    forSpecNumber:    null,
    state:            'applied',
    appliedNumber:    2,
    at:               '2026-11-24T10:04:00+01:00',
    headLines:        null,
  }],
  agentJobId: 'J4',
  outOfDate:  null,
};

const PLAN: TicketDocumentDocument = {
  ...SPEC,
  document:        'plan',
  standing:        'unwritten',
  holdsAcceptance: false,
  head:            null,
  markdown:        '',
  versions:        [],
  approvals:       [],
  messages:        [],
  proposals:       [],
  agentJobId:      null,
  outOfDate:       {
    approvedOnSpecNumber: 1,
    specNumber:           2,
    specChanges:          [{
      originalFromLine: 3, originalLines: ['Search finds a book.'], replacementFromLine: 3, replacementLines: ['Search finds a book by its author.']
    }],
  },
};

const DOCUMENTS: ForgeTicketDocumentsDocument = {
  ticketId:       '001',
  documents:      [SPEC, PLAN],
  effectReadings: [{
    document:             'spec',
    versionNumber:        2,
    state:                'read',
    durationMilliseconds: 1_200,
    references:           [{ reference: 1, lines: { from: 3, to: 3 }, quote: 'Search finds a book by its author.' }],
    entries:              [
      {
        reference: 1, path: 'apps/web/search.ts', change: 'changes', detail: 'Search reads the author.', unresolvedReason: null, candidates: [],
      },
      {
        reference: 1, path: 'index', change: 'unresolved', detail: 'Two indexes match.', unresolvedReason: 'ambiguous', candidates: ['apps/web/index.ts', 'apps/api/index.ts'],
      },
    ],
  }],
};

describe('ticketDocumentsOf', () => {
  test('maps every field of a full spec by name, an absent column range and quote read as null', () => {
    const mapped = TicketDocumentsMapUtil.ticketDocumentsOf(DOCUMENTS);
    const [spec] = mapped.documents;
    expect(spec as unknown).toEqual({
      ...SPEC,
      messages: [
        { ...SPEC.messages[0], anchor: { ...SPEC.messages[0]?.anchor, columns: null, quote: null } },
        SPEC.messages[1],
      ],
    });
  });

  test('maps a plan with no head and an out-of-date approval, and each effect reading entry with its unresolved reason', () => {
    const mapped = TicketDocumentsMapUtil.ticketDocumentsOf(DOCUMENTS);
    expect(mapped.documents[1] as unknown).toEqual(PLAN);
    expect(mapped.effectReadings).toEqual(DOCUMENTS.effectReadings);
    expect(mapped.ticketId).toBe('001');
  });

  test('copies every list rather than sharing the forge document\'s', () => {
    const mapped = TicketDocumentsMapUtil.ticketDocumentsOf(DOCUMENTS);
    expect(mapped.documents[0]?.proposals[0]?.edits[0]?.replacementLines).not.toBe(SPEC.proposals[0]?.edits[0]?.replacementLines);
    expect(mapped.effectReadings[0]?.entries[1]?.candidates).not.toBe(DOCUMENTS.effectReadings[0]?.entries[1]?.candidates);
  });

  test('names the forge values of the vocabularies only the documents carry', () => {
    expect(TicketDocumentsMapUtil.forgeValues).toEqual({
      documentAuthor:         ['person', 'agent'],
      documentApprover:       ['person', 'pipeline'],
      documentMessageSender:  ['person', 'board'],
      commentView:            ['preview', 'code'],
      effectReadingState:     ['reading', 'read', 'failed'],
      effectUnresolvedReason: ['ambiguous', 'no-match'],
    });
  });
});
