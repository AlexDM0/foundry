/**
 * Ticket #004's spec and plan in the states the document artboards draw: the spec drafted with a comment applied and one the agent
 * answers, its edit proposed, User typing in Split while the agent works with a comment queued, the plan with its effect reading, and the
 * plan out of date under a newer spec. Each state is the documents Gaia's relay serves, with the agent's transcript beside it. Test-only.
 */
import type { BoardDocument }                from '../../@types/board/BoardDocument.ts';
import type { BoardTicketDocument }          from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardTranscriptEntryDocument } from '../../@types/board/ConversationDocument.ts';
import type {
  BoardCommentAnchorDocument,
  BoardDocumentApprovalDocument,
  BoardDocumentMessageDocument,
  BoardDocumentProposalDocument,
  BoardDocumentVersionDocument,
  BoardEffectReadingDocument,
  BoardTicketDocumentDocument,
  GaiaTicketDocumentsDocument
} from '../../@types/board/TicketDocumentsDocument.ts';
import { boardStateFixture, exampleTicket } from './BoardStateFixture.ts';
import { exampleTranscriptEntry }           from './TranscriptEntryFixture.ts';

export const DOCUMENTS_TICKET_ID = '004';

export const DOCUMENTS_PROJECT = 'Example Storefront';

export const SPEC_AGENT_JOB_ID = 'J31';

export const PLAN_AGENT_JOB_ID = 'J34';

const OPEN_QUESTION = '- Does the saved choice (dashed in the diagram) exist yet, or does this ticket add it?';

export const SPEC_MARKDOWN = [
  '# Account pages dark mode',
  '',
  '> Ticket #004 · Example Storefront · spec v4',
  '',
  '## 1 Problem',
  '',
  'The account pages ignore the system\'s dark setting. Everything else in the storefront follows it, so `/account` flashes white at night.',
  '',
  '## 2 Outcome',
  '',
  'Every page under `/account` follows the visitor\'s system colour scheme, with no white flash on load.',
  '',
  '## 3 Behaviour',
  '',
  'The theme resolves once, before the first paint, from the system setting. With no setting the page falls back to light.',
  '',
  '```mermaid Theme flow',
  'flowchart LR',
  '  System[System setting] --> Resolver[Theme resolver]',
  '  Stored[Saved choice] -.-> Resolver',
  '  Resolver --> Paint[First paint]',
  '  Paint --> Account[Account pages]',
  '```',
  '',
  '## 4 Acceptance',
  '',
  '- [ ] **A1** With the system set to dark, `/account` paints dark on its first frame.',
  '- [ ] **A2** Switching the system setting re-themes an open page within one frame.',
  '- [ ] **A3** Every account page passes 4.5:1 contrast in both themes.',
  '- [ ] **A4** Order history images keep their own colours.',
  '',
  '## 5 Out of scope',
  '',
  '- A theme toggle in the account menu (a later ticket).',
  '- Email templates.',
  '',
  '## 6 Open questions',
  '',
  OPEN_QUESTION,
].join('\n');

const A3_BEFORE = '- [ ] **A3** Every account page passes 4.5:1 contrast in both themes.';

const A3_AFTER = '- [ ] **A3** `bun run check:contrast` reports no text pair under 4.5:1 on any `/account` page, in light and in dark.';

const A2_BEFORE = '- [ ] **A2** Switching the system setting re-themes an open page within one frame.';

const A2_AFTER = '- [ ] **A2** Switching the system setting re-themes an open page within 100 ms, without a reload.';

export const SPEC_MARKDOWN_V6 = SPEC_MARKDOWN.replace(A3_BEFORE, A3_AFTER).replace('(a later ticket)', '(ticket #011)').replace('spec v4', 'spec v6');

