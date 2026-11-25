/**
 * One valid body of every board command kind the page sends, keyed by kind so a kind the contract gains is a compile error here until it
 * has an example; the draft edit's body carries every kind of typed edit. Test-only.
 */
import type { BoardCommandDocument, BoardCommandDocumentKind } from '../../../../page/@types/board/BoardCommandDocument.ts';
import type { BoardDraftEditDocument }                         from '../../../../page/@types/board/BoardPipelineDocuments.ts';
import type { BoardCommentAnchorDocument }                     from '../../../../page/@types/board/TicketDocumentsDocument.ts';
import type { BoardCommand }                                   from '../../../shared/@types/board/BoardCommand.ts';
import { PAGE_CONTRACT_VERSIONS }                              from '../../../shared/constants/PageContractVersions.ts';

type ExampleBodies = { readonly [Kind in BoardCommandDocumentKind]: Extract<BoardCommandDocument, { readonly kind: Kind }> };

const VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

export const EXAMPLE_DRAFT_EDITS: readonly BoardDraftEditDocument[] = [
  {
    target: 'gate',
    name:   'unit',
    value:  {
      name: 'unit', run: 'bun test', fix: 'bun run lint:fix', runsIn: '/apps/web', network: ['registry.example.com'], writes: []
    },
  },
  { target: 'gate', name: 'retired', value: null },
  { target: 'phase-order', phase: 'review', names: ['unit', 'lint'] },
  { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install', runsIn: null } },
  { target: 'prepare-order', names: ['install'] },
  { target: 'review', value: { name: 'review', reReview: { thresholdLines: 40 } } },
  { target: 'constitution', constitutionPath: 'docs/constitution.md' },
  {
    target: 'role',
    role:   'builder',
    value:  { model: 'opus', effort: 'high', instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }, { kind: 'file', path: 'docs/brief.md' }] },
  },
  { target: 'role', role: 'assistant', value: { model: null, effort: null, instructions: null } },
  {
    target: 'role',
    role:   'reviewer',
    value:  {
      model: null, effort: null, instructions: null, documents: { spec: 'always', plan: 'if-person-approved' }
    }
  },
  { target: 'role', role: 'specAgent', value: { model: 'sonnet', effort: 'medium', instructions: null } },
  { target: 'airlock', value: { reReview: null } },
  { target: 'tools', value: [{ name: 'bun', path: '/Users/example/.bun/bin/bun' }, { name: 'docker', path: null }] },
  { target: 'tools', value: null },
  { target: 'approval', approval: 'merge', value: true },
  { target: 'approval', approval: 'plan', value: false },
  { target: 'ticket-writing', value: 'spec-then-plan' },
  { target: 'ticket-writing', value: null },
  { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'], summary: null } },
  { target: 'entity', entityKey: 'retired', value: null },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'reviewer', value: { model: 'sonnet', effort: null, instructions: null } } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'reach', value: ['/packages/design-system'] } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: null } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: ['api'] } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: 2 } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'constitution', constitutionPath: null } },
];

/** A comment on a diagram node in Preview, which carries every key an anchor has. */
export const EXAMPLE_COMMENT_ANCHOR: BoardCommentAnchorDocument = {
  view:             'preview',
  versionNumber:    4,
  lines:            { from: 20, to: 20 },
  columns:          { from: 5, to: 18 },
  sectionPath:      ['Example spec', 'Behaviour'],
  quote:            'Theme[Read theme]',
  surroundingLines: { from: 17, to: 23 },
  diagram:          {
    lines: { from: 17, to: 23 }, diagramKind: 'flowchart', nodeId: 'Theme', nodeLabel: 'Read theme'
  },
};

