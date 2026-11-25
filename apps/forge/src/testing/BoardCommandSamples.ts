/**
 * One body of each board command kind of the contract, the ticket document kinds included, with every optional field it takes, and one
 * typed draft edit of each target: what the board commands' reading and mapping specs read and map.
 */
import type { ForgeBoardCommand, ForgeTicketDocumentCommand } from 'forge-contracts/BoardCommand';
import type { PipelineDraftEditDocument }                     from 'forge-contracts/BoardPipelineDocuments';
import type { CommentAnchorDocument }                         from 'forge-contracts/TicketDocumentsDocument';

type BoardContractCommand = ForgeBoardCommand | ForgeTicketDocumentCommand;

type BoardCommandSamples = { readonly [Kind in BoardContractCommand['kind']]: Extract<BoardContractCommand, { kind: Kind }> };

/** A comment on a mermaid node in Preview, with every optional key of an anchor. */
export const COMMENT_ANCHOR_SAMPLE: CommentAnchorDocument = {
  view:             'preview',
  versionNumber:    4,
  lines:            { from: 20, to: 22 },
  columns:          { from: 3, to: 18 },
  sectionPath:      ['3 Behaviour', 'Theme flow'],
  quote:            'Theme toggled',
  surroundingLines: { from: 17, to: 25 },
  diagram:          {
    lines: { from: 20, to: 20 }, diagramKind: 'flowchart', nodeId: 'toggle', nodeLabel: 'Theme toggled'
  },
};

export const DRAFT_EDIT_SAMPLES: readonly PipelineDraftEditDocument[] = [
  {
    target: 'gate',
    name:   'test',
    value:  {
      name: 'test', run: 'bun test', fix: 'bun run lint:fix', in: '/apps/web', definedBy: ['bunfig.toml'], network: ['registry.npmjs.org'], writes: ['~/.cache'], forgeOnly: true
    },
  },
  { target: 'gate', name: 'lint', value: null },
  { target: 'phase-order', phase: 'merge', names: ['test', 'lint'] },
  { target: 'prepare', name: 'install', value: { name: 'install', run: 'bun install', in: '/apps/web' } },
  { target: 'prepare-order', names: ['install'] },
  { target: 'review', value: { name: 'review', reReview: { thresholdLines: 40 } } },
  { target: 'constitution', value: { path: 'CONSTITUTION.md' } },
  {
    target: 'role',
    role:   'assistant',
    value:  { model: 'opus', effort: 'high', instructions: [{ kind: 'constitution' }, { kind: 'default-brief', role: 'assistant' }, { kind: 'file', path: 'docs/brief.md' }] },
  },
  {
    target: 'role',
    role:   'builder',
    value:  { model: 'opus', documents: { spec: 'always', plan: 'never' } },
  },
  { target: 'airlock', value: { reReview: { thresholdLines: 750 } } },
  { target: 'tools', value: [{ name: 'bun', path: '/opt/example/bin/bun' }] },
  { target: 'approval', approval: 'merge', value: true },
  { target: 'entity', entityKey: 'web', value: { kind: 'app', home: ['/apps/web'], summary: 'The example shop.' } },
  { target: 'entity', entityKey: 'docs', value: null },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'gate', name: 'test', value: { name: 'test', run: 'bun test' } } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'builder', value: { model: 'sonnet' } } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'role', role: 'reviewer', value: { effort: 'high', documents: { plan: 'always' } } } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'whitelist', value: ['design-system'] } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'reach', value: ['/bun.lock'] } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'depends-on', value: null } },
  { target: 'within-entity', entityKey: 'web', edit: { target: 'concurrency', value: 2 } },
];

