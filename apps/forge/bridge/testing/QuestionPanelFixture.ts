/**
 * Synthetic boards for the question panel's model and DOM specs: an agent's question on `#004 Account pages dark mode` with the
 * consequences its builder noted, the ticket's sections and Acceptance as text, a code-opened decision, a decision of two questions, and
 * the transcript entries of the asking job's tool calls.
 */
import type { DecisionDocument, HistoryRecordDocument } from '../@types/ConversationDocuments.ts';
import type { TranscriptEntryDocument }                 from '../api/TranscriptStreamClient.ts';
import type { QuestionPanelBoard, QuestionPanelTicket } from '../views/question-panel/QuestionPanelModel.ts';
import { EXAMPLE_TIMESTAMP_SLICES }                     from './TimestampSlicesFixture.ts';

/** The day the examples are read on, so a stamp from it shows its clock alone. */
export const EXAMPLE_TODAY = '2026-10-29';

export const EXAMPLE_FORMAT = { todayCalendarDate: EXAMPLE_TODAY, slices: EXAMPLE_TIMESTAMP_SLICES };

export const DARK_MODE_QUESTION: DecisionDocument = {
  id:        'E7',
  kind:      'agent-question',
  ticketIds: ['004'],
  jobId:     'J4',
  askedBy:   'builder',
  context:   'Acceptance A3 says no account component hard-codes a hex value, but src/account/Layout.tsx hard-codes six.',
  openedAt:  '2026-10-29T14:06:12+01:00',
  questions: [{
    question:    'Where should the account pages\' dark-mode colours live?',
    header:      'Tokens',
    multiSelect: false,
    options:     [
      {
        label:            'Extend the shared theme tokens',
        description:      'Add account entries to the token file every page reads.',
        isRecommended:    true,
        touches:          ['src/theme/tokens.css', 'src/account/Layout.tsx'],
        tradeOff:         'One place to change; the storefront reads the same file.',
        acceptanceEffect: 'meets A1 to A3 as written',
      },
      { label: 'A scoped stylesheet for the account pages', description: 'A new stylesheet only the account pages load.', isRecommended: false },
      {
        label: 'Follow the system setting only', description: '', isRecommended: false, acceptanceEffect: 'A2 fails: the ticket\'s Acceptance must change first'
      },
    ],
  }],
};

export const PARKED_DECISION: DecisionDocument = {
  id:        'E6',
  kind:      'parked',
  ticketIds: ['005'],
  jobId:     null,
  askedBy:   'overseer',
  context:   '',
  openedAt:  '2026-10-29T13:40:00+01:00',
  questions: [{
    question:    'Example Storefront parked #005. Resume it?',
    header:      'Parked',
    multiSelect: false,
    options:     [{ label: 'Resume', description: '', isRecommended: false }, { label: 'Abandon', description: '', isRecommended: false }],
  }],
};

export const TWO_QUESTION_DECISION: DecisionDocument = {
  ...DARK_MODE_QUESTION,
  id:        'E8',
  jobId:     'J2',
  ticketIds: ['006'],
  context:   '',
  openedAt:  '2026-10-29T14:10:00+01:00',
  questions: [
    {
      question:    'Which store?',
      header:      'Store',
      multiSelect: false,
      options:     [
        { label: 'Disk', description: '', isRecommended: false },
        { label: 'Memory', description: '', isRecommended: false },
      ]
    },
    {
      question:    'Which targets?',
      header:      'Targets',
      multiSelect: true,
      options:     [
        { label: 'main', description: '', isRecommended: false },
        { label: 'group', description: '', isRecommended: false },
      ]
    },
  ],
};

export function examplePanelTicket(id: string, fields: Partial<QuestionPanelTicket> = {}): QuestionPanelTicket {
  return {
    id, title: `Example ticket ${id}`, status: 'in-progress', ...fields
  };
}