export const PLAN_MARKDOWN = [
  '# Plan · Account pages dark mode',
  '',
  '## Approach',
  '',
  'We resolve the theme before the first paint with a small script in the document head, so no account page renders light first.',
  '',
  '## Changes',
  '',
  '- Add a `ThemeResolver.ts` next to the other theme code in `src/theme/`. It reads `prefers-color-scheme` and sets `data-theme` on the root.',
  '- Add a few functions to `utils/networkUtil.ts` to read and store the saved choice: `fetchThemeChoice`, `storeThemeChoice`.',
  '- Modify the profile contract and bump it to v2 with this data model: `ProfileV2 { id, themeChoice }`.',
  '- Each page under `pages/account/` drops its hard-coded colours.',
  '- Remove `light-only.css`; the tokens replace it.',
  '- Put the theme switch on the settings page, hidden until the toggle ticket ships.',
  '',
  '## Order',
  '',
  '1. Contract v2, so the network functions have a type to return.',
  '2. Resolver, then the pages; A1 and A2 can be checked after this step.',
  '3. Remove the stylesheet last.',
].join('\n');

const PLAN_STEP_TWO = '2. Resolver, then the pages; A1 and A2 can be checked after this step.';

const PLAN_STEP_TWO_FOR_SPEC_SIX = '2. Resolver, then the pages. The resolver swaps `data-theme` in place on a `change`, so A2\'s 100 ms holds without a reload.';

/** The line, from 1, that holds the text first. */
export function lineOf(markdown: string, text: string): number {
  return markdown.split('\n').findIndex((line) => line.includes(text)) + 1;
}

function lines(from: number, to: number = from) {
  return { from, to };
}

function version(number: number, author: 'person' | 'agent', at: string, constitutionNumber: number | null = null): BoardDocumentVersionDocument {
  return {
    number,
    contentHash:        `hash-${author}-${number}`,
    author,
    jobId:              author === 'agent' ? SPEC_AGENT_JOB_ID : null,
    at,
    constitutionCommit: constitutionNumber === null ? null : 'c0ffee1',
    constitutionNumber,
  };
}

function approval(number: number, at: string, onSpecNumber: number | null = null): BoardDocumentApprovalDocument {
  return {
    number,
    contentHash:        `hash-approved-${number}`,
    by:                 'person',
    at,
    constitutionCommit: 'c0ffee1',
    constitutionNumber: 3,
    onSpecNumber,
    onSpecContentHash:  onSpecNumber === null ? null : `hash-spec-${onSpecNumber}`,
  };
}

function previewAnchor(versionNumber: number, line: number, sectionPath: readonly string[], quote: string): BoardCommentAnchorDocument {
  return {
    view: 'preview', versionNumber, lines: lines(line), columns: null, sectionPath, quote, surroundingLines: lines(Math.max(1, line - 2), line + 2), diagram: null,
  };
}

type MessageFields = Partial<BoardDocumentMessageDocument> & Pick<BoardDocumentMessageDocument, 'messageId' | 'text'>;

function message(fields: MessageFields): BoardDocumentMessageDocument {
  return {
    commentNumber:  null,
    anchor:         null,
    placement:      null,
    orphaned:       false,
    from:           'person',
    state:          'sent',
    queuedAt:       '2026-11-24T12:40:00',
    deliveryNumber: null,
    agentTurn:      null,
    ...fields,
  };
}

const C1_LINE = lineOf(SPEC_MARKDOWN, 'With no setting the page falls back to light.');

const A3_LINE = lineOf(SPEC_MARKDOWN, '**A3**');

const REQUEST = message({
  messageId: 'M1', text: 'Spec for dark mode on the account pages. Follow the system setting; a toggle can come later.', agentTurn: 1, deliveryNumber: 1
});

const C1 = message({
  messageId:      'M2',
  commentNumber:  1,
  anchor:         previewAnchor(3, C1_LINE, ['3 Behaviour'], 'With no setting the page falls back to light.'),
  placement:      lines(C1_LINE),
  text:           'And someone who picked dark on the old site?',
  state:          'applied',
  agentTurn:      2,
  deliveryNumber: 2,
});

