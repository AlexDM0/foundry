/**
 * A ticket's documents record against the contract's documents. What matters: every field of a document, a version, an approval, a
 * message with its anchor, a proposal, an out-of-date plan and an effect reading is named, an absent optional field reads `null`, and a
 * key the record gains reaches no reader, since nothing is spread; a document the record does not hold reads unwritten; the head's text is
 * the Markdown; constitution numbers are asked per commit; an open proposal covers the lines its edits stand on at the head, moved by the
 * lines changed since its base, and none once a later change touched them or once it is settled; a plan approved on an older spec names
 * that spec version, the spec's head and the spec lines changed between them; the summary carries each standing, the head's number and
 * the newest approved number.
 */
import { describe, expect, test } from 'bun:test';

import type { DocumentProposal, LoadedTicketDocumentRecord, TicketDocument } from '../../../lib/tracker-model/@types/TicketDocument.ts';
import { TicketDocumentVersionUtil }                                         from '../../../lib/tracker-model/utils/TicketDocumentVersionUtil.ts';
import type { EffectReading }                                                from '../../../shared/@types/EffectReading.ts';
import { TicketDocumentsMappingUtil }                                        from './TicketDocumentsMappingUtil.ts';

const AT = '2026-11-24T10:00:00.000Z';
const SPEC_FIVE = '# Example spec\n\n## Outcome\n\nAlex Example sees the basket.\n\n## Acceptance\n\n1. The basket shows.\n';
const SPEC_SIX = '# Example spec\n\n## Outcome\n\nAlex Example sees the basket and its total.\n\n## Acceptance\n\n1. The basket shows.\n';
const PLAN_ONE = '# Plan\n\n1. Add the basket page.\n2. Add the total.\n3. Test the page.\n';
const PLAN_TWO = '# Plan\n\nRead the spec first.\n\n1. Add the basket page.\n2. Add the total.\n3. Test the page.\n';
const UNKNOWN_KEY = { addedLater: 'a key no mapper names' };

function hashOf(text: string): string {
  return TicketDocumentVersionUtil.contentHashOf(text);
}

function proposalOf(changes: Partial<DocumentProposal>): DocumentProposal {
  return {
    proposalId: 'P1',
    jobId:      'J7',
    baseNumber: 1,
    edits:      [{
      fromLine: 4, toLine: 4, originalLines: ['2. Add the total.'], replacementLines: ['2. Add the total and the tax.']
    }],
    summary: 'Name the tax.',
    state:   'proposed',
    at:      AT,
    ...changes,
  };
}

const SPEC: TicketDocument = {
  kind:     'spec',
  versions: [
    {
      number: 5, contentHash: hashOf(SPEC_FIVE), author: 'agent', jobId: 'J4', at: AT, constitutionCommit: 'c0ffee5', ...UNKNOWN_KEY
    },
    {
      number: 6, contentHash: hashOf(SPEC_SIX), author: 'person', at: AT
    },
  ],
  approvals: [
    {
      number: 5, contentHash: hashOf(SPEC_FIVE), by: 'person', at: AT, constitutionCommit: 'c0ffee5'
    },
    {
      number: 6, contentHash: hashOf(SPEC_SIX), by: 'person', at: AT, constitutionCommit: 'c0ffee6'
    },
  ],
  messages: [
    {
      messageId:     'M1',
      commentNumber: 1,
      anchor:        {
        view:             'preview',
        versionNumber:    5,
        lines:            { from: 5, to: 5 },
        columns:          { from: 1, to: 12 },
        sectionPath:      ['Outcome'],
        quote:            'Alex Example',
        surroundingLines: { from: 3, to: 7 },
        diagram:          {
          lines: { from: 5, to: 5 }, diagramKind: 'flowchart', nodeId: 'basket', nodeLabel: 'Basket'
        },
      },
      placement:      { from: 5, to: 5 },
      text:           'Name the total too.',
      from:           'person',
      state:          'applied',
      queuedAt:       AT,
      deliveryNumber: 1,
      agentTurn:      2,
      ...UNKNOWN_KEY,
    },
    {
      messageId: 'M2', orphaned: true, text: 'The page reads the basket.', from: 'board', state: 'queued', queuedAt: AT
    },
  ],
  proposals:          [],
  proposalMode:       'auto-apply',
  nextMessageNumber:  3,
  nextCommentNumber:  2,
  nextProposalNumber: 1,
};