export const EXAMPLE_BOARD_COMMAND_DOCUMENTS: ExampleBodies = {
  'hephaestus-pause':        { ...VERSION, kind: 'hephaestus-pause' },
  'hephaestus-unpause':      { ...VERSION, kind: 'hephaestus-unpause' },
  'hephaestus-stop':         { ...VERSION, kind: 'hephaestus-stop', now: false },
  'hephaestus-restart':      { ...VERSION, kind: 'hephaestus-restart', now: true },
  'concurrency-set':         { ...VERSION, kind: 'concurrency-set', limit: 3 },
  'interrupted-work-resume': { ...VERSION, kind: 'interrupted-work-resume', target: { ticketReference: '002' } },
  'chart-range-set':         {
    ...VERSION,
    kind:  'chart-range-set',
    range: {
      kind: 'window', from: 'start', to: 'now', tickMinutes: null
    }
  },
  'decision-answer': {
    ...VERSION, kind: 'decision-answer', decisionId: 'E2', answer: { form: 'letters', choices: ['a', 'bc'] }
  },
  'gate-profile-start': {
    ...VERSION, kind: 'gate-profile-start', setupId: null, gateName: 'unit', phase: 'build', entity: 'web'
  },
  'gate-profile-stop': { ...VERSION, kind: 'gate-profile-stop', profileRunId: 'P1' },
  'intake-close':      {
    ...VERSION, kind: 'intake-close', jobId: null, proposedDraftSets: [['D1', 'D2'], []]
  },
  'intake-start': {
    ...VERSION, kind: 'intake-start', text: 'Suggest searches as the shopper types.', pictures: [{ pictureId: 'a'.repeat(64), name: 'example-sketch.png' }]
  },
  'job-fresh': {
    ...VERSION, kind: 'job-fresh', jobId: 'J1', incidentId: 'I2'
  },
  'job-message': {
    ...VERSION, kind: 'job-message', jobId: 'J4', text: 'Use the example provider.', pictures: [], incidentId: null
  },
  'job-stop': {
    ...VERSION, kind: 'job-stop', jobId: 'J1', mode: 'wind-down'
  },
  'merge-accept':          { ...VERSION, kind: 'merge-accept', ticketId: '002' },
  'merge-update':          { ...VERSION, kind: 'merge-update', ticketId: '002' },
  'pipeline-agent-advise': { ...VERSION, kind: 'pipeline-agent-advise', entity: null },
  'pipeline-apply':        {
    ...VERSION, kind: 'pipeline-apply', setupId: 'S2', draftRevision: 4, resumesBoard: true
  },
  'pipeline-apply-cancel':      { ...VERSION, kind: 'pipeline-apply-cancel', setupId: 'S2' },
  'pipeline-assistant-set':     { ...VERSION, kind: 'pipeline-assistant-set', on: true },
  'pipeline-check':             { ...VERSION, kind: 'pipeline-check', setupId: 'S2' },
  'pipeline-constitution-edit': {
    ...VERSION,
    kind:        'pipeline-constitution-edit',
    setupId:     'S2',
    revision:    1,
    markdown:    '# Example constitution',
    draftedFrom: { contributing: true, research: false, installedDefault: true },
    entity:      'web',
  },
  'pipeline-draft-discard': { ...VERSION, kind: 'pipeline-draft-discard', setupId: 'S2' },
  'pipeline-draft-edit':    {
    ...VERSION, kind: 'pipeline-draft-edit', setupId: 'S2', draftRevision: 4, edits: EXAMPLE_DRAFT_EDITS, isACopy: false
  },
  'pipeline-draft-undo': {
    ...VERSION, kind: 'pipeline-draft-undo', setupId: 'S2', editId: 'X3', wholeBatch: true
  },
  'pipeline-setup-answer': {
    ...VERSION, kind: 'pipeline-setup-answer', setupId: 'S2', questionId: 'Q1', answer: { form: 'text', text: 'Bun, not Node.' }
  },
  'pipeline-setup-billing': {
    ...VERSION, kind: 'pipeline-setup-billing', setupId: 'S2', billing: { mode: 'api', maximumBudgetDollars: 12.5 }
  },
  'pipeline-setup-resume': { ...VERSION, kind: 'pipeline-setup-resume', setupId: 'S2' },
  'pipeline-setup-start':  {
    ...VERSION, kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, agent: null
  },
  'pipeline-setup-agent': {
    ...VERSION, kind: 'pipeline-setup-agent', setupId: 'S2', agent: { vendor: 'example-agent', program: { follows: 'machine' } }
  },
  'pipeline-agent-set':        { ...VERSION, kind: 'pipeline-agent-set', agent: { vendor: 'example-agent', program: { pinned: '/Users/example/.local/bin/example-agent' } } },
  'pipeline-tools-set':        { ...VERSION, kind: 'pipeline-tools-set', tools: [{ name: 'gh', path: null }] },
  'agent-look-again':          { ...VERSION, kind: 'agent-look-again' },
  'machine-agent-program-set': {
    ...VERSION, kind: 'machine-agent-program-set', vendor: 'example-agent', programPath: '/Users/example/.local/bin/example-agent'
  },
  'pipeline-setup-start-over': { ...VERSION, kind: 'pipeline-setup-start-over', setupId: 'S2' },
  'pipeline-setup-step':       {
    ...VERSION, kind: 'pipeline-setup-step', setupId: 'S2', step: 'entities', move: 'continue'
  },
  'pipeline-update-start':  { ...VERSION, kind: 'pipeline-update-start', entity: 'api' },
  'ticket-deliver-by-hand': {
    ...VERSION, kind: 'ticket-deliver-by-hand', ticketId: '002', branch: null, commit: '0123abc'
  },
  'ticket-hold': {
    ...VERSION, kind: 'ticket-hold', ticketId: '001', reason: 'Waits for the example provider.'
  },
  'ticket-network': {
    ...VERSION, kind: 'ticket-network', ticketId: '001', domains: ['api.example.com']
  },
  'ticket-park': {
    ...VERSION, kind: 'ticket-park', ticketId: '001', reason: 'Parked by the example.', incidentId: null
  },
  'ticket-priority': {
    ...VERSION, kind: 'ticket-priority', ticketId: '001', priority: 'high'
  },
  'ticket-ready':         { ...VERSION, kind: 'ticket-ready', ticketIds: ['001', '002'] },
  'ticket-unhold':        { ...VERSION, kind: 'ticket-unhold', ticketId: '001' },
  'tracker-clear':        { ...VERSION, kind: 'tracker-clear', scope: 'tasks-and-log' },
  'ticket-document-save': {
    ...VERSION, kind: 'ticket-document-save', ticketId: '004', document: 'spec', baseVersion: 4, markdown: '# Example spec\n\n## Outcome\n'
  },
  'ticket-document-comment': {
    ...VERSION, kind: 'ticket-document-comment', ticketId: '004', document: 'spec', anchor: EXAMPLE_COMMENT_ANCHOR, text: 'Name the theme tokens here.'
  },
  'ticket-document-comment-withdraw': {
    ...VERSION, kind: 'ticket-document-comment-withdraw', ticketId: '004', document: 'spec', messageId: 'M3'
  },
  'ticket-document-proposal-apply': {
    ...VERSION, kind: 'ticket-document-proposal-apply', ticketId: '004', document: 'plan', proposalId: 'P2', replacementLines: [['- Read the theme from tokens.'], []]
  },
  'ticket-document-proposal-discard': {
    ...VERSION, kind: 'ticket-document-proposal-discard', ticketId: '004', document: 'plan', proposalId: 'P1'
  },
  'ticket-document-mode-set': {
    ...VERSION, kind: 'ticket-document-mode-set', ticketId: '004', document: 'spec', mode: 'auto-apply'
  },
  'ticket-document-approve': {
    ...VERSION, kind: 'ticket-document-approve', ticketId: '004', document: 'spec', version: 5
  },
  'ticket-document-effect-read': {
    ...VERSION, kind: 'ticket-document-effect-read', ticketId: '004', document: 'plan', version: 2
  },
  'ticket-document-turn-stop': {
    ...VERSION, kind: 'ticket-document-turn-stop', ticketId: '004', document: 'plan'
  },
};

/** The model command each example body reads into: the same keys and values, without the page's version. */
export function exampleBoardCommandOf(document: BoardCommandDocument): BoardCommand {
  const { boardCommandVersion: _version, ...command } = document;
  return command;
}