const C2_ANCHOR = previewAnchor(4, A3_LINE, ['4 Acceptance', 'A3'], 'Every account page passes 4.5:1 contrast in both themes.');

const C2 = message({
  messageId: 'M3', commentNumber: 2, anchor: C2_ANCHOR, placement: lines(A3_LINE), text: 'How would a reviewer check this? Name the check.', agentTurn: 3, deliveryNumber: 3,
});

function proposal(fields: Partial<BoardDocumentProposalDocument> & Pick<BoardDocumentProposalDocument, 'proposalId' | 'edits'>): BoardDocumentProposalDocument {
  return {
    jobId:            SPEC_AGENT_JOB_ID,
    baseNumber:       null,
    summary:          '',
    answersMessageId: null,
    forSpecNumber:    null,
    state:            'applied',
    appliedNumber:    null,
    at:               '2026-11-24T12:30:00',
    headLines:        null,
    ...fields,
  };
}

const FIRST_DRAFT = proposal({
  proposalId:       'P1',
  answersMessageId: 'M1',
  appliedNumber:    1,
  edits:            [{
    fromLine: 1, toLine: 0, originalLines: [], replacementLines: SPEC_MARKDOWN.split('\n').slice(0, 35)
  }],
});

const SAVED_CHOICE_EDIT = proposal({
  proposalId:       'P2',
  baseNumber:       3,
  answersMessageId: 'M2',
  appliedNumber:    4,
  edits:            [
    {
      fromLine: 20, toLine: 19, originalLines: [], replacementLines: ['  Stored[Saved choice] -.-> Resolver']
    },
    {
      fromLine: 37, toLine: 36, originalLines: [], replacementLines: ['## 6 Open questions', '', OPEN_QUESTION]
    },
  ],
});

const CONTRAST_EDIT_PROPOSED = proposal({
  proposalId:       'P3',
  baseNumber:       4,
  answersMessageId: 'M3',
  state:            'proposed',
  summary:          'A3 names the contrast check.',
  headLines:        lines(A3_LINE),
  edits:            [{
    fromLine: A3_LINE, toLine: A3_LINE, originalLines: [A3_BEFORE], replacementLines: [A3_AFTER]
  }],
});

function specDocument(fields: Partial<BoardTicketDocumentDocument>): BoardTicketDocumentDocument {
  return {
    document:        'spec',
    standing:        'drafting',
    reviewer:        'person',
    holdsAcceptance: true,
    editable:        true,
    proposalMode:    'ask-first',
    head:            version(4, 'agent', '2026-11-24T13:05:00'),
    markdown:        SPEC_MARKDOWN,
    versions:        [1, 2, 3, 4].map((number) => version(number, 'agent', '2026-11-24T13:05:00')),
    approvals:       [],
    messages:        [REQUEST, C1, C2],
    proposals:       [FIRST_DRAFT, SAVED_CHOICE_EDIT],
    agentJobId:      SPEC_AGENT_JOB_ID,
    outOfDate:       null,
    ...fields,
  };
}

function unwrittenPlan(fields: Partial<BoardTicketDocumentDocument> = {}): BoardTicketDocumentDocument {
  return {
    document:        'plan',
    standing:        'unwritten',
    reviewer:        'person',
    holdsAcceptance: false,
    editable:        true,
    proposalMode:    'ask-first',
    head:            null,
    markdown:        '',
    versions:        [],
    approvals:       [],
    messages:        [],
    proposals:       [],
    agentJobId:      null,
    outOfDate:       null,
    ...fields,
  };
}

function documentsOf(
  spec: BoardTicketDocumentDocument,
  plan: BoardTicketDocumentDocument,
  effectReadings: readonly BoardEffectReadingDocument[] = [],
): GaiaTicketDocumentsDocument {
  return {
    ticketDocumentsVersion: 1, ticketId: DOCUMENTS_TICKET_ID, documents: [spec, plan], effectReadings,
  };
}