const PLAN: TicketDocument = {
  kind:     'plan',
  versions: [
    {
      number: 1, contentHash: hashOf(PLAN_ONE), author: 'agent', jobId: 'J7', at: AT, constitutionCommit: 'c0ffee5'
    },
    {
      number: 2, contentHash: hashOf(PLAN_TWO), author: 'person', at: AT
    },
  ],
  approvals: [{
    number: 2, contentHash: hashOf(PLAN_TWO), by: 'person', at: AT, constitutionCommit: 'c0ffee5', onSpecNumber: 5, onSpecContentHash: hashOf(SPEC_FIVE)
  }],
  messages:  [],
  proposals: [
    proposalOf({ proposalId: 'P1', answersMessageId: 'M1', forSpecNumber: 6 }),
    proposalOf({
      proposalId: 'P2',
      baseNumber: 2,
      edits:      [{
        fromLine: 3, toLine: 2, originalLines: [], replacementLines: ['Read the constitution.']
      }]
    }),
    proposalOf({
      proposalId: 'P3',
      edits:      [{
        fromLine: 2, toLine: 2, originalLines: ['1. Add the basket page.'], replacementLines: ['1. Add the basket.']
      }]
    }),
    proposalOf({ proposalId: 'P4', state: 'applied', appliedNumber: 2 }),
  ],
  proposalMode:       'ask-first',
  readyAtNumber:      2,
  nextMessageNumber:  1,
  nextCommentNumber:  1,
  nextProposalNumber: 5,
};

const LOADED_RECORD: LoadedTicketDocumentRecord = {
  record: {
    version: 1, ticketId: '004', openedAt: AT, documents: [PLAN, SPEC]
  },
  textOfContentHash: {
    [hashOf(SPEC_FIVE)]: SPEC_FIVE, [hashOf(SPEC_SIX)]: SPEC_SIX, [hashOf(PLAN_ONE)]: PLAN_ONE, [hashOf(PLAN_TWO)]: PLAN_TWO
  },
};

const EFFECT_READING: EffectReading = {
  ticketId:             '004',
  document:             'plan',
  versionNumber:        2,
  state:                'read',
  durationMilliseconds: 1400,
  references:           [{ reference: 1, lines: { from: 5, to: 5 }, quote: 'Add the basket page.' }],
  entries:              [
    {
      reference: 1, path: 'src/pages/Basket.tsx', change: 'adds', detail: 'A new page.', unresolvedReason: null, candidates: []
    },
    {
      reference: 1, path: 'Basket', change: 'unresolved', detail: 'Two files match.', unresolvedReason: 'ambiguous', candidates: ['src/Basket.ts', 'web/Basket.ts']
    },
  ],
};

const CONSTITUTION_NUMBER_OF_COMMIT: Readonly<Record<string, number>> = { c0ffee5: 3, c0ffee6: 4 };

function documentsOf(loadedRecord: LoadedTicketDocumentRecord, effectReadings: readonly EffectReading[] = [EFFECT_READING]) {
  const askedCommits: string[] = [];
  const document = TicketDocumentsMappingUtil.ticketDocumentsOf({
    loadedRecord,
    factsOf:              (kind) => ({ reviewer: kind === 'spec' ? 'person' : 'pipeline', editable: kind === 'spec', agentJobId: kind === 'plan' ? 'J7' : null }),
    effectReadings,
    constitutionNumberOf: (commit) => {
      askedCommits.push(commit);
      return Object.hasOwn(CONSTITUTION_NUMBER_OF_COMMIT, commit) ? CONSTITUTION_NUMBER_OF_COMMIT[commit] ?? null : null;
    },
  });
  return { document, askedCommits };
}

