import type { RedHandoffFacts }  from '../../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { LogRecord }        from '../../../domain/tracker-model/@types/LogRecord.ts';
import type { BoardTransaction } from '../../tracker/BoardTransaction.ts';
import type { JobLaunchContext } from './JobLaunchContext.ts';

export interface HoldContext {
  change:         BoardTransaction;
  context:        JobLaunchContext;
  pipelineStored: boolean;
  logged:         LogRecord[];
}

export type BuildJobIncidentKind = 'setup-failed' | 'out-of-calls' | 'blocked' | 'gate-cannot-run' | 'sandbox-unavailable';

export interface RedHandoffCause extends Pick<RedHandoffFacts, 'kind' | 'name' | 'command' | 'fixCommand' | 'exitCode' | 'fullLogPath' | 'mergedTip' | 'scopeResumed'> {
  output: string;
}