function entry(cursor: number, role: string, text: string, fields: Partial<BoardTranscriptEntryDocument> = {}): BoardTranscriptEntryDocument {
  return exampleTranscriptEntry({
    cursor: `1.${cursor}`, role, text, ...fields
  });
}

/** The spec agent's first three turns: the first draft, the saved choice for C1, and C2 begun, reading `package.json`. */
export const SPEC_TRANSCRIPT_WORKING: readonly BoardTranscriptEntryDocument[] = [
  entry(1, 'user', 'Write the spec.'),
  entry(2, 'assistant', 'Drafted v1: problem, outcome, behaviour with a theme-flow diagram, four acceptance checks and what stays out.'),
  entry(3, 'turn-end', ''),
  entry(4, 'user', '{"comment":"C1"}'),
  entry(5, 'assistant', 'The repo has no saved theme choice yet. I added Saved choice to the diagram, dashed, and listed it as an open question instead of guessing.'),
  entry(6, 'turn-end', ''),
  entry(7, 'user', '{"comment":"C2"}'),
  entry(8, 'tool-call', '{"file_path":"package.json"}', { toolName: 'Read', toolUseId: 'T1' }),
];

/** The same, with C2's turn ended on the proposed edit. */
export const SPEC_TRANSCRIPT_IDLE: readonly BoardTranscriptEntryDocument[] = [
  ...SPEC_TRANSCRIPT_WORKING,
  entry(9, 'tool-result', '{"scripts":{"check:contrast":"bun scripts/contrast.ts"}}', { toolUseId: 'T1' }),
  entry(10, 'assistant', 'The repo has check:contrast in package.json; it already scans routes by glob. A3 now names it, so a reviewer runs one command.'),
  entry(11, 'turn-end', ''),
];

const C3_SPLIT = message({
  messageId:     'M4',
  commentNumber: 3,
  anchor:        {
    view: 'code', versionNumber: 5, lines: lines(17, 23), columns: null, sectionPath: ['3 Behaviour'], quote: null, surroundingLines: lines(15, 25), diagram: null,
  },
  placement:      lines(17, 23),
  text:           'Server-rendered pages paint before the resolver runs. Put the server path in the flow.',
  agentTurn:      4,
  deliveryNumber: 4,
});

const C4_QUEUED = message({
  messageId:     'M5',
  commentNumber: 4,
  anchor:        previewAnchor(6, 39, ['6 Open questions'], 'Does the saved choice (dashed in the diagram) exist yet, or does this ticket add it?'),
  placement:     lines(39),
  text:          'Check the repo for a saved theme before asking me.',
  state:         'queued',
});

/** C3 in Split: the agent reads the server's render for C3 while User types on line 34. */
export const SPEC_TRANSCRIPT_SPLIT: readonly BoardTranscriptEntryDocument[] = [
  ...SPEC_TRANSCRIPT_IDLE,
  entry(12, 'user', '{"comment":"C3"}'),
  entry(13, 'tool-call', '{"file_path":"apps/storefront/server/render.ts"}', { toolName: 'Read', toolUseId: 'T2' }),
];

const PLAN_REFERENCES = [
  { reference: 1, text: 'ThemeResolver.ts' },
  { reference: 2, text: 'utils/networkUtil.ts' },
  { reference: 3, text: 'profile contract' },
  { reference: 4, text: 'pages/account/' },
  { reference: 5, text: 'light-only.css' },
  { reference: 6, text: 'the settings page' },
] as const;

