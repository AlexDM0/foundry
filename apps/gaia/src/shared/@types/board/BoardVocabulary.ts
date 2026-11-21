/**
 * Gaia's own unions of the values a forge's board carries. Each is written out here, never taken from the forge's contract, and
 * `VocabularyMapUtil` maps each forge value into one, so a value a forge adds is a compile error in that util and nowhere else.
 */

export type BoardTicketStatus = 'draft' | 'ready-for-review' | 'committed' | 'in-progress' | 'in-review' | 'reviewed' | 'delivered' | 'abandoned';

export type BoardTicketPriority = 'low' | 'normal' | 'high';

export type BoardTicketType = 'ticket' | 'bug' | 'research';

export type BoardTicketSize = 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';

export type BoardTaskStatus = 'committed' | 'in-progress' | 'paused' | 'in-review' | 're-review' | 'reviewed' | 'delivered' | 'abandoned';

export type BoardDisplayState =
  | 'draft'
  | 'ready-for-review'
  | 'committed'
  | 'in-progress'
  | 'paused'
  | 'in-review'
  | 'reviewing'
  | 're-review'
  | 'reviewed'
  | 'delivered'
  | 'abandoned';

export type BoardTicketStage = 'build' | 'package-build' | 'package-review' | 'adapt' | 'review';

export type BoardDraftState = 'waiting' | 'researching' | 'resumable';

export type BoardJobState =
  | 'launching'
  | 'preparing'
  | 'running'
  | 'waiting-for-answer'
  | 'interrupted'
  | 'awaiting-answer'
  | 'in-customs'
  | 'gating'
  | 'merging-main'
  | 'merging'
  | 'landing'
  | 'stopping';

export type BoardGatePhase = 'build' | 'review' | 'merge';

export type BoardPipelineAgentRole = 'productOwner' | 'builder' | 'reviewer' | 'reReviewer' | 'conflictReReviewer' | 'pipelineAgent' | 'assistant';

export type BoardForgeLevelAgentRole = Extract<BoardPipelineAgentRole, 'productOwner' | 'pipelineAgent' | 'assistant'>;

export type BoardEntityAgentRole = Exclude<BoardPipelineAgentRole, BoardForgeLevelAgentRole>;

export type BoardEntityKind = 'app' | 'package' | 'root';

export type BoardAgentEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type BoardAgentModel = 'haiku' | 'sonnet' | 'opus' | 'fable';

export type BoardOverseerState = 'serving' | 'held-by-install-change' | 'passing-baton' | 'down';

/** Where the user left the board: `paused` starts no new job until the user's go. */
export type BoardOverseerSetting = 'running' | 'paused';

export type BoardAttentionKind = 'escalated-question' | 'question' | 'draft-ticket' | 'filing-draft' | 'review' | 'merge-accept';

export type BoardAttentionStampWord = 'opened' | 'filed' | 'ready since' | 'reviewed';

export type BoardAttentionActionLabel = 'Answer' | 'Ready' | 'Review' | 'Accept';

/** A tab of a forge's board, where a board route opens. */
export type BoardTabName = 'kanban' | 'waves' | 'progress' | 'epics' | 'tickets' | 'agents' | 'questions' | 'assistant' | 'intake' | 'pipeline';

export type BoardTargetSubject = 'decision' | 'ticket' | 'draft' | 'job' | 'incident';

export type BoardInterruptionCause =
  | 'child-lost'
  | 'agent-crashed'
  | 'reboot'
  | 'answer-delivery'
  | 'usage-limit'
  | 'handoff-red'
  | 'forced-stop-refused'
  | 'authentication-failed'
  | 'talos-paused'
  | 'lease-ended'
  | 'network-outage'
  | 'forge-stopped'
  | 'forge-crashed';

/** What an interrupted job, or one whose lost line waits, follows: `nothing` resumes by itself at the next pass, `never` by no resume. */
export type BoardResumeWait = 'instruction' | 'answer' | 'decision' | 'nothing' | 'never';

export type BoardJobStopRequest = 'stop' | 'wind-down' | 'fresh';

export type BoardJobStopMode = 'stop' | 'wind-down';

export type BoardJobTurn = 'between-turns' | 'mid-turn';

export type BoardSubagentState = 'running' | 'ended';

export type BoardSessionLineRole = 'assistant' | 'user';

export type BoardLostLineKind = 'gate' | 'install';

export type BoardMergePrediction = 'clean' | 'conflicting' | 'prediction-failed';

/** The board command kinds a ticket may offer, the forge's own kind names. */
export type BoardOfferedCommandKind =
  | 'chart-range-set'
  | 'decision-answer'
  | 'gate-profile-start'
  | 'gate-profile-stop'
  | 'intake-close'
  | 'intake-start'
  | 'job-fresh'
  | 'job-message'
  | 'job-stop'
  | 'merge-accept'
  | 'merge-update'
  | 'pipeline-agent-advise'
  | 'pipeline-apply'
  | 'pipeline-apply-cancel'
  | 'pipeline-check'
  | 'pipeline-constitution-edit'
  | 'pipeline-draft-discard'
  | 'pipeline-draft-edit'
  | 'pipeline-draft-undo'
  | 'pipeline-setup-answer'
  | 'pipeline-setup-billing'
  | 'pipeline-setup-resume'
  | 'pipeline-setup-start'
  | 'pipeline-setup-start-over'
  | 'pipeline-setup-step'
  | 'pipeline-update-start'
  | 'ticket-deliver-by-hand'
  | 'ticket-hold'
  | 'ticket-network'
  | 'ticket-park'
  | 'ticket-priority'
  | 'ticket-ready'
  | 'ticket-unhold'
  | 'tracker-clear';

