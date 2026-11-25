/**
 * The log's vocabulary: every record kind with what it is about and the shape of each field, in the order the record stores them. The
 * record types in `src/lib/tracker-model/@types/LogRecord.ts` are derived from it, and so are the stored check and the mapping back, so a
 * new kind is one entry here plus its wording and its emitter.
 */

export type LogRecordSubject =
  | 'board'
  | 'ticket'
  | 'epic'
  | 'draft'
  | 'pipeline-setup'
  | 'gate-profile'
  | 'review-bar'
  | 'job'
  | 'decision'
  | 'incident';

export type LogFieldShape =
  | 'text'
  | 'task-id'
  | 'optional-text'
  | 'priority'
  | 'ticket-size'
  | 'optional-size'
  | 'agent-pair'
  | 'ticket-ids'
  | 'epic-keys'
  | 'network-domains'
  | 'review-round'
  | 'chart-range'
  | 'concurrency-limit'
  | 'hephaestus-state'
  | 'dispatcher-state'
  | 'dispatcher-run-id'
  | 'check-command'
  | 'count'
  | 'optional-count'
  | 'review-bar-round'
  | 'review-verdict'
  | 'review-claims'
  | 'review-findings'
  | 'nullable-text'
  | 'job-kind'
  | 'job-role'
  | 'job-outcome'
  | 'interruption-cause'
  | 'child-instance'
  | 'permission-names'
  | 'hephaestus-stop-reason'
  | 'start-kind'
  | 'start-origin'
  | 'job-stop-mode'
  | 'decision-kind'
  | 'decision-answer'
  | 'incident-kind'
  | 'incident-move'
  | 'incident-default-cause'
  | 'gate-outcome'
  | 'file-paths'
  | 'gate-phase'
  | 'gate-names'
  | 'landing-kind'
  | 'flag'
  | 'optional-flag'
  | 'optional-cost-usd'
  | 'optional-pictures'
  | 'optional-ticket-ids'
  | 'optional-refusal-status'
  | 'optional-refusal-detail'
  | 'optional-cache-reports'
  | 'pipeline-step-kind'
  | 'lost-line-kind'
  | 'optional-gate-phase'
  | 'pipeline-step-ending'
  | 'setup-mode'
  | 'billing-mode'
  | 'setup-step'
  | 'setup-step-state'
  | 'setup-steps'
  | 'setup-item-ids'
  | 'draft-fields'
  | 'gate-profile-ending'
  | 'flint-brain-starter'
  | 'flint-brain-ended-reason'
  | 'entity-assigner'
  | 'customs-checks';

export interface LogRecordKindSchema {
  subject: LogRecordSubject;
  fields:  Readonly<Record<string, LogFieldShape>>;
}

const NO_FIELDS = {} as const;

/** The ids each subject sets beside `kind`, in stored order: a review bar carries its task id before its ticket id. */
export const LOG_RECORD_SUBJECT_IDS = {
  'board':          NO_FIELDS,
  'ticket':         { ticketId: 'text' },
  'epic':           { epicKey: 'text' },
  'draft':          { draftId: 'text' },
  'pipeline-setup': { setupId: 'text' },
  'gate-profile':   { profileRunId: 'text' },
  'review-bar':     { taskId: 'task-id', ticketId: 'text' },
  'job':            { jobId: 'text' },
  'decision':       { decisionId: 'text' },
  'incident':       { incidentId: 'text' },
} as const satisfies Readonly<Record<LogRecordSubject, Readonly<Record<string, LogFieldShape>>>>;

