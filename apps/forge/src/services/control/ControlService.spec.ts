/**
 * The control contract as data: one example of every kind, typed so a new kind needs one, survives JSON unchanged, which a Hatch file and an
 * HTTP body depend on; and a ticket reference the hold cannot resolve leaves the service as a wordless detail, refused when nothing is
 * there and unrepaired when a file of that id will not parse, worded only by the adapter's refusal-wording util.
 */
import { describe, expect, test } from 'bun:test';

import { OperationRefusalWordingUtil }               from '../../adapters/utils/OperationRefusalWordingUtil.ts';
import type { ControlCommandKind, ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import { OperationRefusal }                          from '../../shared/OperationRefusal.ts';
import { boardFixture, ticketFixture }               from '../../testing/BoardFixtures.ts';
import { CONTROL_COMMAND_KINDS }                     from './ControlService.ts';
import { ticketIdOfReference }                       from './ControlTicketLookup.ts';

const EXAMPLE_OF_KIND: { readonly [Kind in ControlCommandKind]: ControlCommandOf<Kind> } = {
  'ticket-add': {
    kind:          'ticket-add',
    title:         'Example basket page',
    type:          'bug',
    priority:      'high',
    size:          'S',
    model:         'opus',
    effort:        'medium',
    group:         'storefront',
    dependsOn:     ['001'],
    epics:         ['checkout-redesign'],
    network:       ['example.com'],
    introducedBy:  '001',
    foundInReview: null,
    bodyText:      '## Report\nAlex Example saw the basket empty itself.\n',
  },
  'ticket-edit': {
    kind: 'ticket-edit', ticketReference: '#3', title: 'Example title', bodyText: null, appendsBody: false, allowsPastPending: true
  },
  'ticket-depends': {
    kind: 'ticket-depends', ticketReference: '3', edit: 'add', ticketIds: ['001', '002']
  },
  'ticket-priority': { kind: 'ticket-priority', ticketReference: '3', priority: 'low' },
  'ticket-epic':     {
    kind: 'ticket-epic', ticketReference: '3', edit: 'replace', epicKeys: []
  },
  'ticket-abandon': {
    kind: 'ticket-abandon', ticketReference: '3', reason: 'Example Agency dropped it', tokens: 1200
  },
  'ticket-ready':  { kind: 'ticket-ready', ticketReferences: ['3', '#4'] },
  'ticket-submit': { kind: 'ticket-submit', ticketReferences: ['3', '#4'] },
  'ticket-park':   {
    kind: 'ticket-park', ticketReference: '3', reason: 'Needs Alex Example', incidentId: 'I1'
  },
  'incident-answer':   { kind: 'incident-answer', incidentId: 'I1', text: 'Use the example setup script' },
  'incident-note':     { kind: 'incident-note', incidentId: 'I1', text: 'Seen twice' },
  'incident-escalate': { kind: 'incident-escalate', incidentId: 'I1' },
  'ticket-network':    { kind: 'ticket-network', ticketReference: '3', domains: [] },
  'ticket-entity':     {
    kind: 'ticket-entity', ticketReference: '3', entity: 'web', reason: 'The basket page is the web app\'s'
  },
  'ticket-group':  { kind: 'ticket-group', ticketReference: '3', group: 'checkout-redesign' },
  'ticket-hold':   { kind: 'ticket-hold', ticketReference: '3', reason: '' },
  'ticket-unhold': { kind: 'ticket-unhold', ticketReference: '3' },
  'epic-add':      {
    kind: 'epic-add', key: 'checkout-redesign', title: 'Checkout redesign', bodyText: ''
  },
  'draft-open': {
    kind: 'draft-open', title: 'Example intake', request: 'Alex Example asks for a basket.\n', owner: 'opus'
  },
  'draft-claim': {
    kind: 'draft-claim', draftId: 'D1', owner: 'opus', forces: false
  },
  'draft-release': { kind: 'draft-release', draftId: 'D1' },
  'draft-note':    {
    kind: 'draft-note', draftId: 'D1', text: 'The basket is a page.', noteKind: 'assumption'
  },
  'draft-ask': {
    kind:    'draft-ask',
    draftId: 'D1',
    asking:  {
      question: 'Which page?', context: 'Two exist.', optionTexts: ['Basket', 'Checkout'], multiple: false, recommendedLetters: ['a'], underQuestionId: null
    },
  },
  'draft-answer': {
    kind: 'draft-answer', draftId: 'D1', questionId: 'Q1', answer: 'a'
  },
  'draft-drop':      { kind: 'draft-drop', draftId: 'D1', itemId: 'N1' },
  'draft-close':     { kind: 'draft-close', draftId: 'D1', ticketReferences: ['3'] },
  'draft-abandon':   { kind: 'draft-abandon', draftId: 'D1', reason: 'Filed elsewhere' },
  'decision-answer': { kind: 'decision-answer', decisionId: 'E1', answer: { form: 'letters', choices: ['a'] } },
  'job-stop':        { kind: 'job-stop', jobId: 'J2', mode: 'wind-down' },
  'job-fresh':       { kind: 'job-fresh', jobId: 'J2' },
  'job-stop-all':    { kind: 'job-stop-all', mode: 'stop' },
  'job-message':     { kind: 'job-message', jobId: 'J2', text: 'Keep the basket page.' },
  'worktree-repair': {
    kind: 'worktree-repair', ticketReference: '1', step: 'prune', incidentId: 'I1'
  },
  'gate-retry':            { kind: 'gate-retry', jobId: 'J2', incidentId: 'I1' },
  'intake-start':          { kind: 'intake-start', text: 'Alex Example asks for a basket.' },
  'pipeline-agent-advise': { kind: 'pipeline-agent-advise' },
  'intake-close':          { kind: 'intake-close', jobId: 'J3', proposedDraftSets: [['4', '5']] },
  'intake-title':          { kind: 'intake-title', jobId: 'J3', title: 'Example basket' },
  'need-declare':          {
    kind:     'need-declare',
    jobId:    'J3',
    entity:   'shared',
    title:    'Export the basket total',
    bodyText: '## Acceptance\n\nA1. The web app reads the basket total.\n\n## Brief\n\nAlex Example needs the total.\n',
  },
  'question-options': {
    kind: 'question-options', jobId: 'J3', question: 'Which basket?', options: [{ label: 'Wicker', tradeOff: 'Lighter, less sturdy.' }]
  },
  'overseer-pause':            { kind: 'overseer-pause' },
  'overseer-resume':           { kind: 'overseer-resume' },
  'interrupted-work-resume':   { kind: 'interrupted-work-resume', target: 'all' },
  'overseer-stop':             { kind: 'overseer-stop', now: true },
  'overseer-restart':          { kind: 'overseer-restart', now: false },
  'concurrency-set':           { kind: 'concurrency-set', limit: 3 },
  'machine-agent-limit-set':   { kind: 'machine-agent-limit-set', limit: 2 },
  'pipeline-prepare-step-set': { kind: 'pipeline-prepare-step-set', step: { name: 'install', run: 'bun install' } },
  'pipeline-gate-add':         { kind: 'pipeline-gate-add', gate: { name: 'test', run: 'bun test', definedBy: ['bunfig.toml'] } },
  'pipeline-gate-order':       { kind: 'pipeline-gate-order', phase: 'merge', names: ['test'] },
  'pipeline-gates-none':       { kind: 'pipeline-gates-none' },
  'pipeline-gate-remove':      { kind: 'pipeline-gate-remove', name: 'test' },
  'pipeline-approval-set':     { kind: 'pipeline-approval-set', approval: 'tickets', on: false },
  'pipeline-reach-set':        { kind: 'pipeline-reach-set', paths: ['/packages/shared'] },
  'merge-accept':              { kind: 'merge-accept', ticketReference: '1' },
  'merge-update':              { kind: 'merge-update', ticketReference: '1' },
  'pipeline-setup-start':      { kind: 'pipeline-setup-start', billing: { mode: 'api', maxBudgetUsd: 20 }, replacesUnreadablePipeline: false },
  'pipeline-setup-billing':    { kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'subscription' } },
  'pipeline-setup-step':       {
    kind: 'pipeline-setup-step', setupId: 'S1', step: 'research', move: 'continue'
  },
  'pipeline-setup-start-over': { kind: 'pipeline-setup-start-over', setupId: 'S1' },
  'pipeline-setup-resume':     { kind: 'pipeline-setup-resume', setupId: 'S1' },
  'pipeline-setup-answer':     {
    kind: 'pipeline-setup-answer', setupId: 'S1', questionId: 'Q1', answer: { form: 'letters', choices: ['a'] }
  },
  'pipeline-constitution-edit': {
    kind:        'pipeline-constitution-edit',
    setupId:     'S1',
    revision:    2,
    markdown:    '# Example Agency\n\n- Keep the basket page fast.\n',
    draftedFrom: { contributing: true, research: false, installedDefault: false },
  },
  'pipeline-update-start': { kind: 'pipeline-update-start' },
  'pipeline-draft-edit':   {
    kind: 'pipeline-draft-edit', setupId: 'S1', draftRevision: 3, edits: [{ field: 'gate:test', value: { name: 'test', run: 'bun test' } }]
  },
  'pipeline-draft-undo':    { kind: 'pipeline-draft-undo', setupId: 'S1', editId: 'E1' },
  'pipeline-draft-discard': { kind: 'pipeline-draft-discard', setupId: 'S1' },
  'gate-profile-start':     {
    kind: 'gate-profile-start', setupId: 'S1', gateName: 'test', phase: 'merge'
  },
  'gate-profile-stop': { kind: 'gate-profile-stop', profileRunId: 'P1' },
  'pipeline-apply':    {
    kind: 'pipeline-apply', setupId: 'S1', draftRevision: 2, resumesBoard: true
  },
  'pipeline-apply-cancel':   { kind: 'pipeline-apply-cancel', setupId: 'S1' },
  'pipeline-check':          { kind: 'pipeline-check', setupId: 'S1' },
  'pipeline-finding-record': {
    kind:        'pipeline-finding-record',
    jobId:       'J4',
    setupId:     'S1',
    topic:       'scripts',
    label:       'Type check',
    value:       'bun run typecheck',
    sourcePaths: ['package.json'],
    script:      {
      name: 'typecheck', run: 'bun run typecheck', meaning: 'Checks the types', gateCandidate: 'gate', needs: []
    },
  },
  'pipeline-question-ask': {
    kind:        'pipeline-question-ask',
    jobId:       'J4',
    setupId:     'S1',
    step:        'research',
    subject:     { kind: 'finding', reference: 'F1' },
    question:    'Is the type check a gate?',
    context:     'Example Agency runs it before each merge.',
    options:     ['Yes', 'No'],
    recommended: ['a'],
    multiple:    false,
  },
  'pipeline-constitution-draft': {
    kind:     'pipeline-constitution-draft',
    jobId:    'J4',
    setupId:  'S1',
    markdown: '# Example Agency\n\n- Keep the basket page fast.\n',
    sources:  [{
      lineText: '- Keep the basket page fast.', occurrence: 1, kind: 'contributing', path: 'CONTRIBUTING.md'
    }],
  },
  'pipeline-draft-propose': {
    kind: 'pipeline-draft-propose', jobId: 'J4', setupId: 'S1', edits: [{ field: 'review', value: { name: 'Review' }, summary: 'Review every ticket.' }]
  },
  'pipeline-step-ready': {
    kind: 'pipeline-step-ready', jobId: 'J4', setupId: 'S1', step: 'research'
  },
  'chart-range-set': {
    kind:  'chart-range-set',
    range: {
      kind: 'window', from: '-2h', to: 'now', tickMinutes: 15
    }
  },
  'tracker-clear':          { kind: 'tracker-clear', scope: 'tasks-and-log' },
  'ticket-deliver-by-hand': {
    kind: 'ticket-deliver-by-hand', ticketReference: '1', branch: 'ticket-001', commit: 'abc1234'
  },
};