describe('TicketDocumentsMappingUtil.ticketDocumentsOf', () => {
  const { document, askedCommits } = documentsOf(LOADED_RECORD);
  const [spec, plan] = document.documents;

  test('lists the spec, then the plan, whatever order the record holds them in', () => {
    expect(document.ticketId).toBe('004');
    expect(document.documents.map((each) => each.document)).toEqual(['spec', 'plan']);
  });

  test('maps the spec field by field, its head\'s text the Markdown, an absent optional field null', () => {
    expect(spec).toEqual({
      document:        'spec',
      standing:        'approved',
      reviewer:        'person',
      holdsAcceptance: true,
      editable:        true,
      proposalMode:    'auto-apply',
      head:            {
        number: 6, contentHash: hashOf(SPEC_SIX), author: 'person', jobId: null, at: AT, constitutionCommit: null, constitutionNumber: null
      },
      markdown: SPEC_SIX,
      versions: [
        {
          number: 5, contentHash: hashOf(SPEC_FIVE), author: 'agent', jobId: 'J4', at: AT, constitutionCommit: 'c0ffee5', constitutionNumber: 3
        },
        {
          number: 6, contentHash: hashOf(SPEC_SIX), author: 'person', jobId: null, at: AT, constitutionCommit: null, constitutionNumber: null
        },
      ],
      approvals: [
        {
          number: 5, contentHash: hashOf(SPEC_FIVE), by: 'person', at: AT, constitutionCommit: 'c0ffee5', constitutionNumber: 3, onSpecNumber: null, onSpecContentHash: null
        },
        {
          number: 6, contentHash: hashOf(SPEC_SIX), by: 'person', at: AT, constitutionCommit: 'c0ffee6', constitutionNumber: 4, onSpecNumber: null, onSpecContentHash: null
        },
      ],
      messages: [
        {
          messageId:     'M1',
          commentNumber: 1,
          anchor:        {
            view:             'preview',
            versionNumber:    5,
            lines:            { from: 5, to: 5 },
            columns:          { from: 1, to: 12 },
            sectionPath:      ['Outcome'],
            quote:            'Alex Example',
            surroundingLines: { from: 3, to: 7 },
            diagram:          {
              lines: { from: 5, to: 5 }, diagramKind: 'flowchart', nodeId: 'basket', nodeLabel: 'Basket'
            },
          },
          placement:      { from: 5, to: 5 },
          orphaned:       false,
          text:           'Name the total too.',
          from:           'person',
          state:          'applied',
          queuedAt:       AT,
          deliveryNumber: 1,
          agentTurn:      2,
        },
        {
          messageId:      'M2',
          commentNumber:  null,
          anchor:         null,
          placement:      null,
          orphaned:       true,
          text:           'The page reads the basket.',
          from:           'board',
          state:          'queued',
          queuedAt:       AT,
          deliveryNumber: null,
          agentTurn:      null,
        },
      ],
      proposals:  [],
      agentJobId: null,
      outOfDate:  null,
    });
  });

  test('a key the record gains reaches no reader', () => {
    expect(JSON.stringify(document)).not.toContain('addedLater');
  });

  test('asks the constitution number of each commit a version or an approval names, and of no other', () => {
    expect([...new Set(askedCommits)].sort()).toEqual(['c0ffee5', 'c0ffee6']);
  });

  test('a plan approved on an older spec is out of date, with the spec version it was approved on, the spec\'s head and the lines changed', () => {
    expect(plan?.standing).toBe('out-of-date');
    expect(plan?.outOfDate).toEqual({
      approvedOnSpecNumber: 5,
      specNumber:           6,
      specChanges:          [{
        originalFromLine:    5,
        originalLines:       ['Alex Example sees the basket.'],
        replacementFromLine: 5,
        replacementLines:    ['Alex Example sees the basket and its total.'],
      }],
    });
    expect([plan?.reviewer, plan?.holdsAcceptance, plan?.editable, plan?.agentJobId]).toEqual(['pipeline', false, false, 'J7']);
  });

  test('an open proposal covers the lines its edits stand on at the head, moved by the lines changed since its base, as applying it would', () => {
    expect(plan?.proposals.map((proposal) => [proposal.proposalId, proposal.headLines])).toEqual([
      ['P1', { from: 6, to: 6 }],
      ['P2', { from: 3, to: 2 }],
      ['P3', null],
      ['P4', null],
    ]);
  });

  test('maps a proposal field by field', () => {
    expect(plan?.proposals[0]).toEqual({
      proposalId: 'P1',
      jobId:      'J7',
      baseNumber: 1,
      edits:      [{
        fromLine: 4, toLine: 4, originalLines: ['2. Add the total.'], replacementLines: ['2. Add the total and the tax.']
      }],
      summary:          'Name the tax.',
      answersMessageId: 'M1',
      forSpecNumber:    6,
      state:            'proposed',
      appliedNumber:    null,
      at:               AT,
      headLines:        { from: 6, to: 6 },
    });
  });

  test('maps each effect reading field by field, without its ticket', () => {
    expect(document.effectReadings).toEqual([{
      document:             'plan',
      versionNumber:        2,
      state:                'read',
      durationMilliseconds: 1400,
      references:           [{ reference: 1, lines: { from: 5, to: 5 }, quote: 'Add the basket page.' }],
      entries:              [
        {
          reference: 1, path: 'src/pages/Basket.tsx', change: 'adds', detail: 'A new page.', unresolvedReason: null, candidates: []
        },
        {
          reference: 1, path: 'Basket', change: 'unresolved', detail: 'Two files match.', unresolvedReason: 'ambiguous', candidates: ['src/Basket.ts', 'web/Basket.ts']
        },
      ],
    }]);
  });

  test('a document the record does not hold yet reads unwritten, with no head and empty Markdown', () => {
    const specOnly = documentsOf({ ...LOADED_RECORD, record: { ...LOADED_RECORD.record, documents: [SPEC] } }, []).document;
    expect(specOnly.documents[1]).toEqual({
      document:        'plan',
      standing:        'unwritten',
      reviewer:        'pipeline',
      holdsAcceptance: false,
      editable:        false,
      proposalMode:    'ask-first',
      head:            null,
      markdown:        '',
      versions:        [],
      approvals:       [],
      messages:        [],
      proposals:       [],
      agentJobId:      'J7',
      outOfDate:       null,
    });
    expect(specOnly.effectReadings).toEqual([]);
  });
});

describe('TicketDocumentsMappingUtil.documentsSummaryOf', () => {
  test('carries each document\'s standing, its head\'s number and its newest approved number, and the hold as read', () => {
    expect(TicketDocumentsMappingUtil.documentsSummaryOf(LOADED_RECORD, true)).toEqual({
      spec:      { standing: 'approved', headNumber: 6, approvedNumber: 6 },
      plan:      { standing: 'out-of-date', headNumber: 2, approvedNumber: 2 },
      buildHeld: true,
    });
  });

  test('a document with no version has null numbers', () => {
    const specOnly = { ...LOADED_RECORD, record: { ...LOADED_RECORD.record, documents: [SPEC] } };
    expect(TicketDocumentsMappingUtil.documentsSummaryOf(specOnly, false).plan).toEqual({ standing: 'unwritten', headNumber: null, approvedNumber: null });
  });
});