export const BOARD_COMMAND_SAMPLES: BoardCommandSamples = {
  'chart-range-set': {
    kind:  'chart-range-set',
    range: {
      kind: 'window', from: '-4h', to: 'now', tickMinutes: 30
    }
  },
  'decision-answer':    { kind: 'decision-answer', decisionId: 'D1', answer: { form: 'letters', choices: ['a', 'bc'] } },
  'gate-profile-start': {
    kind: 'gate-profile-start', setupId: null, gateName: 'test', phase: 'build', entity: 'web'
  },
  'gate-profile-stop': { kind: 'gate-profile-stop', profileRunId: 'P1' },
  'intake-close':      { kind: 'intake-close', jobId: 'J1', proposedDraftSets: [['1', '2'], ['3']] },
  'intake-start':      { kind: 'intake-start', text: 'Add a basket page.', pictures: [{ pictureId: 'a1b2', name: 'basket.png' }] },
  'job-fresh':         { kind: 'job-fresh', jobId: 'J1', incidentId: 'I1' },
  'job-message':       {
    kind: 'job-message', jobId: 'J1', text: 'Use the example data.', pictures: [{ pictureId: 'a1b2', name: 'basket.png' }], incidentId: 'I1'
  },
  'job-stop':              { kind: 'job-stop', jobId: 'J1', mode: 'wind-down' },
  'merge-accept':          { kind: 'merge-accept', ticketReference: '7' },
  'merge-update':          { kind: 'merge-update', ticketReference: '7' },
  'pipeline-agent-advise': { kind: 'pipeline-agent-advise', entity: 'web' },
  'pipeline-apply':        {
    kind: 'pipeline-apply', setupId: 'S1', draftRevision: 3, resumesBoard: true
  },
  'pipeline-apply-cancel':      { kind: 'pipeline-apply-cancel', setupId: 'S1' },
  'pipeline-assistant-set':     { kind: 'pipeline-assistant-set', on: false },
  'pipeline-agent-set':         { kind: 'pipeline-agent-set', agent: { vendor: 'example-agent', program: { pinned: '/opt/example/bin/agent' } } },
  'pipeline-tools-set':         { kind: 'pipeline-tools-set', tools: [{ name: 'bun', path: '/opt/example/bin/bun' }, { name: 'git', path: '/usr/bin/git' }] },
  'agent-look-again':           { kind: 'agent-look-again' },
  'pipeline-check':             { kind: 'pipeline-check', setupId: 'S1' },
  'pipeline-constitution-edit': {
    kind:        'pipeline-constitution-edit',
    setupId:     'S1',
    revision:    2,
    markdown:    '# Example Agency\n',
    draftedFrom: { contributing: true, research: false, installedDefault: true },
    entity:      'web',
  },
  'pipeline-draft-discard': { kind: 'pipeline-draft-discard', setupId: 'S1' },
  'pipeline-draft-edit':    {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 3, edits: DRAFT_EDIT_SAMPLES, isACopy: true
  },
  'pipeline-draft-undo': {
    kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E2', wholeBatch: true
  },
  'pipeline-setup-answer': {
    kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'text', text: 'Only on merge.' }
  },
  'pipeline-setup-billing': { kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maxBudgetUsd: 10 } },
  'pipeline-setup-resume':  { kind: 'pipeline-setup-resume', setupId: 'S1' },
  'pipeline-setup-start':   {
    kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, agent: { vendor: 'example-agent', program: { follows: 'machine' } }
  },
  'pipeline-setup-agent':      { kind: 'pipeline-setup-agent', setupId: 'S1', agent: { vendor: 'example-agent', program: { follows: 'machine' } } },
  'pipeline-setup-start-over': { kind: 'pipeline-setup-start-over', setupId: 'S1' },
  'pipeline-setup-step':       {
    kind: 'pipeline-setup-step', setupId: 'S1', step: 'design', move: 'continue'
  },
  'pipeline-update-start':  { kind: 'pipeline-update-start', entity: 'web' },
  'ticket-deliver-by-hand': {
    kind: 'ticket-deliver-by-hand', ticketReference: '7', branch: 'ticket-007', commit: 'abc1234'
  },
  'ticket-hold':    { kind: 'ticket-hold', ticketReference: '7', reason: 'Wait for the example design.' },
  'ticket-network': { kind: 'ticket-network', ticketReference: '7', domains: ['example.com'] },
  'ticket-park':    {
    kind: 'ticket-park', ticketReference: '7', reason: 'Blocked by the example vendor.', incidentId: 'I1'
  },
  'ticket-priority':      { kind: 'ticket-priority', ticketReference: '7', priority: 'high' },
  'ticket-ready':         { kind: 'ticket-ready', ticketReferences: ['7', '8'] },
  'ticket-unhold':        { kind: 'ticket-unhold', ticketReference: '7' },
  'tracker-clear':        { kind: 'tracker-clear', scope: 'tasks-and-log' },
  'ticket-document-save': {
    kind: 'ticket-document-save', ticketReference: '7', document: 'spec', baseVersion: 4, markdown: '# Example spec\n\n## Outcome\n'
  },
  'ticket-document-comment': {
    kind: 'ticket-document-comment', ticketReference: '7', document: 'spec', anchor: COMMENT_ANCHOR_SAMPLE, text: 'Name the example page.'
  },
  'ticket-document-comment-withdraw': {
    kind: 'ticket-document-comment-withdraw', ticketReference: '7', document: 'spec', messageId: 'M3'
  },
  'ticket-document-proposal-apply': {
    kind: 'ticket-document-proposal-apply', ticketReference: '7', document: 'plan', proposalId: 'P2', replacementLines: [['- Add the example page.'], []]
  },
  'ticket-document-proposal-discard': {
    kind: 'ticket-document-proposal-discard', ticketReference: '7', document: 'plan', proposalId: 'P2'
  },
  'ticket-document-mode-set': {
    kind: 'ticket-document-mode-set', ticketReference: '7', document: 'spec', mode: 'auto-apply'
  },
  'ticket-document-approve': {
    kind: 'ticket-document-approve', ticketReference: '7', document: 'spec', version: 5
  },
  'ticket-document-effect-read': {
    kind: 'ticket-document-effect-read', ticketReference: '7', document: 'plan', version: 2
  },
  'ticket-document-turn-stop': { kind: 'ticket-document-turn-stop', ticketReference: '7', document: 'spec' },
};