export const PLAN_EFFECT_READING: BoardEffectReadingDocument = {
  document:             'plan',
  versionNumber:        2,
  state:                'read',
  durationMilliseconds: 1400,
  references:           PLAN_REFERENCES.map(({ reference, text }) => ({ reference, lines: lines(lineOf(PLAN_MARKDOWN, text)), quote: text })),
  entries:              [
    {
      reference: 1, path: 'apps/storefront/src/theme/ThemeResolver.ts', change: 'adds', detail: 'The theme resolver', unresolvedReason: null, candidates: [],
    },
    {
      reference:        2,
      path:             'utils/networkUtil.ts',
      change:           'unresolved',
      detail:           'Read and store the saved choice',
      unresolvedReason: 'ambiguous',
      candidates:       ['apps/storefront/src/utils/networkUtil.ts', 'packages/shared/utils/networkUtil.ts'],
    },
    {
      reference: 3, path: 'packages/contracts/profile.ts', change: 'changes', detail: '→ v2', unresolvedReason: null, candidates: [],
    },
    {
      reference: 4, path: 'apps/storefront/src/pages/account/index.tsx', change: 'changes', detail: 'every page, 7 files', unresolvedReason: null, candidates: [],
    },
    {
      reference: 5, path: 'apps/storefront/src/legacy/light-only.css', change: 'removes', detail: 'The light-only stylesheet', unresolvedReason: null, candidates: [],
    },
    {
      reference: 6, path: 'the settings page', change: 'unresolved', detail: 'The theme switch', unresolvedReason: 'no-match', candidates: [],
    },
  ],
};

const APPROVED_SPEC_V5 = specDocument({
  standing:   'approved',
  head:       version(5, 'person', '2026-11-24T13:38:00'),
  markdown:   SPEC_MARKDOWN.replace(A3_BEFORE, A3_AFTER).replace('spec v4', 'spec v5'),
  approvals:  [approval(5, '2026-11-24T13:40:00')],
  messages:   [REQUEST, C1, { ...C2, state: 'applied' }],
  proposals:  [FIRST_DRAFT, SAVED_CHOICE_EDIT, { ...CONTRAST_EDIT_PROPOSED, state: 'applied', appliedNumber: 5 }],
  agentJobId: null,
});

const SHOW_EFFECT = message({
  messageId: 'M1', text: 'Show me what this touches.', agentTurn: 2, deliveryNumber: 2
});

/** The plan agent's two turns: plan v2, then the effect reading it called for User. */
export const PLAN_TRANSCRIPT: readonly BoardTranscriptEntryDocument[] = [
  entry(1, 'user', 'Write the plan.'),
  entry(2, 'assistant', 'Plan v2 covers A1 to A4 in three steps. It changes one contract, so it goes first.'),
  entry(3, 'turn-end', ''),
  entry(4, 'user', 'Show me what this touches.'),
  entry(5, 'assistant', 'Two sentences point nowhere precise. A builder reading this would have to guess too. Want me to fix the wording?'),
  entry(6, 'turn-end', ''),
];

const PLAN_V2 = unwrittenPlan({
  standing:   'drafting',
  head:       { ...version(2, 'agent', '2026-11-24T14:02:00', 3), jobId: PLAN_AGENT_JOB_ID },
  markdown:   PLAN_MARKDOWN,
  versions:   [version(1, 'agent', '2026-11-24T13:55:00', 3), version(2, 'agent', '2026-11-24T14:02:00', 3)],
  messages:   [SHOW_EFFECT],
  agentJobId: PLAN_AGENT_JOB_ID,
});

const A2_LINE = lineOf(SPEC_MARKDOWN, '**A2**');

const STEP_TWO_LINE = lineOf(PLAN_MARKDOWN, PLAN_STEP_TWO);

const PLAN_OUT_OF_DATE = unwrittenPlan({
  standing:   'out-of-date',
  head:       { ...version(3, 'agent', '2026-11-24T14:20:00', 3), jobId: PLAN_AGENT_JOB_ID },
  markdown:   PLAN_MARKDOWN,
  versions:   [1, 2, 3].map((number) => version(number, 'agent', '2026-11-24T14:20:00', 3)),
  approvals:  [approval(3, '2026-11-24T14:30:00', 5)],
  agentJobId: PLAN_AGENT_JOB_ID,
  outOfDate:  {
    approvedOnSpecNumber: 5,
    specNumber:           6,
    specChanges:          [{
      originalFromLine: A2_LINE, originalLines: [A2_BEFORE], replacementFromLine: A2_LINE, replacementLines: [A2_AFTER]
    }],
  },
  proposals: [{
    proposalId: 'P1',
    jobId:      PLAN_AGENT_JOB_ID,
    baseNumber: 3,
    edits:      [{
      fromLine: STEP_TWO_LINE, toLine: STEP_TWO_LINE, originalLines: [PLAN_STEP_TWO], replacementLines: [PLAN_STEP_TWO_FOR_SPEC_SIX]
    }],
    summary:          'Step 2 holds A2\'s 100 ms.',
    answersMessageId: null,
    forSpecNumber:    6,
    state:            'proposed',
    appliedNumber:    null,
    at:               '2026-11-24T15:13:00',
    headLines:        lines(STEP_TWO_LINE),
  }],
});

