import type { JobNotLaunched }    from '../../../domain/tracker-model/@types/Job.ts';
import type { UnreadableJobFile } from '../UnreadableJobFileIncident.ts';
import type { HephaestusNotice }  from './HephaestusStateDocument.ts';

export type LaunchRefusal = Extract<HephaestusNotice, { kind: 'instructions-missing' }>;

/** The agent's program did not resolve: the job stands not launched, which the pass records in a hold of its own. */
export interface AgentProgramRefused {
  readonly notLaunchedJobId: string;
  readonly notLaunched:      JobNotLaunched;
}

/** No Talos took the launch: nothing marks the instance launched, so the next pass tries it again. */
export interface TalosDidNotLaunch {
  readonly talosDidNotLaunch: string;
}

/** API billing is set and Hephaestus's environment holds no API key: nothing starts until User sets it. */
export interface ApiBillingKeyMissing {
  readonly apiBillingKeyMissingFor: string;
}

/** A first setup's pipeline agent before its record holds a billing: it launches under none, and the next pass tries it again. */
export interface SetupBillingNotChosen {
  readonly setupBillingNotChosenFor: string;
}

/** An Airlock agent whose conflicted files nothing tells: it is not told a wrong list, and the next pass reads them again. */
export interface AirlockConflictsUnknown {
  readonly airlockConflictsUnknownFor: string;
}

/** A file the launch needs that its ingestion could not read: nothing launches, and the pass's hold opens its incident on the job named. */
export interface UnreadableJobFileRefusal {
  readonly unreadableJobFile: UnreadableJobFile;
}

/** A session forge's confinement cannot hold, of a job with no incident of its own for it: the next pass tries it again. */
export interface SessionConfinementRefused {
  readonly sessionConfinementRefusedFor: string;
}