export const DARK_MODE_TICKET: QuestionPanelTicket = examplePanelTicket('004', {
  title:    'Account pages dark mode',
  epics:    ['customer-account'],
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

/** `decision-opened` and `decision-answered` records: E3 on #004 answered, E2 on #009 answered, and the shown E7 opened. */
export const EARLIER_HISTORY: readonly HistoryRecordDocument[] = [
  {
    kind: 'decision-opened', at: '2026-10-29T13:40:00+01:00', decisionId: 'E3', fields: { kind: 'agent-question', ticketIds: ['004'] }
  },
  {
    kind: 'decision-opened', at: '2026-10-29T13:41:00+01:00', decisionId: 'E2', fields: { kind: 'agent-question', ticketIds: ['009'] }
  },
  {
    kind: 'decision-answered', at: '2026-10-29T13:45:00+01:00', decisionId: 'E2', fields: { answer: { 'Which store?': 'Disk' } }
  },
  {
    kind: 'decision-answered', at: '2026-10-29T13:52:00+01:00', decisionId: 'E3', fields: { answer: { 'Override control?': 'Auto · Light · Dark', 'Where?': 'account header' } }
  },
  {
    kind: 'decision-opened', at: '2026-10-29T14:06:12+01:00', decisionId: 'E7', fields: { kind: 'agent-question', ticketIds: ['004'] }
  },
];

export interface ExampleQuestionPanelBoardFields {
  readonly decisions?:       readonly DecisionDocument[];
  readonly tickets?:         readonly QuestionPanelTicket[];
  readonly questionHistory?: readonly HistoryRecordDocument[];
}

/** J4 builds #004 at call 38 of 150; #005 and #006 wait on #004, so it holds two. */
export function exampleQuestionPanelBoard(fields: ExampleQuestionPanelBoardFields = {}): QuestionPanelBoard {
  return {
    jobs:            [{ id: 'J4', live: { calls: 38, callBudget: 150 } }, { id: 'J2', live: { calls: 3, callBudget: null } }],
    decisions:       fields.decisions ?? [DARK_MODE_QUESTION],
    questionHistory: fields.questionHistory ?? EARLIER_HISTORY,
    page:            {
      tickets: fields.tickets ?? [
        DARK_MODE_TICKET,
        examplePanelTicket('005', { status: 'pending', dependsOn: ['004'] }),
        examplePanelTicket('006', { status: 'pending', dependsOn: ['005'] }),
      ],
      payload: { boardFacts: { epics: [{ key: 'customer-account', title: 'Customer account', slot: 2 }] } },
    },
  };
}

/** A top-level tool call of J4, or a subagent's when `parentToolUseId` is given. */
export function exampleToolCall(sequence: number, toolName: string, text: string, parentToolUseId?: string): TranscriptEntryDocument {
  return {
    cursor:    `1.${sequence}`,
    entryKey:  `1.${sequence}.0`,
    role:      'tool-call',
    text,
    at:        null,
    toolName,
    toolUseId: `tool-${sequence}`,
    asksUser:  false,
    ...(parentToolUseId === undefined ? {} : { parentToolUseId }),
  };
}

/** Seven calls of J4, a subagent's among them, ending with its question. */
export const ASKING_TRANSCRIPT: readonly TranscriptEntryDocument[] = [
  exampleToolCall(1, 'Read', 'src/theme/tokens.css'),
  exampleToolCall(2, 'Read', 'src/account/Layout.tsx'),
  exampleToolCall(3, 'Grep', '#[0-9a-f]{6} in src/account'),
  exampleToolCall(4, 'Read', 'docs/design/dark-tokens.json', 'tool-3'),
  exampleToolCall(5, 'Read', 'docs/design/dark-tokens.json'),
  exampleToolCall(6, 'Bash', 'git log -3 -- src/theme/tokens.css'),
  exampleToolCall(7, 'Glob', 'src/account/**/*.tsx'),
  { ...exampleToolCall(8, 'AskUserQuestion', '{"questions":[…]}'), asksUser: true },
];
