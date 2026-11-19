/**
 * The start gate as `start`, `oversee` and a successor run it: a start that may serve goes on with its verdict, and one that stays off tells
 * the registry the forge crashed, logs one line and is refused `forge-off-after-crash`, before it takes a Baton, binds a port or contacts Talos.
 */
import { LocalTimeUtil }           from '../../src/lib/local-time/LocalTimeUtil.ts';
import type { StartOrigin }        from '../../src/lib/tracker-model/@types/Job.ts';
import type { StartGateVerdict }   from '../../src/services/overseer/@types/StartClassification.ts';
import { CrashLog }                from '../../src/services/overseer/CrashLog.ts';
import type { OverseerFiles }      from '../../src/services/overseer/OverseerFiles.ts';
import type { StartOriginReading } from '../../src/services/overseer/StartClassification.ts';
import { StartGate }               from '../../src/services/overseer/StartGate.ts';
import type { RegisteredCrash }    from '../../src/services/tracker/MonitorRegistration.ts';
import type { Workspace }          from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }        from '../../src/shared/OperationRefusal.ts';
import type { CommandContext }     from '../CommandContext.ts';
import type { ArgumentParser }     from '../arguments/ArgumentParser.ts';
import { registerTheBoard }        from './BoardRegistration.ts';

export type StartOriginByHand = Exclude<StartOrigin, 'successor'>;

export type ServingAdmission = Extract<StartGateVerdict, { verdict: 'serve' }>;

type StayingOff = Extract<StartGateVerdict, { verdict: 'stay-off' }>;

const STARTED_BY_OPTION = 'started-by';

const STARTS_BY_HAND = ['user', 'login-item'] as const satisfies readonly StartOriginByHand[];

/** `--started-by user|login-item`, `user` when absent; a successor's origin comes from `--successor-of`, never from this option. */
export function startOriginIn(commandArguments: ArgumentParser, usage: string): StartOriginByHand {
  const written = commandArguments.option(STARTED_BY_OPTION);
  if (written === undefined) return 'user';
  const origin = STARTS_BY_HAND.find((known) => known === written);
  if (origin === undefined) throw new OperationRefusal('refused', `"${written}" is not a start origin. Write ${STARTS_BY_HAND.join(' or ')}.\n  Usage: ${usage}`);
  return origin;
}

/** The arguments that hand the origin on to a detached child. */
export function startOriginArgumentsOf(origin: StartOriginByHand): string[] {
  return [`--${STARTED_BY_OPTION}`, origin];
}

export interface StartAdmissionRequest {
  context:   CommandContext;
  workspace: Workspace;
  files:     OverseerFiles;
  origin:    StartOriginReading;
  log:       (line: string) => void;
}

/** A crash suspected before a reboot names no component: the beat that went stale is the Overseer's own. */
function registeredCrashOf(files: OverseerFiles, stayingOff: StayingOff): RegisteredCrash {
  const crashLog = CrashLog.read(files, stayingOff.crashLogNumber);
  const error = crashLog.verdict === 'read' ? crashLog.record.error : null;
  return {
    component:    stayingOff.classification.crashedComponent ?? 'overseer',
    suspected:    stayingOff.classification.crashSuspected,
    errorName:    error?.name ?? null,
    errorMessage: error?.message ?? null,
    crashLogPath: stayingOff.crashLogPath,
  };
}

export async function admitTheStart({
  context, workspace, files, origin, log
}: StartAdmissionRequest): Promise<ServingAdmission> {
  const stampNow = (): string => LocalTimeUtil.formatLocalIso(context.now());
  const verdict = StartGate.admit({
    ports: context.platformPorts, files, workspace, origin, stampNow
  });
  if (verdict.verdict === 'serve') return verdict;
  const crash = registeredCrashOf(files, verdict);
  await registerTheBoard(context, workspace, {
    presence: {
      state: 'crashed', generation: verdict.crashedGeneration, at: stampNow(), crash
    },
  });
  const crashedBaton = verdict.crashedGeneration === null ? 'a Baton nothing names' : `Baton ${verdict.crashedGeneration}`;
  log(`Staying off after a crash of ${crashedBaton}${crash.suspected ? ' suspected before the machine restarted' : ''}: `
    + `started by ${origin.startOrigin}, so only a start by the user serves; the crash log is ${verdict.crashLogPath}.`);
  throw new OperationRefusal('refused', {
    kind: 'forge-off-after-crash', crashedGeneration: verdict.crashedGeneration, crashLogPath: verdict.crashLogPath, suspected: crash.suspected
  });
}
