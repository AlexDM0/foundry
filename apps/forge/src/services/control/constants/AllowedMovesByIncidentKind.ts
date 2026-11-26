import type { IncidentKind, IncidentMove } from '../../../lib/tracker-model/@types/Incident.ts';

/**
 * The Bouncer's one table of the moves each incident kind allows, design section 8.3, whoever names the incident: Hephaestus's
 * Assistant through its Hatch or User at the command line. `incident-note` records and never closes.
 */
export const ALLOWED_MOVES_BY_INCIDENT_KIND: Readonly<Record<IncidentKind, readonly IncidentMove[]>> = {
  'system-question':           ['incident-answer', 'incident-escalate', 'job-fresh', 'ticket-park', 'incident-note'],
  'malformed-ticket':          ['incident-answer', 'incident-escalate', 'ticket-park', 'incident-note'],
  'setup-failed':              ['worktree-repair', 'ticket-park', 'incident-note'],
  'out-of-calls':              ['job-fresh', 'ticket-park', 'incident-note'],
  'blocked':                   ['job-fresh', 'worktree-repair', 'ticket-park', 'incident-note'],
  'job-lost':                  ['job-fresh', 'ticket-park', 'incident-note'],
  'resume-failed':             ['job-fresh', 'ticket-park'],
  'gate-cannot-run':           ['gate-retry', 'worktree-repair', 'ticket-park'],
  'sandbox-unavailable':       ['gate-retry', 'ticket-park'],
  'quiet-job':                 ['job-message', 'job-fresh', 'incident-note'],
  'setup-snapshot-touched':    ['job-message', 'incident-note'],
  'document-snapshot-touched': ['incident-note'],
  'system-file-unreadable':    ['job-fresh', 'ticket-park', 'incident-note'],
};