function refusalOf(attempt: () => unknown): OperationRefusal {
  try {
    attempt();
  } catch (error) {
    if (error instanceof OperationRefusal) return error;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('ControlCommand', () => {
  test('the examples cover every kind the service applies', () => {
    expect(Object.keys(EXAMPLE_OF_KIND).sort()).toEqual([...CONTROL_COMMAND_KINDS].sort());
  });

  test('every command is JSON and comes back from a round trip unchanged', () => {
    for (const command of Object.values(EXAMPLE_OF_KIND)) {
      expect(JSON.parse(JSON.stringify(command)), command.kind).toEqual(command);
    }
  });
});

describe('ticketIdOfReference', () => {
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001' }), ticketFixture({ id: '003' })] });
  const malformedTickets = [{ filePath: '/example-agency/.agent-progress/tickets/004-broken.md', reason: 'the frontmatter has no closing fence', line: 1 }];

  test('3, 003 and #3 resolve to ticket 003', () => {
    for (const reference of ['3', '003', '#3']) expect(ticketIdOfReference({ board, malformedTickets }, reference), reference).toBe('003');
  });

  test('a reference with nothing there is refused with a wordless detail the adapter words', () => {
    const refusal = refusalOf(() => ticketIdOfReference({ board, malformedTickets }, '2'));

    expect(refusal.status).toBe('refused');
    expect(refusal.detail).toEqual({ kind: 'no-readable-ticket', reference: '2' });
    expect(OperationRefusalWordingUtil.messageOf(refusal)).toStartWith('There is no readable ticket 2.');
  });

  test('a reference whose file will not parse is unrepaired, naming the file, its line and why', () => {
    const refusal = refusalOf(() => ticketIdOfReference({ board, malformedTickets }, '#4'));

    expect(refusal.status).toBe('unrepaired');
    expect(OperationRefusalWordingUtil.messageOf(refusal)).toBe(
      'Ticket file ignored: /example-agency/.agent-progress/tickets/004-broken.md (line 1): the frontmatter has no closing fence',
    );
  });
});