export const LOG_RECORD_SCHEMA = {
  'note':         { subject: 'board', fields: { text: 'text' } },
  // A job's filing also records what the ticket was filed as, so verification reads the filing, never what triage made of it since.
  'ticket-filed': {
    subject: 'ticket',
    fields:  {
      title: 'text', status: 'optional-text', priority: 'optional-text', filedByJob: 'optional-text'
    },
  },
  // A passing review queued the ticket to land on `target`.
  'merge-queued':                   { subject: 'ticket', fields: { target: 'text' } },
  // With merge approval on: User accepted the ticket for its Airlock (`accepted`), or the Airlock or a lost review took it back (`cleared`).
  'merge-acceptance-set':           { subject: 'ticket', fields: { state: 'text' } },
  // `merge update`: the target merged into the ticket's worktree (`merged`), or conflicted and was aborted (`conflicted`).
  'merge-updated':                  { subject: 'ticket', fields: { target: 'text', outcome: 'text' } },
  'ticket-committed':               { subject: 'ticket', fields: NO_FIELDS },
  // The ticket waits for User's `ticket ready`: its filer closed it while ticket review is on, its finder was abandoned, or it is a v16 leftover.
  'ticket-submitted-for-review':    { subject: 'ticket', fields: NO_FIELDS },
  // A code-implemented repair of the ticket's worktree ran; `patchPath` is where `recreate` saved its changes, when there were any.
  'worktree-repaired':              { subject: 'ticket', fields: { step: 'text', patchPath: 'nullable-text' } },
  'ticket-reopened':                { subject: 'ticket', fields: NO_FIELDS },
  // User's `ticket unready`: a committed ticket no job had taken went back into draft, its row and kept content gone.
  'ticket-unreadied':               { subject: 'ticket', fields: NO_FIELDS },
  'ticket-started':                 { subject: 'ticket', fields: NO_FIELDS },
  'ticket-finished':                { subject: 'ticket', fields: NO_FIELDS },
  'ticket-approved':                { subject: 'ticket', fields: NO_FIELDS },
  // `byHand` is set only by `ticket deliver --by-hand`, which records work Hephaestus never merged or landed.
  'ticket-delivered':               { subject: 'ticket', fields: { byHand: 'optional-flag' } },
  'ticket-abandoned':               { subject: 'ticket', fields: { reason: 'text' } },
  'ticket-retitled':                { subject: 'ticket', fields: { from: 'text', to: 'text' } },
  // The store found the ticket's stored text changed behind it and wrote the content its hash keeps back into it.
  'ticket-content-restored':        { subject: 'ticket', fields: NO_FIELDS },
  'ticket-rereviewed':              { subject: 'ticket', fields: { round: 'review-round' } },
  'ticket-priority-changed':        { subject: 'ticket', fields: { from: 'priority', to: 'priority' } },
  // `from` is absent when the ticket had no size.
  'ticket-size-changed':            { subject: 'ticket', fields: { from: 'optional-size', to: 'ticket-size' } },
  'ticket-dependencies-set':        { subject: 'ticket', fields: { dependsOn: 'ticket-ids' } },
  // `introducedBy` is absent when the cause was cleared.
  'ticket-introduced-by-set':       { subject: 'ticket', fields: { introducedBy: 'optional-text' } },
  'ticket-agents-changed':          { subject: 'ticket', fields: { from: 'agent-pair', to: 'agent-pair' } },
  'ticket-held':                    { subject: 'ticket', fields: { reason: 'text' } },
  'ticket-unheld':                  { subject: 'ticket', fields: NO_FIELDS },
  // User's resume lifted a hold an interruption put on; logged in place of `ticket-unheld`, so no count resets.
  'ticket-interrupted-hold-lifted': { subject: 'ticket', fields: { hold: 'text' } },
  'ticket-release-marked':          { subject: 'ticket', fields: { group: 'text' } },
  'ticket-release-cleared':         { subject: 'ticket', fields: NO_FIELDS },
  'ticket-grouped':                 { subject: 'ticket', fields: { group: 'text' } },
  'ticket-epics-set':               { subject: 'ticket', fields: { epics: 'epic-keys' } },
  // An empty `domains` cleared the line.
  'ticket-network-set':             { subject: 'ticket', fields: { domains: 'network-domains' } },
  // The reason is kept here alone, never on the ticket.
  'entity-assigned':                { subject: 'ticket', fields: { entity: 'text', reason: 'text', by: 'entity-assigner' } },
  // A build stage's job of the ticket declared work it needs in another entity; Hephaestus files that work as its own ticket.
  'need-declared':                  { subject: 'ticket', fields: { entity: 'text', title: 'text', byJob: 'text' } },
  // E26: Hephaestus filed tickets of a dependent entity in the crossing ticket's group, which wait on the crossing ticket.
  'dependent-fix-filed':            { subject: 'ticket', fields: { entity: 'text', fixTicketIds: 'ticket-ids' } },
  // The ticket's spec and plan opened: from now on its documents, not its body, judge its readiness.
  'ticket-documents-opened':        { subject: 'ticket', fields: NO_FIELDS },
  'ticket-document-versioned':      { subject: 'ticket', fields: { document: 'text', number: 'count', author: 'text' } },
  // `onSpecNumber` is set only on a plan's approval.
  'ticket-document-approved':       {
    subject: 'ticket',
    fields:  {
      document: 'text', number: 'count', by: 'text', onSpecNumber: 'optional-count'
    }
  },
  'ticket-document-message-queued':   { subject: 'ticket', fields: { document: 'text', messageId: 'text' } },
  'ticket-document-proposed':         { subject: 'ticket', fields: { document: 'text', proposalId: 'text' } },
  'ticket-document-proposal-settled': { subject: 'ticket', fields: { document: 'text', proposalId: 'text', state: 'text' } },
  'ticket-document-mode-set':         { subject: 'ticket', fields: { document: 'text', mode: 'text' } },
  // A document agent's turn changed its read-only snapshot: `checks` are the Customs checks that failed, and the job ended `failed`.
  'ticket-document-snapshot-touched': { subject: 'ticket', fields: { document: 'text', jobId: 'text', checks: 'customs-checks' } },
  // A crossing ticket's row moved into `stage`, run by the agents of `entity`; a stage job never moves the ticket's status.
  'stage-started':                    { subject: 'ticket', fields: { stage: 'text', entity: 'text' } },
  // A package review sealed the ticket's own change to package `entity`; `seal` is its hash, as the row stores it.
  'seal-set':                         { subject: 'ticket', fields: { entity: 'text', seal: 'text' } },
  'seal-lifted':                      { subject: 'ticket', fields: { entity: 'text' } },
  // The ticket went back from `fromStage` to the package build of `entity`; `returns` counts every package return of the ticket.
  'package-return':                   { subject: 'ticket', fields: { entity: 'text', fromStage: 'text', returns: 'count' } },
  'ticket-check-command-restamped':   { subject: 'ticket', fields: { command: 'check-command' } },
  'epic-added':                       { subject: 'epic', fields: { title: 'text' } },
  'epic-edited':                      { subject: 'epic', fields: { title: 'text' } },
  'epic-removed':                     { subject: 'epic', fields: NO_FIELDS },
  'draft-opened':                     { subject: 'draft', fields: { title: 'text', owner: 'text' } },
  // `takenFrom` is set only when a forced claim took the draft from another owner.
  'draft-claimed':                    { subject: 'draft', fields: { owner: 'text', takenFrom: 'optional-text' } },
  'draft-released':                   { subject: 'draft', fields: { owner: 'text' } },
  'draft-closed':                     { subject: 'draft', fields: { ticketIds: 'ticket-ids' } },
  'draft-abandoned':                  { subject: 'draft', fields: { reason: 'text' } },
  'draft-note-added':                 { subject: 'draft', fields: { noteId: 'text', noteKind: 'text' } },
  'draft-question-asked':             { subject: 'draft', fields: { questionId: 'text', underQuestionId: 'optional-text' } },
  // `answer` is the option letters joined by commas, or the free text: the log keeps every answer, the draft only the current one.
  'draft-question-answered':          { subject: 'draft', fields: { questionId: 'text', answer: 'text' } },
  // A dropped question's follow-ups are dropped too, one record each after it.
  'draft-item-dropped':               { subject: 'draft', fields: { itemId: 'text' } },
  'pipeline-setup-opened':            { subject: 'pipeline-setup', fields: { mode: 'setup-mode', replacesUnreadablePipeline: 'flag' } },
  // `maxBudgetUsd` is set only on API billing with a cap.
  'pipeline-setup-billing-set':       { subject: 'pipeline-setup', fields: { mode: 'billing-mode', maxBudgetUsd: 'optional-cost-usd' } },
  // `program` is `machine` for the machine's program of `vendor`, else the path this forge alone runs.
  'pipeline-setup-agent-set':         { subject: 'pipeline-setup', fields: { vendor: 'text', program: 'text' } },
  // `step` took `state`; `currentStep` is where the setup now stands; `needsRecheck` the later steps a reopening sent back.
  'pipeline-setup-step-moved':        {
    subject: 'pipeline-setup',
    fields:  {
      step: 'setup-step', state: 'setup-step-state', currentStep: 'setup-step', needsRecheck: 'setup-steps'
    },
  },
  // The pipeline agent suggests User may continue `step`; no step moves.
  'pipeline-step-ready-suggested': { subject: 'pipeline-setup', fields: { step: 'setup-step' } },
  // The snapshot moved to `snapshotCommit`; `changedPaths` changed on main since the earlier one.
  'pipeline-setup-resumed':        { subject: 'pipeline-setup', fields: { snapshotCommit: 'text', changedPaths: 'file-paths' } },
  // A turn end of the pipeline agent found its snapshot changed: Customs `check` refused it for `reason`, until the next resume.
  'pipeline-snapshot-touched':     { subject: 'pipeline-setup', fields: { check: 'text', reason: 'text' } },
  'pipeline-finding-recorded':     { subject: 'pipeline-setup', fields: { findingId: 'text', topic: 'text' } },
  'pipeline-question-asked':       { subject: 'pipeline-setup', fields: { questionId: 'text', step: 'setup-step' } },
  // `answer` is the option letters joined by commas, or the free text.
  'pipeline-question-answered':    { subject: 'pipeline-setup', fields: { questionId: 'text', answer: 'text' } },
  // `by` is `agent` or `user`; `revision` is the constitution's new revision.
  'pipeline-constitution-set':     { subject: 'pipeline-setup', fields: { by: 'text', revision: 'count' } },
  // One record for the edits of one move, in order; `revision` is the draft's new revision.
  'pipeline-draft-edited':         {
    subject: 'pipeline-setup',
    fields:  {
      by: 'text', revision: 'count', editIds: 'setup-item-ids', fields: 'draft-fields'
    },
  },
  'pipeline-draft-undone':    { subject: 'pipeline-setup', fields: { editId: 'text', field: 'text', revision: 'count' } },
  'pipeline-draft-discarded': { subject: 'pipeline-setup', fields: { revision: 'count' } },
  'pipeline-setup-discarded': { subject: 'pipeline-setup', fields: NO_FIELDS },
  // User's press queued one gate in one phase; `setupId` is the record whose draft the gate came from, `null` for the stored pipeline.
  'gate-profile-requested':   { subject: 'gate-profile', fields: { gateName: 'text', phase: 'gate-phase', setupId: 'nullable-text' } },
  // The run ended by itself; `elapsedMilliseconds` is recorded and shown only.
  'gate-profiled':            {
    subject: 'gate-profile',
    fields:  {
      gateName: 'text', phase: 'gate-phase', state: 'gate-profile-ending', elapsedMilliseconds: 'count'
    },
  },
  // User's Stop, or a Hephaestus start that found the run left running: no result.
  'gate-profile-stopped':     { subject: 'gate-profile', fields: { gateName: 'text', phase: 'gate-phase' } },
  // User asked for a check of the gates draft `revision` changes or adds; Hephaestus runs them twice.
  'pipeline-check-requested': { subject: 'pipeline-setup', fields: { revision: 'count', gateNames: 'gate-names' } },
  // Stage 1 of an Apply waits for the constitution commit of draft `revision`.
  'pipeline-apply-requested': { subject: 'pipeline-setup', fields: { revision: 'count', resumesBoard: 'flag' } },
  // The constitution commit waits, or was refused, for the stored `reason` code: held with the files that block the main checkout, refused
  // with git's own text when git refused.
  'pipeline-apply-held':      { subject: 'pipeline-setup', fields: { reason: 'text', blockingFiles: 'file-paths' } },
  'pipeline-apply-refused':   { subject: 'pipeline-setup', fields: { reason: 'text', gitFailure: 'nullable-text' } },
  // `state` is the one the request was in when User cancelled it.
  'pipeline-apply-cancelled': { subject: 'pipeline-setup', fields: { revision: 'count', state: 'text' } },
  // The draft of `revision` is the stored pipeline; `constitutionCommit` is null when no commit was made.
  'pipeline-applied':         {
    subject: 'pipeline-setup',
    fields:  {
      revision:           'count',
      resumesBoard:       'flag',
      changedFields:      'draft-fields',
      newFields:          'draft-fields',
      removedFields:      'draft-fields',
      constitutionCommit: 'nullable-text',
    },
  },
  // A review bar's `name` is carried because the sentence prints the row's stored name, which an edit may have made anything.
  'review-bar-started': { subject: 'review-bar', fields: { name: 'text' } },
  'review-bar-closed':  { subject: 'review-bar', fields: { name: 'text' } },
  // One reviewer pass: the rework is code lines only, the fix and rebase parts apart, and the builder's change is measured at the review's start.
  'review-recorded':    {
    subject: 'review-bar',
    fields:  {
      round:                   'review-bar-round',
      verdict:                 'review-verdict',
      reviewStartCommit:       'text',
      fixReworkedCodeLines:    'count',
      rebaseReworkedCodeLines: 'count',
      totalReworkedCodeLines:  'count',
      builderChangedFiles:     'count',
      builderInsertions:       'count',
      builderDeletions:        'count',
      claims:                  'review-claims',
      findings:                'review-findings',
    },
  },
  'chart-range-set':             { subject: 'board', fields: { view: 'chart-range' } },
  'concurrency-limit-set':       { subject: 'board', fields: { limit: 'concurrency-limit' } },
  'hephaestus-set':              { subject: 'board', fields: { state: 'hephaestus-state' } },
  'dispatcher-set':              { subject: 'board', fields: { state: 'dispatcher-state', runId: 'dispatcher-run-id' } },
  'pipeline-prepare-step-set':   { subject: 'board', fields: { name: 'text', run: 'text' } },
  'pipeline-gate-added':         { subject: 'board', fields: { name: 'text', run: 'text' } },
  'pipeline-gates-none':         { subject: 'board', fields: NO_FIELDS },
  'pipeline-gate-removed':       { subject: 'board', fields: { name: 'text' } },
  // `names` is the whole new run order of the gates `phase` runs.
  'pipeline-gates-ordered':      { subject: 'board', fields: { phase: 'gate-phase', names: 'gate-names' } },
  // `state` is `on` or `off`: whether User approves what `approval` names, such as `tickets`, before it moves on.
  'pipeline-approval-set':       { subject: 'board', fields: { approval: 'text', state: 'text' } },
  'pipeline-assistant-set':      { subject: 'board', fields: { state: 'text' } },
  // `program` is `machine` for the machine's program of `vendor`, else the path this forge alone runs.
  'pipeline-agent-set':          { subject: 'board', fields: { vendor: 'text', program: 'text' } },
  // `paths` are the tools' paths as found; empty is the list removed, so the tools follow the pipeline again.
  'pipeline-tools-set':          { subject: 'board', fields: { paths: 'file-paths' } },
  // An empty `paths` is the reach cleared.
  'pipeline-reach-set':          { subject: 'board', fields: { paths: 'file-paths' } },
  'branch-namespace-set':        { subject: 'board', fields: { namespace: 'text' } },
  // This kind and the four after it are in `RETIRED_LOG_RECORD_KINDS`: read, never logged.
  'check-command-set':           { subject: 'board', fields: { command: 'check-command' } },
  'install-command-set':         { subject: 'board', fields: { command: 'text' } },
  // An empty `patterns` is the list cleared.
  'checks-definition-files-set': { subject: 'board', fields: { patterns: 'file-paths' } },
  'gate-key-command-set':        { subject: 'board', fields: { command: 'check-command' } },
  // An empty `paths` is the list cleared.
  'gate-cache-paths-set':        { subject: 'board', fields: { paths: 'file-paths' } },
  // `tree` is the gated tree's object id; a cache hit ran nothing and is always `passed`. `cacheReports` is written only once a gate reported.
  'gate-ran':                    {
    subject: 'board',
    fields:  {
      tree: 'text', outcome: 'gate-outcome', cached: 'flag', cacheReports: 'optional-cache-reports'
    }
  },
  // One pipeline step line that ran and its run time, a sleep not counted: recorded and shown only, never compared or waited on.
  // `phase` is absent for a job's install step, `entity` on a forge without entities.
  'pipeline-step-ran': {
    subject: 'board',
    fields:  {
      stepKind: 'pipeline-step-kind', stepName: 'text', phase: 'optional-gate-phase', entity: 'optional-text', runMilliseconds: 'count', ending: 'pipeline-step-ending'
    }
  },
  'tracker-cleared':    { subject: 'board', fields: NO_FIELDS },
  'hephaestus-started': { subject: 'board', fields: { codeVersion: 'text', installVersion: 'count' } },
  'hephaestus-stopped': { subject: 'board', fields: { reason: 'hephaestus-stop-reason' } },
  // What the forge's start found before it; `previousGeneration` only when there is one, `crashSuspected` only when true,
  // `crashLogNumber` only when a crash log exists for this start.
  'start-classified':   {
    subject: 'board',
    fields:  {
      kind: 'start-kind', startOrigin: 'start-origin', previousGeneration: 'optional-count', crashSuspected: 'optional-flag', crashLogNumber: 'optional-count'
    },
  },
  // One run of Flint's brain that ended, with its tokens and model calls in total; the brain is no job, so its record names none.
  'flint-brain-ended': {
    subject: 'board',
    fields:  {
      startedBy: 'flint-brain-starter', startedAt: 'text', endedAt: 'text', endedReason: 'flint-brain-ended-reason', tokens: 'count', calls: 'count'
    },
  },
  // The old Hephaestus keeps driving, or took the board back; `step` names where the successor failed, `error` what it said.
  'restart-failed': { subject: 'board', fields: { successorCodeVersion: 'text', step: 'text', error: 'text' } },
  // A job's state lives in progress.json; only its launch, its interruptions, its resumes and its end are logged.
  'job-launched':   {
    subject: 'job',
    fields:  {
      kind:             'job-kind',
      role:             'job-role',
      ticketIds:        'ticket-ids',
      attempt:          'count',
      target:           'nullable-text',
      parentJobId:      'nullable-text',
      // Set only on a product-owner launch: User's request, kept after the job leaves the board.
      intakeText:       'optional-text',
      // Set only when the request came with pictures.
      intakePictures:   'optional-pictures',
      // Set only on a forge with entities: the entity and the stage the job runs, which scope its red handoffs and failed passes.
      entity:           'optional-text',
      stage:            'optional-count',
      // Set only on the product owner the first Apply over entities starts: the committed tickets it gives an entity.
      entitiesToAssign: 'optional-ticket-ids',
    },
  },
  'job-interrupted':       { subject: 'job', fields: { cause: 'interruption-cause', childInstance: 'child-instance' } },
  // `instructed` only on a resume User instructed, which set the crash resumes back to 0.
  'job-resumed':           { subject: 'job', fields: { childInstance: 'child-instance', cause: 'interruption-cause', instructed: 'optional-flag' } },
  // User asked to resume the interrupted job; `childInstance` is its instance then.
  'job-resume-instructed': { subject: 'job', fields: { childInstance: 'child-instance' } },
  // A start found the job's install or gate line gone with no end of its own; the job keeps its state and the line waits for User's resume.
  'job-line-lost':         { subject: 'job', fields: { line: 'lost-line-kind', cause: 'interruption-cause' } },
  // The vendor refused the job's requests: `window` as the vendor names it, `resetsAt` the ISO stamp no launch or resume precedes.
  'usage-limit-hit':       { subject: 'job', fields: { window: 'text', resetsAt: 'text' } },
  // User's stop, wind-down or fresh agent, recorded whether or not its child is up; Hephaestus sends the frames from the job record.
  'job-stop-requested':    { subject: 'job', fields: { mode: 'job-stop-mode' } },
  // The launch was refused for the agent's program, nothing spawned: `cause` as the job stores it, `programPath` the program named.
  'job-not-launched':      { subject: 'job', fields: { cause: 'text', programPath: 'nullable-text' } },
  // The agent's program changed, or User looked again: the next pass launches the job.
  'job-launch-retried':    { subject: 'job', fields: NO_FIELDS },
  // A chat turn for the session, which Hephaestus writes from the log in order; `pictures` is set only when User sent some.
  // `byHephaestus` is set only on Hephaestus's own wording of User's setup move, so the transcript never reads it as User's.
  'job-messaged':          { subject: 'job', fields: { text: 'text', pictures: 'optional-pictures', byHephaestus: 'optional-flag' } },
  // A message reopened a closed product owner or pipeline agent: `childInstance` resumes its session with `text` (and `pictures`,
  // when set) first; `offeredTicketIds` is recorded only; `byHephaestus` as on `job-messaged`.
  'job-reopened':          {
    subject: 'job',
    fields:  {
      childInstance: 'child-instance', text: 'text', offeredTicketIds: 'ticket-ids', pictures: 'optional-pictures', byHephaestus: 'optional-flag'
    },
  },
  // The product owner's short title for its intake; a later record replaces an earlier one.
  'intake-titled': { subject: 'job', fields: { title: 'text' } },
  // `cause` and `commit` are set only when Hephaestus names them.
  'job-ended':     {
    subject: 'job',
    fields:  {
      outcome:           'job-outcome',
      cause:             'optional-text',
      commit:            'optional-text',
      deniedPermissions: 'permission-names',
    },
  },
  'decision-opened':    { subject: 'decision', fields: { kind: 'decision-kind', ticketIds: 'ticket-ids' } },
  // The question request it answered, so Hephaestus delivers the answer to that request, however long after the answering hold.
  'decision-answered':  { subject: 'decision', fields: { answer: 'decision-answer', requestId: 'optional-text' } },
  'decision-withdrawn': { subject: 'decision', fields: { reason: 'text' } },
  'incident-opened':    { subject: 'incident', fields: { kind: 'incident-kind', ticketIds: 'ticket-ids' } },
  'incident-handled':   { subject: 'incident', fields: { move: 'incident-move' } },
  'incident-defaulted': { subject: 'incident', fields: { move: 'incident-move', cause: 'incident-default-cause' } },
  'incident-escalated': { subject: 'incident', fields: { decisionId: 'text' } },
  // A finding the Assistant records under an open incident, which stays open.
  'incident-noted':     { subject: 'incident', fields: { text: 'text' } },
  // The board's answer to a question incident, keyed by the question's request so Hephaestus delivers it as it delivers a decision's.
  'incident-answered':  { subject: 'incident', fields: { answer: 'decision-answer', requestId: 'optional-text' } },
  // A merge job claimed its target's slot against these recorded tips; the predicted files are empty for a clean prediction.
  'merge-started':      {
    subject: 'job',
    fields:  {
      target: 'text', targetTip: 'text', branchTip: 'text', predictedConflictFiles: 'file-paths'
    },
  },
  // Hephaestus moved `target` to `commit`: the list of tips it landed, which a moved target is judged against.
  'merge-landed':  { subject: 'job', fields: { target: 'text', commit: 'text', kind: 'landing-kind' } },
  // A relayed request Hephaestus answered, so a replay of its request file never applies it twice, with what its reply carried, so a
  // reply lost after the hold committed is written again.
  'hatch-applied': {
    subject: 'job',
    fields:  {
      requestId: 'text', commandKind: 'text', outcome: 'text', ticketIds: 'optional-ticket-ids', status: 'optional-refusal-status', detail: 'optional-refusal-detail'
    },
  },
  // `totalInputTokens` is fresh input plus cache read plus cache creation; the run id and label are stored only for an agent a workflow run spawned.
  'agent-stopped': {
    subject: 'board',
    fields:  {
      agentId:              'text',
      agentType:            'text',
      apiCallCount:         'count',
      endContextTokens:     'count',
      totalInputTokens:     'count',
      cacheReadInputTokens: 'count',
      outputTokens:         'count',
      workflowRunId:        'optional-text',
      agentLabel:           'optional-text',
      // What the vendor said the job's sessions cost, summed over its child instances; stored only when a result named it.
      costUsd:              'optional-cost-usd',
    },
  },
} as const satisfies Readonly<Record<string, LogRecordKindSchema>>;

/** The statuses a refused relayed request's reply carries, as its `hatch-applied` record stores them. */
export const HATCH_REFUSAL_STATUSES = ['refused', 'unrepaired'] as const;

/** The states a retired `dispatcher-set` record holds. */
export const RETIRED_DISPATCHER_STATES = ['running', 'finished', 'stopped'] as const;

/** The kinds the retired `checks` verb and Workflow dispatcher logged: a log holding them still reads, and nothing logs them any more. */
export const RETIRED_LOG_RECORD_KINDS = [
  'dispatcher-set',
  'check-command-set',
  'ticket-check-command-restamped',
  'install-command-set',
  'checks-definition-files-set',
  'gate-key-command-set',
  'gate-cache-paths-set',
] as const satisfies readonly (keyof typeof LOG_RECORD_SCHEMA)[];
