/**
 * The API sentence of every refusal the type knows. What matters: the sample tables are keyed by every Board reason and every detail kind,
 * so the type checker fails when a new one has no sample, and no API sentence of any sample names a command line or a flag. The two
 * kinds only a session's relayed command meets keep their command-line words, and the exemption list is exact both ways.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardRefusalDetail }     from '../../lib/tracker-model/BoardRefusal.ts';
import { OperationRefusal }            from '../../shared/OperationRefusal.ts';
import type { OperationRefusalDetail } from '../../shared/OperationRefusal.ts';
import { COMMAND_LINE_FORM }           from '../../testing/CommandLineForm.ts';
import { OperationRefusalWordingUtil } from './OperationRefusalWordingUtil.ts';

type BoardReason = BoardRefusalDetail['reason'];
type DetailKind = OperationRefusalDetail['kind'];

const BOARD_SAMPLE_OF_REASON: { readonly [Reason in BoardReason]: Extract<BoardRefusalDetail, { reason: Reason }> } = {
  'unknown-task':     { reason: 'unknown-task', taskId: 99 },
  'ticket-owned-row': {
    reason: 'ticket-owned-row', taskId: 3, ticketId: '004', targetStatus: 'in-review'
  },
  'ticket-already-has-row': {
    reason: 'ticket-already-has-row', ticketId: '004', taskId: 3, taskName: 'Example row'
  },
  'task-belongs-to-another-ticket': {
    reason: 'task-belongs-to-another-ticket', taskId: 3, owningTicketId: '004', ticketId: '005'
  },
  'ticket-already-in-status': { reason: 'ticket-already-in-status', ticketId: '004', status: 'pending' },
  'illegal-ticket-move':      {
    reason: 'illegal-ticket-move', ticketId: '004', status: 'pending', targetStatus: 'delivered'
  },
  'move-to-draft':                                   { reason: 'move-to-draft', ticketId: '004', status: 'pending' },
  'move-of-a-draft':                                 { reason: 'move-of-a-draft', ticketId: '004', targetStatus: 'pending' },
  'move-to-ready-for-review':                        { reason: 'move-to-ready-for-review', ticketId: '004', status: 'draft' },
  'move-of-a-ticket-ready-for-review':               { reason: 'move-of-a-ticket-ready-for-review', ticketId: '004', targetStatus: 'pending' },
  'ready-of-a-ticket-not-in-draft':                  { reason: 'ready-of-a-ticket-not-in-draft', ticketId: '004', status: 'pending' },
  'incomplete-tickets':                              { reason: 'incomplete-tickets', incompleteTickets: [{ ticketId: '004', gaps: ['acceptance-unnumbered', 'brief-missing'] }] },
  'abandon-without-reason':                          { reason: 'abandon-without-reason', ticketId: '004' },
  'tokens-without-a-row':                            { reason: 'tokens-without-a-row', ticketId: '004' },
  'rereview-outside-review':                         { reason: 'rereview-outside-review', ticketId: '004', status: 'reviewed' },
  'review-record-without-a-review-bar':              { reason: 'review-record-without-a-review-bar', ticketId: '004' },
  'review-bar-without-a-round':                      { reason: 'review-bar-without-a-round', ticketId: '004', taskId: 3 },
  'review-record-on-a-row-that-is-not-a-review-bar': { reason: 'review-record-on-a-row-that-is-not-a-review-bar', ticketId: '004', taskId: 3 },
  'review-record-on-a-bar-outside-the-bundle':       {
    reason: 'review-record-on-a-bar-outside-the-bundle', ticketId: '004', taskId: 3, reviewOf: '005'
  },
  'unclaimable-status':                 { reason: 'unclaimable-status', ticketId: '004', status: 'delivered' },
  'claim-waits-on-dependencies':        { reason: 'claim-waits-on-dependencies', ticketId: '004', unsettledTicketIds: ['002'] },
  'claim-of-a-held-ticket':             { reason: 'claim-of-a-held-ticket', ticketId: '004' },
  'claim-under-review':                 { reason: 'claim-under-review', ticketId: '004', reviewBarTaskId: 3 },
  'claim-after-a-ticket-not-in-review': {
    reason: 'claim-after-a-ticket-not-in-review', ticketId: '004', afterTicketId: '003', status: 'pending'
  },
  'claim-after-a-ticket-outside-the-bundle':  { reason: 'claim-after-a-ticket-outside-the-bundle', ticketId: '004', afterTicketId: '003' },
  'claim-after-a-ticket-it-does-not-wait-on': { reason: 'claim-after-a-ticket-it-does-not-wait-on', ticketId: '004', afterTicketId: '003' },
  'concurrency-limit-reached':                {
    reason: 'concurrency-limit-reached', ticketIds: ['004'], agentsInFlight: 2, inProgressRowCount: 2, limit: 2
  },
  'unknown-dependency':                  { reason: 'unknown-dependency', missingTicketIds: ['999'] },
  'dependency-loop':                     { reason: 'dependency-loop', loopTicketIds: ['004', '005', '004'] },
  'unknown-linked-ticket':               { reason: 'unknown-linked-ticket', missingTicketId: '999' },
  'introduced-by-on-a-non-bug':          { reason: 'introduced-by-on-a-non-bug', ticketId: '004', type: 'ticket' },
  'introduced-by-itself':                { reason: 'introduced-by-itself', ticketId: '004' },
  'introduced-by-an-undelivered-ticket': {
    reason: 'introduced-by-an-undelivered-ticket', ticketId: '004', causeTicketId: '003', status: 'pending'
  },
  'priority-unchanged': {
    reason: 'priority-unchanged', ticketId: '004', status: 'pending', priority: 'high'
  },
  'size-unchanged': {
    reason: 'size-unchanged', ticketId: '004', status: 'pending', size: 'M'
  },
  'lowering-a-ticket-that-is-not-pending': { reason: 'lowering-a-ticket-that-is-not-pending', ticketId: '004', status: 'in-progress' },
  'edit-of-a-ticket-past-pending':         { reason: 'edit-of-a-ticket-past-pending', ticketId: '004', status: 'in-progress' },
  'network-of-a-ticket-past-pending':      { reason: 'network-of-a-ticket-past-pending', ticketId: '004', status: 'in-progress' },
  'network-domain-not-public':             { reason: 'network-domain-not-public', ticketId: '004', domains: ['localhost'] },
  'network-unchanged':                     { reason: 'network-unchanged', ticketId: '004', domains: ['example.com'] },
  'agents-of-a-settled-ticket':            { reason: 'agents-of-a-settled-ticket', ticketId: '004', status: 'delivered' },
  'agents-unchanged':                      {
    reason: 'agents-unchanged', ticketId: '004', status: 'pending', agents: { model: 'opus', effort: 'medium' }
  },
  'hold-of-a-settled-ticket': {
    reason: 'hold-of-a-settled-ticket', ticketId: '004', status: 'delivered', action: 'hold'
  },
  'ticket-already-held':              { reason: 'ticket-already-held', ticketId: '004' },
  'ticket-not-held':                  { reason: 'ticket-not-held', ticketId: '004' },
  'release-mark-of-a-settled-ticket': {
    reason: 'release-mark-of-a-settled-ticket', ticketId: '004', status: 'delivered', action: 'mark'
  },
  'release-mark-of-an-ungrouped-ticket': { reason: 'release-mark-of-an-ungrouped-ticket', ticketId: '004' },
  'group-already-has-a-release-ticket':  {
    reason: 'group-already-has-a-release-ticket', ticketId: '004', group: 'checkout-redesign', releaseTicketId: '005'
  },
  'ticket-is-not-a-release-ticket':       { reason: 'ticket-is-not-a-release-ticket', ticketId: '004' },
  'reopen-beside-an-open-release-ticket': {
    reason: 'reopen-beside-an-open-release-ticket', ticketId: '004', status: 'delivered', targetStatus: 'pending', group: 'checkout-redesign', releaseTicketId: '005'
  },
  'malformed-epic-key':                { reason: 'malformed-epic-key', epicKey: 'Checkout Redesign' },
  'malformed-group-name':              { reason: 'malformed-group-name', group: 'Checkout Redesign' },
  'group-name-case-twin':              { reason: 'group-name-case-twin', group: 'Checkout', existingGroup: 'checkout' },
  'epic-already-exists':               { reason: 'epic-already-exists', epicKey: 'checkout-redesign' },
  'unknown-epic':                      { reason: 'unknown-epic', missingEpicKeys: ['checkout-redesign'] },
  'epic-still-named':                  { reason: 'epic-still-named', epicKey: 'checkout-redesign', ticketIds: ['004'] },
  'unknown-gate':                      { reason: 'unknown-gate', gateName: 'lint', gateNames: ['test'] },
  'approval-without-pipeline':         { reason: 'approval-without-pipeline', approval: 'merge' },
  'unknown-draft':                     { reason: 'unknown-draft', draftId: 'D9' },
  'draft-claimed-by-another-owner':    { reason: 'draft-claimed-by-another-owner', draftId: 'D2', owner: 'Alex Example' },
  'draft-closed-into-unknown-tickets': { reason: 'draft-closed-into-unknown-tickets', draftId: 'D2', missingTicketReferences: ['#999'] },
  'draft-has-open-questions':          { reason: 'draft-has-open-questions', draftId: 'D2', openQuestionIds: ['Q1'] },
  'unknown-draft-question':            { reason: 'unknown-draft-question', draftId: 'D2', questionId: 'Q9' },
  'unknown-draft-item':                { reason: 'unknown-draft-item', draftId: 'D2', itemId: 'N9' },
  'draft-question-option-count':       {
    reason: 'draft-question-option-count', draftId: 'D2', optionCount: 1, minimum: 2, maximum: 4
  },
  'draft-question-without-recommendation': { reason: 'draft-question-without-recommendation', draftId: 'D2' },
  'unknown-draft-option-letters':          {
    reason: 'unknown-draft-option-letters', draftId: 'D2', unknownLetters: ['E'], optionLetters: ['A', 'B']
  },
  'several-letters-on-single-select-question': { reason: 'several-letters-on-single-select-question', draftId: 'D2', letters: ['A', 'B'] },
  'unknown-job':                               { reason: 'unknown-job', jobId: 'J9' },
  'job-finished':                              { reason: 'job-finished', jobId: 'J3' },
  'job-has-no-ticket':                         { reason: 'job-has-no-ticket', jobId: 'J3' },
  'job-not-intake':                            { reason: 'job-not-intake', jobId: 'J3', kind: 'build' },
  'intake-title-empty':                        { reason: 'intake-title-empty', jobId: 'J3' },
  'question-options-malformed':                {
    reason: 'question-options-malformed', jobId: 'J3', field: 'options[1].touches', problem: 'not-a-list'
  },
  'intake-empty':       { reason: 'intake-empty' },
  'pictures-not-taken': { reason: 'pictures-not-taken', jobId: 'J3', kind: 'build' },
  'job-move-illegal':   {
    reason: 'job-move-illegal', jobId: 'J3', state: 'running', targetState: 'landing'
  },
  'merge-queue-of-a-ticket-not-in-review': { reason: 'merge-queue-of-a-ticket-not-in-review', ticketId: '004', status: 'pending' },
  'merge-queue-without-a-current-green':   { reason: 'merge-queue-without-a-current-green', ticketId: '004', headTree: 'abc123' },
  'merge-approval-off':                    { reason: 'merge-approval-off', ticketId: '004' },
  'merge-accept-of-a-ticket-not-waiting':  { reason: 'merge-accept-of-a-ticket-not-waiting', ticketId: '004', status: 'pending' },
  'merge-accept-would-conflict':           {
    reason: 'merge-accept-would-conflict', ticketId: '004', target: 'main', conflictedFiles: ['README.md']
  },
  'merge-accept-prediction-failed': {
    reason: 'merge-accept-prediction-failed', ticketId: '004', target: 'main', gitReason: 'Example reason'
  },
  'merge-update-of-a-ticket-not-waiting': { reason: 'merge-update-of-a-ticket-not-waiting', ticketId: '004', status: 'pending' },
  'merge-update-failed':                  {
    reason: 'merge-update-failed', ticketId: '004', target: 'main', gitReason: 'Example reason'
  },
  'airlock-held':                    { reason: 'airlock-held', target: 'main', jobId: 'J3' },
  'merge-candidate-not-queued':      { reason: 'merge-candidate-not-queued', ticketId: '004', target: 'main' },
  'higher-priority-queued':          { reason: 'higher-priority-queued', ticketId: '004', queuedTicketIds: ['005'] },
  'refresh-beside-a-queued-release': { reason: 'refresh-beside-a-queued-release', group: 'checkout-redesign', releaseTicketId: '005' },
  'unknown-decision':                { reason: 'unknown-decision', decisionId: 'E9' },
  'decision-already-answered':       { reason: 'decision-already-answered', decisionId: 'E7' },
  'decision-answer-count':           {
    reason: 'decision-answer-count', decisionId: 'E7', answerCount: 1, questionCount: 2
  },
  'decision-without-questions':     { reason: 'decision-without-questions' },
  'decision-questions-repeat':      { reason: 'decision-questions-repeat', question: 'Example question?' },
  'decision-has-several-questions': { reason: 'decision-has-several-questions', decisionId: 'E7', questionCount: 2 },
  'decision-option-unknown':        {
    reason: 'decision-option-unknown', decisionId: 'E7', questionNumber: 1, choice: 'E', optionCount: 2
  },
  'decision-single-choice': {
    reason: 'decision-single-choice', decisionId: 'E7', questionNumber: 1, choice: 'A,B'
  },
  'unknown-incident':        { reason: 'unknown-incident', incidentId: 'I9' },
  'incident-closed':         { reason: 'incident-closed', incidentId: 'I3' },
  'incident-not-a-question': { reason: 'incident-not-a-question', incidentId: 'I3', kind: 'quiet-job' },
  'job-awaits-user-answer':  { reason: 'job-awaits-user-answer', jobId: 'J3' },
  'job-is-product-owner':    { reason: 'job-is-product-owner', jobId: 'J3' },
  'no-open-incident':        { reason: 'no-open-incident', subject: 'Job J3', move: 'job-fresh' },
  'several-open-incidents':  {
    reason: 'several-open-incidents', subject: 'Job J3', move: 'job-fresh', incidentIds: ['I1', 'I2']
  },
  'worktree-in-use':               { reason: 'worktree-in-use', ticketId: '004', jobIds: ['J3'] },
  'worktree-has-uncommitted-work': { reason: 'worktree-has-uncommitted-work', ticketId: '004', worktreePath: '/example/worktree' },
  'worktree-repair-failed':        {
    reason: 'worktree-repair-failed', ticketId: '004', step: 'reset', gitReason: 'Example reason'
  },
  'ticket-id-already-filed':   { reason: 'ticket-id-already-filed', ticketId: '004' },
  'gate-without-phase':        { reason: 'gate-without-phase', gateName: 'verify' },
  'unknown-gate-phase':        { reason: 'unknown-gate-phase', phase: 'deploy', phases: ['build', 'review', 'merge'] },
  'phase-order-not-a-reorder': {
    reason: 'phase-order-not-a-reorder', phase: 'merge', names: ['verify'], phaseGateNames: ['verify', 'lint']
  },
  'setup-in-progress':         { reason: 'setup-in-progress', setupId: 'S1' },
  'no-setup-open':             { reason: 'no-setup-open', setupId: 'S1' },
  'pipeline-setup-unreadable': { reason: 'pipeline-setup-unreadable', problem: 'Example problem' },
  'no-pipeline-to-update':     { reason: 'no-pipeline-to-update', mode: 'update' },
  'pipeline-apply-pending':    { reason: 'pipeline-apply-pending', setupId: 'S1' },
  'no-apply-pending':          { reason: 'no-apply-pending', setupId: 'S1' },
  'pipeline-check-running':    { reason: 'pipeline-check-running', setupId: 'S1' },
  'no-gate-to-check':          { reason: 'no-gate-to-check', setupId: 'S1' },
  'setup-question-open':       { reason: 'setup-question-open', setupId: 'S1', questionIds: ['Q1'] },
  'setup-step-needs-recheck':  { reason: 'setup-step-needs-recheck', setupId: 'S1', steps: ['design'] },
  'setup-snapshot-touched':    { reason: 'setup-snapshot-touched', setupId: 'S1' },
  'pipeline-moved':            {
    reason: 'pipeline-moved', setupId: 'S1', baseContentHash: 'hash-example', contentHash: null
  },
  'constitution-moved': {
    reason: 'constitution-moved', setupId: 'S1', baseBlob: 'blob-example', mainBlob: null
  },
  'billing-cap-not-positive': { reason: 'billing-cap-not-positive', maxBudgetUsd: 0 },
  'setup-step-not-current':   {
    reason: 'setup-step-not-current', setupId: 'S1', step: 'design', currentStep: 'research'
  },
  'setup-step-not-reached':      { reason: 'setup-step-not-reached', setupId: 'S1', step: 'apply' },
  'setup-step-not-continued':    { reason: 'setup-step-not-continued', setupId: 'S1', step: 'apply' },
  'unknown-setup-question':      { reason: 'unknown-setup-question', setupId: 'S1', questionId: 'Q9' },
  'empty-setup-answer':          { reason: 'empty-setup-answer', setupId: 'S1', questionId: 'Q1' },
  'setup-question-option-count': {
    reason: 'setup-question-option-count', optionCount: 1, minimum: 2, maximum: 4
  },
  'setup-question-without-recommendation':           { reason: 'setup-question-without-recommendation' },
  'unknown-setup-option-letters':                    { reason: 'unknown-setup-option-letters', unknownLetters: ['Z'], optionLetters: ['A', 'B'] },
  'several-letters-on-single-select-setup-question': { reason: 'several-letters-on-single-select-setup-question', letters: ['A', 'B'] },
  'constitution-empty':                              { reason: 'constitution-empty' },
  'constitution-too-long':                           { reason: 'constitution-too-long', characterCount: 9000, limit: 8000 },
  'constitution-source-unanchored':                  { reason: 'constitution-source-unanchored', lineText: 'Example line', occurrence: 2 },
  'constitution-source-repeated':                    { reason: 'constitution-source-repeated', lineText: 'Example line', occurrence: 1 },
  'constitution-source-not-ticked':                  {
    reason: 'constitution-source-not-ticked', lineText: 'Example line', occurrence: 1, kind: 'research'
  },
  'constitution-draft-stale': {
    reason: 'constitution-draft-stale', setupId: 'S1', revision: 2, currentRevision: 3
  },
  'pipeline-draft-stale': {
    reason: 'pipeline-draft-stale', setupId: 'S1', revision: 2, currentRevision: 3
  },
  'no-draft-edits':              { reason: 'no-draft-edits', setupId: 'S1' },
  'draft-edit-name-mismatch':    { reason: 'draft-edit-name-mismatch', field: 'gates.verify', name: 'lint' },
  'prepare-order-not-a-reorder': { reason: 'prepare-order-not-a-reorder', names: ['install'], prepareNames: ['install', 'build'] },
  'unknown-setup-edit':          { reason: 'unknown-setup-edit', setupId: 'S1', editId: 'E9' },
  'setup-edit-already-undone':   { reason: 'setup-edit-already-undone', setupId: 'S1', editId: 'E1' },
  'gate-profiles-unreadable':    { reason: 'gate-profiles-unreadable', problem: 'Example problem' },
  'gate-profile-running':        {
    reason: 'gate-profile-running', gateName: 'verify', phase: 'merge', profileRunId: 'P1'
  },
  'unknown-profile-run': { reason: 'unknown-profile-run', profileRunId: 'P9' },
};

const ROOT = '/example/repository';
const URL = 'http://127.0.0.1:4242';
const BATON = '/example/overseer/baton-1.json';

const SAMPLE_OF_KIND: { readonly [Kind in DetailKind]: Extract<OperationRefusalDetail, { kind: Kind }> } = {
  'board-refusal':            { kind: 'board-refusal', boardRefusal: BOARD_SAMPLE_OF_REASON['unknown-task'] },
  'unreadable-tracker':       { kind: 'unreadable-tracker', reading: { verdict: 'absent', filePath: `${ROOT}/progress.json` } },
  'no-tracker-at-override':   { kind: 'no-tracker-at-override', overrideDirectory: ROOT },
  'no-tracker-found':         { kind: 'no-tracker-found', searchedFrom: ROOT },
  'tracker-lock-held':        { kind: 'tracker-lock-held', lockDirectoryPath: `${ROOT}/lock` },
  'lock-taken-over':          { kind: 'lock-taken-over', lockDirectoryPath: `${ROOT}/lock` },
  'malformed-hold-journal':   { kind: 'malformed-hold-journal', journalFilePath: `${ROOT}/journal.json`, reason: 'Example reason' },
  'hold-journal-unremovable': { kind: 'hold-journal-unremovable', journalFilePath: `${ROOT}/journal.json`, reason: 'Example reason' },
  'install-version-mismatch': {
    kind: 'install-version-mismatch', rootDirectory: ROOT, manifestFilePath: `${ROOT}/version.json`, installVersion: 30, mismatch: { reason: 'unversioned' }
  },
  'older-program-present': {
    kind: 'older-program-present', rootDirectory: ROOT, olderDataFolderPath: `${ROOT}/.older`, program: 'example-build', olderProgram: 'example-release'
  },
  'no-readable-ticket':    { kind: 'no-readable-ticket', reference: '999' },
  'malformed-ticket-file': {
    kind: 'malformed-ticket-file', filePath: `${ROOT}/004.md`, line: 2, reason: 'Example reason'
  },
  'unreadable-file-in-the-way':       { kind: 'unreadable-file-in-the-way', filePath: `${ROOT}/epic.md`, record: 'epic' },
  'malformed-pipeline':               { kind: 'malformed-pipeline', filePath: `${ROOT}/pipeline.json`, reason: 'Example reason' },
  'role-command-refused':             { kind: 'role-command-refused', reason: 'worker-filing-flag', commandKind: 'ticket add' },
  'verb-not-relayable':               { kind: 'verb-not-relayable', verb: 'init', jobId: 'J3' },
  'malformed-hatch-reply':            { kind: 'malformed-hatch-reply', replyFilePath: `${ROOT}/reply.json` },
  'overseer-already-running':         { kind: 'overseer-already-running', url: URL, batonFilePath: BATON },
  'overseer-down':                    { kind: 'overseer-down', overseerDirectory: '/example/overseer' },
  'overseer-contended':               { kind: 'overseer-contended', overseerDirectory: '/example/overseer' },
  'gate-confinement-unavailable':     { kind: 'gate-confinement-unavailable', reason: 'Example reason' },
  'malformed-overseer-poll-interval': { kind: 'malformed-overseer-poll-interval', variable: 'EXAMPLE_POLL_INTERVAL', value: 'soon' },
  'malformed-versions-answer':        { kind: 'malformed-versions-answer', variable: 'EXAMPLE_VERSIONS_ANSWER', value: 'newest' },
  'git-below-floor':                  { kind: 'git-below-floor', foundVersion: '2.30.0', floorVersion: '2.38.0' },
  'baton-taken':                      { kind: 'baton-taken', batonFilePath: BATON },
  'baton-not-created-whole':          { kind: 'baton-not-created-whole', batonFilePath: BATON, reason: 'Example reason' },
  'overseer-port-in-use':             { kind: 'overseer-port-in-use', firstPort: 4242, lastPort: 4252 },
  'overseer-identity-unreadable':     { kind: 'overseer-identity-unreadable', processId: 4242, identitySources: [] },
  'overseer-did-not-start':           { kind: 'overseer-did-not-start', exitCode: 1, logFilePath: '/example/overseer.log' },
  'overseer-still-live':              { kind: 'overseer-still-live', url: URL, processId: 4242 },
  'baton-pass-failed':                {
    kind: 'baton-pass-failed', successorCodeVersion: 'code-example', step: 'take-baton', error: 'Example error', url: URL
  },
  'overseer-control-is-runtime-only': { kind: 'overseer-control-is-runtime-only', commandKind: 'overseer-stop' },
  'intake-close-without-job':         { kind: 'intake-close-without-job' },
  'intake-title-without-job':         { kind: 'intake-title-without-job' },
  'question-options-without-job':     { kind: 'question-options-without-job' },
  'picture-unknown':                  { kind: 'picture-unknown', pictureId: 'example-picture' },
  'too-many-pictures':                { kind: 'too-many-pictures', pictureCount: 9, limit: 8 },
  'picture-too-large':                { kind: 'picture-too-large', bytes: 9, sizeLimitBytes: 8 },
  'picture-type-unsupported':         { kind: 'picture-type-unsupported', mediaTypes: ['image/png'] },
  'overseer-owns-the-lifecycle':      { kind: 'overseer-owns-the-lifecycle', url: URL, batonFilePath: BATON },
  'watcher-bundle-failed':            { kind: 'watcher-bundle-failed', entryPath: '/example/watcher.ts', reason: 'Example reason' },
  'watcher-endpoint-does-not-fit':    { kind: 'watcher-endpoint-does-not-fit', endpoint: '/example/watcher.sock' },
  'ticket-has-live-job':              {
    kind: 'ticket-has-live-job', ticketId: '004', jobId: 'J3', state: 'running'
  },
  'chart-range-bound-unreadable':   { kind: 'chart-range-bound-unreadable', bound: 'from', written: 'soon' },
  'chart-range-backwards':          { kind: 'chart-range-backwards', from: 'now', to: '-2h' },
  'chart-range-tick-unreadable':    { kind: 'chart-range-tick-unreadable', tickMinutes: '0' },
  'tracker-has-live-jobs':          { kind: 'tracker-has-live-jobs', jobIds: ['J3'] },
  'malformed-hatch-request':        { kind: 'malformed-hatch-request', requestId: 'R1' },
  'hatch-identity-mismatch':        { kind: 'hatch-identity-mismatch', requestId: 'R1', jobId: 'J3' },
  'overseer-not-answering':         { kind: 'overseer-not-answering', url: URL },
  'login-item-unavailable':         { kind: 'login-item-unavailable', reason: 'Example reason' },
  'login-item-not-changed':         { kind: 'login-item-not-changed', location: '/example/login-item', reason: 'Example reason' },
  'machine-agent-limit-above-cpus': { kind: 'machine-agent-limit-above-cpus', limit: 99, ceiling: 8 },
  'machine-agent-limit-not-whole':  { kind: 'machine-agent-limit-not-whole', limit: 0.5 },
  'concurrency-limit-out-of-range': { kind: 'concurrency-limit-out-of-range', limit: 99, ceiling: 8 },
  'machine-limits-newer-version':   { kind: 'machine-limits-newer-version', filePath: '/example/machine-limits.json', version: 9 },
  'older-pipeline':                 { kind: 'older-pipeline', filePath: '/example/pipeline.json' },
  'malformed-setup-command':        { kind: 'malformed-setup-command', commandKind: 'pipeline-setup-answer', field: 'letters' },
  'pipeline-draft-invalid':         { kind: 'pipeline-draft-invalid', setupId: 'S1', reason: 'Example reason' },
  'main-constitution-unreadable':   { kind: 'main-constitution-unreadable', reason: 'Example reason' },
};

/** Only a session's own relayed command meets these: the Hatch answers them, and no API route words them. */
const SESSION_ONLY_KINDS: readonly DetailKind[] = ['role-command-refused', 'verb-not-relayable'];

function apiSentenceOf(detail: OperationRefusalDetail): string {
  return OperationRefusalWordingUtil.apiMessageOf(new OperationRefusal('refused', detail));
}

describe('OperationRefusalWordingUtil.apiMessageOf over every refusal', () => {
  test('no Board reason names a command line or a flag through the API', () => {
    const reasonsNamingOne = Object.values(BOARD_SAMPLE_OF_REASON)
      .filter((boardRefusal) => COMMAND_LINE_FORM.test(apiSentenceOf({ kind: 'board-refusal', boardRefusal })))
      .map((boardRefusal) => boardRefusal.reason);
    expect(reasonsNamingOne).toEqual([]);
  });

  test('no detail kind names a command line or a flag through the API, but the session-only kinds, which are exactly those that do', () => {
    const kindsNamingOne = Object.values(SAMPLE_OF_KIND).filter((detail) => COMMAND_LINE_FORM.test(apiSentenceOf(detail))).map((detail) => detail.kind);
    expect(kindsNamingOne).toEqual([...SESSION_ONLY_KINDS]);
  });
});