/** Spec v6 moved A2 under plan v3, which was approved on spec v5. */
export const PLAN_OUT_OF_DATE_TRANSCRIPT: readonly BoardTranscriptEntryDocument[] = [
  entry(1, 'user', 'The spec moved.'),
  entry(2, 'assistant', 'Only A2 changed. Step 2 is the one place the plan depends on it, so I propose one edit there. The rest of the plan still holds on v6.'),
  entry(3, 'turn-end', ''),
];

export const DOCUMENT_STATES = {
  /** Artboard 1: the agent answers C2, reading `package.json`. */
  specWorking: documentsOf(specDocument({}), unwrittenPlan()),
  /** Artboards 2 and 3: the agent idle with its edit for C2 proposed. */
  specIdle:    documentsOf(specDocument({ proposals: [FIRST_DRAFT, SAVED_CHOICE_EDIT, CONTRAST_EDIT_PROPOSED] }), unwrittenPlan()),
  /** Artboard 5: spec v6 with C2 applied, the agent on C3 started on v5, C4 queued. */
  specSplit:   documentsOf(specDocument({
    head:      version(6, 'person', '2026-11-24T15:01:00'),
    markdown:  SPEC_MARKDOWN_V6,
    messages:  [REQUEST, C1, { ...C2, state: 'applied', placement: lines(A3_LINE) }, C3_SPLIT, C4_QUEUED],
    proposals: [FIRST_DRAFT, SAVED_CHOICE_EDIT, { ...CONTRAST_EDIT_PROPOSED, state: 'applied', appliedNumber: 5 }],
  }), unwrittenPlan()),
  /** Artboard 7: the spec approved at v5, plan v2 with its effect reading. */
  plan:          documentsOf(APPROVED_SPEC_V5, PLAN_V2, [PLAN_EFFECT_READING]),
  /** Artboard 8: spec v6 approved, plan v3 out of date with the plan agent's edit for v6. */
  planOutOfDate: documentsOf({
    ...APPROVED_SPEC_V5,
    head:      version(6, 'person', '2026-11-24T15:12:00'),
    markdown:  SPEC_MARKDOWN_V6.replace(A2_BEFORE, A2_AFTER),
    approvals: [approval(5, '2026-11-24T13:40:00'), approval(6, '2026-11-24T15:12:00')],
  }, PLAN_OUT_OF_DATE),
} as const;

export const SPEC_ANCHOR_OF_C2 = C2_ANCHOR;

export function documentsTicketOf(status: BoardTicketDocument['status'] = 'draft', buildHeld = false): BoardTicketDocument {
  return exampleTicket({
    id:        DOCUMENTS_TICKET_ID,
    title:     'Account pages dark mode',
    status,
    documents: {
      spec: { standing: 'drafting', headNumber: 4, approvedNumber: null },
      plan: { standing: 'unwritten', headNumber: null, approvedNumber: null },
      buildHeld,
    },
  });
}

export function documentsBoardOf(ticket: BoardTicketDocument = documentsTicketOf()): BoardDocument {
  const board = boardStateFixture({ project: DOCUMENTS_PROJECT });
  return { ...board, page: { ...board.page, tickets: [...board.page.tickets, ticket] } };
}
