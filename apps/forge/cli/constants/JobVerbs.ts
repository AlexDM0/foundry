import type { ControlCommandKind } from '../../src/shared/@types/ControlCommand.ts';

/**
 * The verbs a session under a job runs directly: none takes the lock or writes the data folder. Every other verb relays, when it is the
 * verb of a control command, or is refused; `cli/HatchUnderJob.spec.ts` holds both lists exact.
 */
export const READ_ONLY_VERBS_UNDER_A_JOB: readonly string[] = [
  'help',
  'status',
  'usage',
  'review-stats',
  'ticket show',
  'ticket list',
  'epic show',
  'epic list',
  'draft show',
  'draft list',
  'hook bash-domains',
  'hook session-start',
  'hook stage-edits',
  'version',
  'oversee status',
  'decisions',
  'incidents',
  'merges',
  'jobs',
  'job show',
  'job attach',
  'gate list',
];

/** Verbs that build a kind whose own verb is named above: `job wind-down` is a `job-stop` of mode `wind-down`. */
export const OTHER_VERBS_OF_CONTROL_KIND: Readonly<Partial<Record<ControlCommandKind, readonly string[]>>> = { 'job-stop': ['job wind-down'], };

/**
 * Kinds only User's own surfaces send: the Bridge, a monitor holding the token, or the verb outside a job. Under a job the verb is refused
 * before it runs, never relayed.
 */
export const UNRELAYED_VERB_OF_CONTROL_KIND = {
  'chart-range-set':        'range',
  'tracker-clear':          'clear',
  'ticket-deliver-by-hand': 'ticket deliver --by-hand',
  'talos-restart':          'oversee talos-restart',
} as const satisfies Partial<Record<ControlCommandKind, string>>;

/**
 * Kinds of the verbs User runs by hand outside a job, which once wrote the board in place: never relayed from a job, never accepted by
 * `POST /api/commands`.
 */
export const BY_HAND_VERB_OF_CONTROL_KIND = {
  'task-add':             'task',
  'task-move':            'task',
  'task-correct':         'task',
  'task-remove':          'task',
  'log-note':             'log',
  'namespace-set':        'namespace',
  'ticket-link':          'ticket link',
  'ticket-size':          'ticket size',
  'ticket-agent':         'ticket agent',
  'ticket-introduced-by': 'ticket introduced-by',
  'ticket-release-of':    'ticket release-of',
  'ticket-rereview':      'ticket rereview',
  'ticket-reopen':        'ticket reopen',
  'ticket-status-set':    'ticket status',
  'ticket-unready':       'ticket unready',
  'epic-edit':            'epic edit',
  'epic-remove':          'epic remove',
} as const satisfies Partial<Record<ControlCommandKind, string>>;

export type ByHandControlCommandKind = keyof typeof BY_HAND_VERB_OF_CONTROL_KIND;

export const BY_HAND_COMMAND_KINDS = Object.freeze(Object.keys(BY_HAND_VERB_OF_CONTROL_KIND)) as readonly ByHandControlCommandKind[];

export type RelayedControlCommandKind = Exclude<ControlCommandKind, keyof typeof UNRELAYED_VERB_OF_CONTROL_KIND | ByHandControlCommandKind>;

/** The verb each relayed control command is typed as; under a job the verb parses its arguments as usual and relays the command it built. */
export const RELAYED_VERB_OF_CONTROL_KIND: Readonly<Record<RelayedControlCommandKind, string>> = {
  'ticket-add':                  'ticket add',
  'ticket-edit':                 'ticket edit',
  'ticket-depends':              'ticket depends',
  'ticket-priority':             'ticket priority',
  'ticket-epic':                 'ticket epic',
  'ticket-abandon':              'ticket abandon',
  'ticket-ready':                'ticket ready',
  'ticket-submit':               'ticket submit',
  'ticket-park':                 'ticket park',
  'incident-answer':             'incident answer',
  'incident-note':               'incident note',
  'incident-escalate':           'incident escalate',
  'ticket-network':              'ticket network',
  'ticket-entity':               'ticket entity',
  'ticket-group':                'ticket group',
  'ticket-hold':                 'ticket hold',
  'ticket-unhold':               'ticket unhold',
  'epic-add':                    'epic add',
  'draft-open':                  'draft open',
  'draft-claim':                 'draft claim',
  'draft-release':               'draft release',
  'draft-note':                  'draft note',
  'draft-ask':                   'draft ask',
  'draft-answer':                'draft answer',
  'draft-drop':                  'draft drop',
  'draft-close':                 'draft close',
  'draft-abandon':               'draft abandon',
  'decision-answer':             'decide',
  'job-stop':                    'job stop',
  'job-fresh':                   'job fresh',
  'job-stop-all':                'job stop',
  'job-message':                 'job message',
  'worktree-repair':             'worktree repair',
  'gate-retry':                  'gate retry',
  'intake-start':                'intake',
  'pipeline-agent-advise':       'advise',
  'intake-close':                'intake close',
  'intake-title':                'intake title',
  'question-options':            'question options',
  'need-declare':                'need declare',
  'overseer-pause':              'oversee pause',
  'overseer-resume':             'oversee resume',
  'interrupted-work-resume':     'resume',
  'overseer-stop':               'oversee stop',
  'overseer-restart':            'oversee restart',
  'concurrency-set':             'concurrency',
  'machine-agent-limit-set':     'machine limit',
  'pipeline-prepare-step-set':   'gate prepare',
  'pipeline-gate-add':           'gate add',
  'pipeline-gate-order':         'gate order',
  'pipeline-gates-none':         'gate none',
  'pipeline-gate-remove':        'gate remove',
  'pipeline-approval-set':       'gate approval',
  'pipeline-assistant-set':      'gate assistant',
  'pipeline-reach-set':          'gate reach',
  'merge-accept':                'merge accept',
  'merge-update':                'merge update',
  'pipeline-setup-start':        'pipeline setup',
  'pipeline-setup-billing':      'pipeline billing',
  'pipeline-setup-step':         'pipeline continue',
  'pipeline-setup-start-over':   'pipeline start-over',
  'pipeline-setup-resume':       'pipeline resume',
  'pipeline-setup-answer':       'pipeline answer',
  'pipeline-constitution-edit':  'pipeline constitution',
  'pipeline-update-start':       'pipeline update',
  'pipeline-draft-edit':         'pipeline edit',
  'pipeline-draft-undo':         'pipeline undo',
  'pipeline-draft-discard':      'pipeline discard',
  'gate-profile-start':          'pipeline profile',
  'gate-profile-stop':           'pipeline profile-stop',
  'pipeline-apply':              'pipeline apply',
  'pipeline-apply-cancel':       'pipeline apply-cancel',
  'pipeline-check':              'pipeline check',
  'pipeline-finding-record':     'pipeline finding',
  'pipeline-question-ask':       'pipeline ask',
  'pipeline-constitution-draft': 'pipeline draft-constitution',
  'pipeline-draft-propose':      'pipeline propose',
  'pipeline-step-ready':         'pipeline ready',
};
