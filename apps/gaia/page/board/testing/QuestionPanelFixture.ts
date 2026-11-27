/**
 * Synthetic boards in the page's board contract for the question panel's model and DOM specs: an agent's question on `#004 Account pages
 * dark mode` with the consequences its builder noted and the recommendation the forge serves, the ticket's sections and Acceptance as text,
 * a code-opened decision, a decision of two questions, and the transcript entries of the asking job's tool calls. Test-only.
 */
import type { BoardDecisionDocument, BoardDecisionOptionDocument, BoardQuestionHistoryEntryDocument } from '../../@types/board/BoardDecisionDocuments.ts';
import type { BoardDocument }                                                                         from '../../@types/board/BoardDocument.ts';
import type { BoardEpicDocument, BoardTicketDocument }                                                from '../../@types/board/BoardTicketDocuments.ts';
import type { BoardTranscriptEntryDocument }                                                          from '../../@types/board/ConversationDocument.ts';
import {
  boardStateFixture,
  exampleAgentJob,
  examplePageTicketFacts,
  exampleTicket,
  OPEN_EPIC
} from './BoardStateFixture.ts';
import { EXAMPLE_TIMESTAMP_SLICES } from './TimestampSlicesFixture.ts';

/** The day the examples are read on, so a stamp from it shows its clock alone. */
export const EXAMPLE_TODAY = '2026-10-29';

export const EXAMPLE_FORMAT = { todayCalendarDate: EXAMPLE_TODAY, slices: EXAMPLE_TIMESTAMP_SLICES };

/** An option as the board serves it: not recommended, with no consequence noted, unless the changes say otherwise. */
export function exampleOption(changes: Partial<BoardDecisionOptionDocument> & Pick<BoardDecisionOptionDocument, 'label' | 'letter'>): BoardDecisionOptionDocument {
  return {
    description:      '',
    recommended:      false,
    touches:          [],
    tradeOff:         null,
    acceptanceEffect: null,
    ...changes,
  };
}

export const DARK_MODE_QUESTION: BoardDecisionDocument = {
  id:        'E7',
  kind:      'agent-question',
  ticketIds: ['004'],
  jobId:     'J4',
  askedBy:   'builder',
  context:   'Acceptance A3 says no account component hard-codes a hex value, but src/account/Layout.tsx hard-codes six.',
  openedAt:  '2026-10-29T14:06:12+01:00',
  document:  null,
  anchor:    null,
  placement: null,
  questions: [{
    question:    'Where should the account pages\' dark-mode colours live?',
    header:      'Tokens',
    multiSelect: false,
    options:     [
      exampleOption({
        letter:           'a',
        label:            'Extend the shared theme tokens',
        description:      'Add account entries to the token file every page reads.',
        recommended:      true,
        touches:          ['src/theme/tokens.css', 'src/account/Layout.tsx'],
        tradeOff:         'One place to change; the storefront reads the same file.',
        acceptanceEffect: 'meets A1 to A3 as written',
      }),
      exampleOption({ letter: 'b', label: 'A scoped stylesheet for the account pages', description: 'A new stylesheet only the account pages load.' }),
      exampleOption({ letter: 'c', label: 'Follow the system setting only', acceptanceEffect: 'A2 fails: the ticket\'s Acceptance must change first' }),
    ],
  }],
};

export const PARKED_DECISION: BoardDecisionDocument = {
  id:        'E6',
  kind:      'parked',
  ticketIds: ['005'],
  jobId:     null,
  askedBy:   'hephaestus',
  context:   '',
  openedAt:  '2026-10-29T13:40:00+01:00',
  document:  null,
  anchor:    null,
  placement: null,
  questions: [{
    question:    'Example Storefront parked #005. Resume it?',
    header:      'Parked',
    multiSelect: false,
    options:     [exampleOption({ letter: 'a', label: 'Resume' }), exampleOption({ letter: 'b', label: 'Abandon' })],
  }],
};

export const TWO_QUESTION_DECISION: BoardDecisionDocument = {
  ...DARK_MODE_QUESTION,
  id:        'E8',
  jobId:     'J2',
  ticketIds: ['006'],
  context:   '',
  openedAt:  '2026-10-29T14:10:00+01:00',
  questions: [
    {
      question: 'Which store?', header: 'Store', multiSelect: false, options: [exampleOption({ letter: 'a', label: 'Disk' }), exampleOption({ letter: 'b', label: 'Memory' })]
    },
    {
      question: 'Which targets?', header: 'Targets', multiSelect: true, options: [exampleOption({ letter: 'a', label: 'main' }), exampleOption({ letter: 'b', label: 'group' })]
    },
  ],
};

/** A ticket in progress with no body, no section and no Acceptance, unless the changes say otherwise. */
export function examplePanelTicket(id: string, changes: Partial<BoardTicketDocument> = {}): BoardTicketDocument {
  return exampleTicket({
    id, title: `Example ticket ${id}`, status: 'in-progress', bodyHtml: '', ...changes
  });
}

/** The epic #004 belongs to. */
export const CUSTOMER_ACCOUNT_EPIC: BoardEpicDocument = {
  ...OPEN_EPIC, key: 'customer-account', title: 'Customer account', slot: 2, ticketIds: ['004']
};