export type BoardPipelineApproval = 'tickets' | 'merge';

export type BoardBillingMode = 'subscription' | 'api';

export type BoardSetupStep = 'billing' | 'research' | 'entities' | 'constitution' | 'design' | 'apply';

export type BoardSetupStepState = 'not-started' | 'in-progress' | 'done' | 'needs-recheck';

export type BoardSetupMode = 'setup' | 'update' | 'advise';

export type BoardFindingTopic = 'stack' | 'scripts' | 'conventions' | 'continuous-integration' | 'note' | 'layout';

export type BoardGateCandidacy = 'gate' | 'not-a-gate' | 'unsure';

export type BoardSetupQuestionStep = Extract<BoardSetupStep, 'research' | 'entities' | 'constitution' | 'design'>;

export type BoardSetupQuestionSubjectKind = 'node' | 'gate' | 'rule' | 'finding';

export type BoardSourceAnnotationKind = 'contributing' | 'research' | 'installed-default';

export type BoardEditAuthor = 'agent' | 'user';

export type BoardApplyRequestState = 'committing' | 'held' | 'refused';

export type BoardApplyRequestReason =
  | 'interrupted'
  | 'not-on-target-branch'
  | 'dirty-checkout'
  | 'target-file-held'
  | 'git-failed'
  | 'constitution-commit-unsigned'
  | 'constitution-commit-unexpected-paths'
  | 'constitution-moved'
  | 'pipeline-moved'
  | 'entity-named-by-tickets'
  | 'entities-while-tickets-in-flight';

export type BoardCheckState = 'queued' | 'running' | 'checked' | 'cannot-run' | 'stopped';

export type BoardCheckedGateVerdict = 'green' | 'red' | 'cannot-run' | 'disagreeing';

export type BoardEntityRefusalReason =
  | 'more-than-one-root'
  | 'equal-homes'
  | 'reach-inside-another-home'
  | 'unknown-whitelist-key'
  | 'unknown-dependency-key'
  | 'whitelisted-entity-not-package'
  | 'whitelisted-package-without-review'
  | 'dependency-circle';

export type BoardPipelineNodeKind =
  | 'ticket-creation'
  | 'human-ticket-review'
  | 'builder'
  | 'gates'
  | 'review'
  | 're-review'
  | 'merge-main-into-tree'
  | 'human-code-review'
  | 'ready-for-airlock'
  | 'airlock'
  | 'fast-forward-main';

export type BoardPipelineNodeMark = 'unchanged' | 'proposed' | 'changed' | 'new' | 'removed';

export type BoardMergePlacement = 'before-review' | 'before-human-code-review' | 'airlock';

export type BoardDerivedSettingsSource = 'last-worker' | 'builder';

export type BoardSwitchState = 'on' | 'off';

export type BoardNodeDialogTarget = 'agent-step' | 'review-step' | 'review-step-re-review' | 'merge-step' | 'merge-step-re-review' | 'gates-tab';

export type BoardEdgeTone = 'forward' | 'rollback' | 'loop';

export type BoardEdgeLabelKind =
  | 'all-green'
  | 'red-builder-fixes'
  | 'conflict-or-red-builder-fixes'
  | 'red-reviewer-fixes'
  | 'red-last-worker-fixes'
  | 'gates-again-after-re-review';

export type BoardInsertableStep = 'build-gates' | 'review' | 'human-code-review' | 'review-gates' | 're-review' | 'merge-gates' | 'airlock-re-review';

export type BoardOccupantKind = 'ticket' | 'draft';

export type BoardGateRowKind = 'prepare' | 'gate';

export type BoardChangeKind = 'changed' | 'new' | 'removed';

export type BoardFlowStage = 'proposal' | 'live' | 'editing';

export type BoardProfileRunState = 'queued' | 'running' | 'passed' | 'red' | 'cannot-run' | 'timed-out' | 'stopped';

export type BoardCacheReport = 'hit' | 'partial' | 'miss';

export type BoardStepKind = 'prepare' | 'gate';

export type BoardStepEnding = 'passed' | 'failed' | 'time-bound';

export type BoardAssignedBy = 'product-owner' | 'user';

/** The pipeline records the live view's history shows. */
export type BoardPipelineHistoryKind =
  | 'pipeline-gate-added'
  | 'pipeline-gate-removed'
  | 'pipeline-gates-none'
  | 'pipeline-gates-ordered'
  | 'pipeline-prepare-step-set'
  | 'pipeline-approval-set'
  | 'pipeline-setup-opened'
  | 'pipeline-draft-discarded'
  | 'pipeline-setup-discarded'
  | 'overseer-set';
