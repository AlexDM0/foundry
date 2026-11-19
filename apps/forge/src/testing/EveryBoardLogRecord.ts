/**
 * One record of every kind, as the Board's own changes log them, so a spec pinning what log.jsonl stores reads the Board's key order rather
 * than a hand-written copy of it. Test-only: nothing that ships may import `src/testing/`.
 */
import type { LogRecord } from '../lib/tracker-model/@types/LogRecord.ts';
import type { Board }     from '../lib/tracker-model/Board.ts';
import {
  boardFixture,
  entityPipelineFixture,
  taskFixture,
  ticketFixture
} from './BoardFixtures.ts';
import { EXAMPLE_GREEN_TREE, queueOnCurrentGreen } from './GreenQueue.ts';

/** The sha256 of an obviously synthetic picture: the Board stores the id as given and never reads the store. */
const EXAMPLE_PICTURE_ID = 'a'.repeat(64);

/**
 * One setup record walked through every move, each logging its own kind once, its Apply request held, refused and cancelled before it is
 * started over; a second record, with no constitution, is applied at once.
 */
function logEverySetupRecordKind(board: Board, at: string): void {
  const { setup } = board.openSetup({
    mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, at);
  const { setupId } = setup;
  board.setSetupBilling(setupId, { mode: 'api', maxBudgetUsd: 5 }, at);
  board.recordFinding(setupId, {
    topic: 'scripts', label: 'Type check', value: 'bun run typecheck', sourcePaths: ['package.json'], script: null
  }, at);
  board.askSetupQuestion(setupId, {
    step:               'research',
    subject:            { kind: 'finding', reference: 'F1' },
    question:           'Is the type check a gate?',
    context:            'Example Agency runs it before each merge',
    optionTexts:        ['Yes', 'No'],
    recommendedLetters: ['a'],
    multiple:           false,
  }, at);
  board.answerSetupQuestion(setupId, 'Q1', { letters: ['a'] }, at);
  board.recordSetupSnapshotTouched(setupId, { check: 'V4', reason: 'worktree-dirty' }, at);
  board.suggestSetupStepReady(setupId, 'research', at);
  board.resumeSetup(setupId, 'e5f60718293a4b5c6d7e8f9012345678901234ab', ['package.json'], at);
  board.continueSetupStep(setupId, 'research', at);
  board.setConstitution(setupId, { markdown: '# Example constitution\n\n- Keep every change small.\n', annotations: [] }, at);
  board.editDraft(setupId, {
    by:       'agent',
    revision: null,
    edits:    [
      { edit: { target: 'review', value: { name: 'Review' } }, summary: 'Review every ticket.' },
      { edit: { target: 'gate', name: 'tests', value: { name: 'tests', run: 'bun test' } }, summary: 'Run the tests.' },
    ],
  }, at);
  board.undoDraftEdit(setupId, 'E1', at);
  board.requestPipelineCheck(setupId, at);
  board.discardDraft(setupId, at);
  // The edit, its Undo and the discard each took the draft one revision further.
  board.requestApply(setupId, { draftRevision: 3, resumesBoard: false, mainConstitution: null }, at);
  board.holdApply(setupId, { reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'] }, at);
  board.refuseApply(setupId, { reason: 'git-failed', gitFailure: 'fatal: example failure' }, at);
  board.cancelApply(setupId, at);
  board.startOverSetup(setupId, at);
  const applied = board.openSetup({
    mode: 'setup', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, mainConstitution: null, storedAnnotations: []
  }, at);
  board.requestApply(applied.setup.setupId, { draftRevision: 0, resumesBoard: false, mainConstitution: null }, at);
}

/** One gate profile that ends by itself, and one User stops while it waits, each logging its own kind once. */
function logEveryGateProfileRecordKind(board: Board, at: string): void {
  const request = {
    setupId: null, phase: 'build', gate: { name: 'tests', run: 'bun test' }, prepare: []
  } as const;
  const { run } = board.queueGateProfile(request, at);
  board.markGateProfileRunning(run.profileRunId);
  board.endGateProfile(run.profileRunId, { ending: 'passed', elapsedMilliseconds: 4200, cacheReport: 'hit' }, at);
  board.stopGateProfile(board.queueGateProfile(request, at).run.profileRunId, at);
}

/** A ticket's entity is set only on a board whose pipeline names entities, which the main scenario's board does not have. */
function entityAssignedRecordsOf(at: string): LogRecord[] {
  const { board, records } = boardFixture({ tickets: [ticketFixture({ id: '003', status: 'draft' })], pipeline: entityPipelineFixture() });
  board.setTicketEntity('003', { entity: 'web', reason: 'The search page lives in the web app', by: 'product-owner' }, at);
  return records;
}

/**
 * A crossing ticket in `adapt` whose package review sealed its change, which then returns to the package build: the return lifts the seal
 * and counts, and the package build starts, each logging its own kind once.
 */
function crossingStageRecordsOf(at: string): LogRecord[] {
  const { board, records } = boardFixture({
    pipeline: entityPipelineFixture(),
    tasks:    [taskFixture({
      id: 1, ticket: '005', status: 'in-progress', stage: { name: 'adapt', entity: 'web' }
    })],
    tickets: [ticketFixture({
      id: '005', title: 'Example basket badge', status: 'in-progress', task: 1, entity: 'web'
    })],
  });
  board.sealTicketPackage('005', 'design-system', 'example-seal', at);
  board.moveTicketStage('005', { name: 'package-build', entity: 'design-system' }, at);
  return records;
}

export function everyRecordKindTheBoardLogs(at: string): LogRecord[] {
  const { board, records } = boardFixture({
    tickets: [
      ticketFixture({ id: '001', title: 'Example checkout page' }),
      ticketFixture({ id: '002', title: 'Example cart', group: 'example-shop' }),
      ticketFixture({
        id: '004', title: 'Example cart total is wrong', type: 'bug', hold: 'interrupted:merge'
      }),
    ],
  });
  board.recordNote('Example note from the orchestrator', at);
  board.fileTicket(ticketFixture({ id: '003', title: 'Example search page', status: 'draft' }), at);
  board.editTicket('003', { title: 'Example search results page' }, at);
  board.setTicketNetwork('003', ['api.example.com'], at);
  records.push(...entityAssignedRecordsOf(at));
  board.submitDraftTickets(['003'], () => [], at);
  board.readyDraftTickets(['003'], () => [], at, ['ready-for-review']);
  board.setTicketPriority('001', 'high', at);
  board.setTicketSize('001', 'M', at);
  board.setTicketDependencies('002', ['001'], at);
  board.setTicketAgents('001', { model: 'sonnet', effort: 'high' }, at);
  board.holdTicket('001', 'waiting on Example Agency', at);
  board.unholdTicket('001', at);
  board.liftInterruptedHold('004', at);
  board.recordWorktreeRepaired('001', { step: 'prune', patchPath: null }, at);
  board.markReleaseTicket('002', at);
  board.clearReleaseTicket('002', at);
  board.setTicketGroup('004', 'example-shop', at);
  board.recordDependentFixFiled('004', { entity: 'web', fixTicketIds: ['002'] }, at);
  board.addEpic({
    key:      'example-checkout',
    title:    'Example checkout redesign',
    body:     '',
    filePath: '/example-agency/storefront/.agent-progress/epics/example-checkout.md',
  }, at);
  board.editEpic('example-checkout', { title: 'Example checkout overhaul' }, at);
  board.removeEpic('example-checkout', at);
  board.setTicketEpics('002', [], at);
  board.openDraft({ title: 'Example export', request: 'Alex Example asks for an export', owner: 'opus' }, at);
  board.releaseDraft('D1', at);
  board.claimDraft('D1', { owner: 'opus', forces: false }, at);
  board.claimDraft('D1', { owner: 'example-session', forces: true }, at);
  board.addDraftNote('D1', { text: 'The export lives in src/export/', kind: 'fact' }, at);
  board.askDraftQuestion('D1', {
    question:           'Which format?',
    context:            'Alex Example named two',
    optionTexts:        ['CSV', 'JSON'],
    multiple:           false,
    recommendedLetters: ['a'],
    underQuestionId:    null,
  }, at);
  board.answerDraftQuestion('D1', 'Q1', 'a', at);
  board.dropDraftItem('D1', 'N1', at);
  board.closeDraft('D1', ['3'], at);
  board.openDraft({ title: 'Example import', request: '', owner: 'opus' }, at);
  board.abandonDraft('D2', 'folded into D1', at);
  board.moveTicket('001', 'in-progress', { checksLegality: true }, at);
  board.setPrepareStep({ name: 'install', run: 'bun install --frozen-lockfile' }, at);
  board.addGate({ name: 'checks', run: 'bun run example-checks' }, at);
  board.orderPhaseGates('merge', ['checks'], at);
  board.removeGate('checks', at);
  board.setNoGates(at);
  board.setApproval('tickets', false, at);
  board.setReach(['/packages/shared'], at);
  board.recordGateRan({ tree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904', outcome: 'passed', cached: true }, at);
  board.recordPipelineStepsRan([{
    stepKind: 'gate', stepName: 'tests', entity: 'web', runMilliseconds: 4200, ending: 'passed'
  }], 'build', at);
  board.editTicket('001', { body: { text: 'Example rewritten report.\n', appends: false }, allowsPastPending: true }, at);
  board.moveTicket('001', 'in-review', { checksLegality: true }, at);
  board.startReviewBar('001', { round: 1 }, at);
  board.recordReview('001', {
    verdict:                 'round-requested',
    reviewStartCommit:       'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
    fixReworkedCodeLines:    12,
    rebaseReworkedCodeLines: 4,
    totalReworkedCodeLines:  16,
    builderChangedFiles:     3,
    builderInsertions:       120,
    builderDeletions:        8,
    claims:                  [{ item: 'A1', result: 'holds', handoffContradicted: false }],
    findings:                [
      {
        class:    'test-gap',
        severity: 'quality',
        file:     'src/example/ExampleCheckout.ts',
        summary:  'The empty cart had no spec',
        evidence: 'watched-fail',
        outcome:  'fixed',
        commit:   'b2c3d4e',
      },
      {
        class:         'out-of-scope',
        severity:      'nit',
        file:          'docs/example.md',
        summary:       'An example sentence wraps late',
        evidence:      'reading',
        outcome:       'filed',
        filedTicketId: '004',
      },
    ],
  }, at);
  queueOnCurrentGreen(board, '001', 'main', at);
  board.setApproval('merge', true, at);
  board.setTicketMergeAccepted('001', true, at);
  board.recordMergeUpdated('001', 'main', 'merged', at);
  const merge = board.claimAirlock({
    ticketId:               '001',
    target:                 'main',
    targetTip:              'b2c3d4e5f60718293a4b5c6d7e8f901234567890',
    branchTip:              'c3d4e5f60718293a4b5c6d7e8f90123456789012',
    predictedConflictFiles: ['src/example/ExampleCheckout.ts'],
  }, (ticket) => (ticket.group === undefined ? 'main' : `group-${ticket.group}`), () => EXAMPLE_GREEN_TREE, at);
  board.recordMergeLanded(merge.job.id, { target: 'main', commit: 'd4e5f60718293a4b5c6d7e8f9012345678901234', kind: 'landed' }, at);
  board.endJob(merge.job.id, { outcome: 'landed', commit: 'd4e5f60718293a4b5c6d7e8f9012345678901234' }, at);
  board.rereviewTicket('001', at);
  board.moveTicket('001', 'reviewed', { checksLegality: true }, at);
  board.moveTicket('001', 'delivered', { checksLegality: true }, at);
  board.setTicketIntroducedBy('004', '001', at);
  board.moveTicket('001', 'pending', { checksLegality: false }, at);
  board.moveTicket('003', 'abandoned', { checksLegality: true, reason: 'superseded by #001' }, at);
  board.setChartRange({
    kind:        'relative',
    from:        '-2h',
    to:          'now',
    tickMinutes: 15,
  }, at);
  board.setConcurrencyLimit(3, at);
  board.setOverseerState('running', at);
  board.setBranchNamespace('web', at);
  board.recordAgentStop({
    agentId:              'example-agent',
    agentType:            'agent-progress-worker',
    apiCallCount:         12,
    endContextTokens:     48_000,
    totalInputTokens:     310_000,
    cacheReadInputTokens: 250_000,
    outputTokens:         9_000,
  }, [], at);
  board.recordOverseerStarted({ codeVersion: 'a1b2c3d', installVersion: 17 }, at);
  board.recordStartClassified({
    kind: 'machine-went-down', startOrigin: 'login-item', previousGeneration: 3, crashSuspected: true, crashLogNumber: 3
  }, at);
  const { job } = board.launchJob({
    kind:        'build',
    role:        'builder',
    ticketIds:   ['002'],
    parentJobId: null,
    attempt:     1,
    target:      'main',
  }, at);
  board.moveJob(job.id, 'running', at);
  board.interruptJob(job.id, 'agent-crashed', at);
  board.instructResume(job.id, at);
  board.recordUsageLimitHit(job.id, { window: 'five_hour', resetsAt: '2026-09-26T13:00:34.000Z' }, at);
  board.moveJob(job.id, 'running', at, { instructed: true });
  board.messageJob(job.id, 'Keep the example export small.', [], at);
  board.requestJobStop(job.id, 'wind-down', at);
  board.endJob(job.id, { outcome: 'failed', cause: 'no report', deniedPermissions: ['WebFetch'] }, at);
  const intake = board.startIntake('File the example export ticket.', [{ pictureId: EXAMPLE_PICTURE_ID, name: 'export-mockup.png' }], at);
  board.titleIntake(intake.job.id, 'Example export ticket', at);
  board.endJob(intake.job.id, { outcome: 'closed' }, at);
  board.messageJob(intake.job.id, 'Add the example import as well.', [{ pictureId: EXAMPLE_PICTURE_ID, name: 'import-mockup.png' }], at);
  const question = {
    question:    'Ship the example export as CSV?',
    header:      'Export',
    multiSelect: false,
    options:     [{ label: 'CSV', description: 'Comma separated', isRecommended: false }, { label: 'JSON', description: 'One document', isRecommended: false }],
  };
  board.openDecision({
    kind: 'agent-question', ticketIds: ['002'], jobId: null, askedBy: 'builder', requestId: 'request-1', questions: [question], context: 'Example cart',
  }, at);
  board.answerDecision('E1', ['CSV'], at);
  board.openDecision({
    kind: 'outage', ticketIds: [], jobId: null, askedBy: 'overseer', requestId: null, questions: [question], context: 'Two crashed jobs',
  }, at);
  board.withdrawDecision('E2', 'job stopped', at);
  const incidentOpening = {
    kind: 'system-question', ticketIds: ['002'], jobId: null, facts: { requestId: 'request-2' }, defaultMove: 'incident-escalate',
  } as const;
  board.openIncident(incidentOpening, at);
  board.answerIncident('I1', 'Use the example setup script', at);
  board.openIncident({ ...incidentOpening, facts: { requestId: 'request-3' } }, at);
  board.noteIncident('I2', 'Example note', at);
  board.defaultIncident('I2', 'turn-closed', at);
  board.openIncident({ ...incidentOpening, facts: { requestId: 'request-4' } }, at);
  board.escalateIncident('I3', { askedBy: 'builder', questions: [question], context: 'Example cart' }, at);
  board.recordOverseerStopped('stopped', at);
  board.recordFlintBrainEnded({
    startedBy: 'bridge', startedAt: '2026-09-26T08:13:00.000Z', endedAt: '2026-09-26T08:15:00.000Z', endedReason: 'time', tokens: 4_200, calls: 3
  }, at);
  board.recordBatonPassFailed({ successorCodeVersion: 'd4e5f6a', step: 'read-child-records', error: 'Example record error' }, at);
  board.recordHatchApplied('J1', {
    requestId: 'request-5', commandKind: 'ticket-add', outcome: 'done', ticketIds: ['001']
  }, at);
  board.recordNeedDeclared('002', { entity: 'api', title: 'Example cart total endpoint', byJob: 'J1' }, at);
  records.push(...crossingStageRecordsOf(at));
  logEverySetupRecordKind(board, at);
  logEveryGateProfileRecordKind(board, at);
  board.clearTracker({ ticketsSurvive: true }, at);
  return records;
}