export const DARK_MODE_TICKET: BoardTicketDocument = examplePanelTicket('004', {
  title:    'Account pages dark mode',
  epics:    [CUSTOMER_ACCOUNT_EPIC.key],
  bodyHtml: '<h2>Wanted</h2><p>The account pages follow the system colour scheme.</p>',
  sections: [
    { heading: 'Wanted', markdown: 'The account pages follow the system colour scheme.\nAn override is remembered per browser.' },
    { heading: 'Brief', markdown: 'Work belongs in `src/account/**`.' },
  ],
  acceptanceItems: [
    { label: 'A1', text: 'Every account page follows the system colour scheme.', waived: false },
    { label: 'A2', text: 'An override is remembered per browser.', waived: false },
    { label: 'A3', text: 'No account component hard-codes a hex value.', waived: true },
  ],
});

/** A log record of a decision, with the fields the forge stored for it. */
export function decisionRecordOf(kind: string, at: string, decisionId: string, fields: Readonly<Record<string, unknown>>): BoardQuestionHistoryEntryDocument {
  return {
    kind, at, jobId: null, ticketId: null, decisionId, incidentId: null, fields
  };
}

/** `decision-opened` and `decision-answered` records: `E3` on #004 answered, `E2` on #009 answered, and the shown `E7` opened. */
export const EARLIER_HISTORY: readonly BoardQuestionHistoryEntryDocument[] = [
  decisionRecordOf('decision-opened', '2026-10-29T13:40:00+01:00', 'E3', { kind: 'agent-question', ticketIds: ['004'] }),
  decisionRecordOf('decision-opened', '2026-10-29T13:41:00+01:00', 'E2', { kind: 'agent-question', ticketIds: ['009'] }),
  decisionRecordOf('decision-answered', '2026-10-29T13:45:00+01:00', 'E2', { answer: { 'Which store?': 'Disk' } }),
  decisionRecordOf('decision-answered', '2026-10-29T13:52:00+01:00', 'E3', { answer: { 'Override control?': 'Auto · Light · Dark', 'Where?': 'account header' } }),
  decisionRecordOf('decision-opened', '2026-10-29T14:06:12+01:00', 'E7', { kind: 'agent-question', ticketIds: ['004'] }),
];

const EXAMPLE_LIVE_FACTS = exampleAgentJob({ id: 'J1' }).live;

export interface ExampleQuestionPanelBoardFields {
  readonly decisions?:            readonly BoardDecisionDocument[];
  readonly tickets?:              readonly BoardTicketDocument[];
  readonly questionHistory?:      readonly BoardQuestionHistoryEntryDocument[];
  readonly escalatedDecisionIds?: readonly string[];
}

/**
 * `J4` builds #004 at call 38 of 150; #005 and #006 wait on #004, so it holds two. The decisions are open in the order given, which is the
 * answering order the forge serves.
 */
export function exampleQuestionPanelBoard(fields: ExampleQuestionPanelBoardFields = {}): BoardDocument {
  const fixture = boardStateFixture();
  const decisions = fields.decisions ?? [DARK_MODE_QUESTION];
  const tickets = fields.tickets ?? [
    DARK_MODE_TICKET,
    examplePanelTicket('005', { status: 'committed', dependsOn: ['004'] }),
    examplePanelTicket('006', { status: 'committed', dependsOn: ['005'] }),
  ];
  return boardStateFixture({
    jobs: [
      exampleAgentJob({ id: 'J4', live: { ...EXAMPLE_LIVE_FACTS, calls: 38, callBudget: 150 } }),
      exampleAgentJob({ id: 'J2', live: { ...EXAMPLE_LIVE_FACTS, calls: 3, callBudget: null } }),
    ],
    decisions,
    openDecisionIds:      decisions.map((decision) => decision.id),
    escalatedDecisionIds: fields.escalatedDecisionIds ?? [],
    questionHistory:      fields.questionHistory ?? EARLIER_HISTORY,
    page:                 {
      ...fixture.page,
      tickets,
      facts: { ...fixture.page.facts, tickets: tickets.map(examplePageTicketFacts), epics: [CUSTOMER_ACCOUNT_EPIC] },
    },
  });
}

/** A top-level tool call of `J4`, or a subagent's when `parentToolUseId` is given. */
export function exampleToolCall(sequence: number, toolName: string, text: string, parentToolUseId: string | null = null): BoardTranscriptEntryDocument {
  return {
    cursor:       `1.${sequence}`,
    entryKey:     `1.${sequence}.0`,
    role:         'tool-call',
    text,
    at:           null,
    toolName,
    parentToolUseId,
    toolUseId:    `tool-${sequence}`,
    asksUser:     false,
    model:        null,
    tokens:       null,
    clientAct:    null,
    sentBy:       null,
    chatSequence: null,
    incidentIds:  [],
    pictures:     [],
  };
}

/** Seven calls of `J4`, a subagent's among them, ending with its question. */
export const ASKING_TRANSCRIPT: readonly BoardTranscriptEntryDocument[] = [
  exampleToolCall(1, 'Read', 'src/theme/tokens.css'),
  exampleToolCall(2, 'Read', 'src/account/Layout.tsx'),
  exampleToolCall(3, 'Grep', '#[0-9a-f]{6} in src/account'),
  exampleToolCall(4, 'Read', 'docs/design/dark-tokens.json', 'tool-3'),
  exampleToolCall(5, 'Read', 'docs/design/dark-tokens.json'),
  exampleToolCall(6, 'Bash', 'git log -3 -- src/theme/tokens.css'),
  exampleToolCall(7, 'Glob', 'src/account/**/*.tsx'),
  { ...exampleToolCall(8, 'AskUserQuestion', '{"questions":[…]}'), asksUser: true },
];
