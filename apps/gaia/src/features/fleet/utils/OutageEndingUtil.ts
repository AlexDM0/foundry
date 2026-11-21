/**
 * The one rule for which jobs a network outage left waiting, read from what each forge serves in its presence (decision 35): the forge
 * names the job's cause `network-outage` and says it waits for User's resume. A job already told to resume waits for nothing, so it is no
 * longer counted. The fleet's alert names every forge that holds such jobs, and leads what waits on User.
 */
import type { FleetAttentionItem, FleetForge } from '../../../shared/@types/FleetSnapshot.ts';
import type { ForgeWaitingJob }                from '../../../shared/@types/ForgePresence.ts';

/** One alert for the whole fleet, so its key is its kind. */
const OUTAGE_ALERT_KEY = 'fleet-alert:agents-ended-on-outage';

function endedOnAnOutage(job: ForgeWaitingJob): boolean {
  return job.cause === 'network-outage' && job.waitsFor === 'instruction';
}

function outageEndingsOf(waitingWork: readonly ForgeWaitingJob[]): number {
  return waitingWork.filter(endedOnAnOutage).length;
}

function outageEndingsTotalOf(forges: readonly Pick<FleetForge, 'outageEndings'>[]): number {
  return forges.reduce((total, forge) => total + forge.outageEndings, 0);
}

/** `null` while no forge holds a job a network outage stopped; the page names the forges from each one's own count. */
function outageAlertOf(forges: readonly Pick<FleetForge, 'outageEndings'>[]): FleetAttentionItem | null {
  if (outageEndingsTotalOf(forges) === 0) return null;
  return {
    trackerId:               null,
    key:                     OUTAGE_ALERT_KEY,
    kind:                    'agents-ended-on-outage',
    idText:                  '',
    ticketIds:               [],
    subject:                 '',
    jobId:                   null,
    askedBy:                 null,
    decisionKind:            null,
    escalatedFromIncidentId: null,
    metaText:                null,
    stamp:                   '',
    stampWord:               'last reported',
    actionLabel:             'Open',
    boardRoute:              null,
  };
}

export const OutageEndingUtil = {
  endedOnAnOutage,
  outageEndingsOf,
  outageEndingsTotalOf,
  outageAlertOf,
} as const;
