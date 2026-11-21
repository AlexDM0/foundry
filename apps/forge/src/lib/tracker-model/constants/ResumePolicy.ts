/** How an interrupted job comes back, per cause: the one table the Playbook, the presence assembly and the CLI read. */
import type { InterruptionCause } from '../@types/Job.ts';

/**
 * `resumes-by-itself` is resumed at the next pass, under the bound or wait of its own cause. `resumes-twice-then-waits` is resumed while its
 * crash resumes stay under the bound, then waits; User's instruction sets the count back to 0. `waits-for-instruction` waits for User's
 * resume. `resumes-once-decision-answered` waits for the answer of the decision that names its failure. `never-resumes` is never resumed.
 */
export type ResumePolicy =
  | 'resumes-by-itself'
  | 'resumes-twice-then-waits'
  | 'waits-for-instruction'
  | 'resumes-once-decision-answered'
  | 'never-resumes';

export const RESUME_POLICY_OF_CAUSE: Readonly<Record<InterruptionCause, ResumePolicy>> = Object.freeze({
  'answer-delivery':       'resumes-by-itself',
  'handoff-red':           'resumes-by-itself',
  'usage-limit':           'resumes-by-itself',
  'talos-paused':          'resumes-by-itself',
  'reboot':                'waits-for-instruction',
  'forge-stopped':         'waits-for-instruction',
  'lease-ended':           'waits-for-instruction',
  'forge-crashed':         'waits-for-instruction',
  'network-outage':        'waits-for-instruction',
  'agent-crashed':         'resumes-twice-then-waits',
  'talos-lost':            'resumes-twice-then-waits',
  'authentication-failed': 'resumes-once-decision-answered',
  'forced-stop-refused':   'never-resumes',
});

/** The policies under which a job waits for User: `resumes-twice-then-waits` only once its crash resumes reached the bound. */
export const WAITING_POLICIES = ['waits-for-instruction', 'resumes-twice-then-waits'] as const satisfies readonly ResumePolicy[];
