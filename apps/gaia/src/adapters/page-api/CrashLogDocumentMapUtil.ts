/** Maps a forge's crash log, as Gaia read it in, out to the page's `CrashLogDocument`, every key named one by one. */
import type { CrashLogDocument }  from '../../../page/@types/CrashLogDocument.ts';
import type { ForgeCrashLog }     from '../../shared/@types/ForgePresence.ts';
import { PAGE_CONTRACT_VERSIONS } from '../../shared/constants/PageContractVersions.ts';

export const CrashLogDocumentMapUtil = {
  crashLogDocumentOf(crashLog: ForgeCrashLog): CrashLogDocument {
    const { error, activeJobs, logTail } = crashLog;
    return {
      crashLogVersion: PAGE_CONTRACT_VERSIONS.gaiaCrashLog,
      number:          crashLog.number,
      generation:      crashLog.generation,
      component:       crashLog.component,
      suspected:       crashLog.suspected,
      recordedAt:      crashLog.recordedAt,
      error:           error === null ? null : {
        origin: error.origin, name: error.name, message: error.message, stack: error.stack,
      },
      activeJobs: activeJobs === null ? null : activeJobs.map((job) => ({
        jobId:        job.jobId,
        kind:         job.kind,
        ticketIds:    [...job.ticketIds],
        state:        job.state,
        interruption: job.interruption,
        airlockPhase: job.airlockPhase,
      })),
      logTail: logTail === null ? null : [...logTail],
    };
  },
} as const;
