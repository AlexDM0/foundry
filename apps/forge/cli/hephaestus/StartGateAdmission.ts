/**
 * The start gate as every form of `start` runs it: a start that may serve goes on with its verdict, and one that stays off tells the registry
 * the forge crashed, logs one line and is refused `forge-off-after-crash`, before it takes a Hephaestus lock, binds a port or contacts Talos.
 */
import { LocalTimeUtil }             from '../../src/lib/local-time/LocalTimeUtil.ts';
import type { StartOrigin }          from '../../src/lib/tracker-model/@types/Job.ts';
import type { StartGateVerdict }     from '../../src/services/hephaestus/@types/StartClassification.ts';
import { CrashLog }                  from '../../src/services/hephaestus/CrashLog.ts';
import type { HephaestusFiles }      from '../../src/services/hephaestus/HephaestusFiles.ts';
import type { StartOriginReading }   from '../../src/services/hephaestus/StartClassification.ts';
import { StartGate }                 from '../../src/services/hephaestus/StartGate.ts';
import type { UnreadableBoardFiles } from '../../src/services/hephaestus/UnreadableBoardFiles.ts';
import type { BoardStore }           from '../../src/services/store/BoardStore.ts';
import type { RegisteredCrash }      from '../../src/services/tracker/MonitorRegistration.ts';
import type { Workspace }            from '../../src/services/tracker/Workspace.ts';
import { OperationRefusal }          from '../../src/shared/OperationRefusal.ts';
import type { CommandContext }       from '../CommandContext.ts';
import type { ArgumentParser }       from '../arguments/ArgumentParser.ts';
import { registerTheBoard }          from './BoardRegistration.ts';

export type StartOriginByHand = Exclude<StartOrigin, 'successor'>;

export type ServingAdmission = Extract<StartGateVerdict, { verdict: 'serve' }>;

type StayingOff = Extract<StartGateVerdict, { verdict: 'stay-off' }>;

const STARTED_BY_OPTION = 'started-by';

const STARTS_BY_HAND = ['user'] as const satisfies readonly StartOriginByHand[];

/** `--started-by user`, `user` when absent; a successor's origin comes from `--successor-of`, never from this option. */
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
  context:              CommandContext;
  workspace:            Workspace;
  boardStore:           BoardStore;
  files:                HephaestusFiles;
  origin:               StartOriginReading;
  log:                  (line: string) => void;
  unreadableBoardFiles: UnreadableBoardFiles;
}

/** A crash suspected before a reboot names no component: the beat that went stale is Hephaestus's own. */
function registeredCrashOf(files: HephaestusFiles, stayingOff: StayingOff): RegisteredCrash {
  const crashLog = CrashLog.read(files, stayingOff.crashLogNumber);
  const error = crashLog.verdict === 'read' ? crashLog.record.error : null;
  return {
    component:    stayingOff.classification.crashedComponent ?? 'hephaestus',
    suspected:    stayingOff.classification.crashSuspected,
    errorName:    error?.name ?? null,
    errorMessage: error?.message ?? null,
    crashLogPath: stayingOff.crashLogPath,
  };
}

export async function admitTheStart({
  context, workspace, boardStore, files, origin, log, unreadableBoardFiles
}: StartAdmissionRequest): Promise<ServingAdmission> {
  const stampNow = (): string => LocalTimeUtil.formatLocalIso(context.now());
  const verdict = StartGate.admit({
    ports: context.platformPorts, files, workspace, boardReads: boardStore.reads, origin, stampNow, unreadableBoardFiles
  });
  if (verdict.verdict === 'serve') return verdict;
  const crash = registeredCrashOf(files, verdict);
  await registerTheBoard(context, workspace, {
    presence: {
      state: 'crashed', generation: verdict.crashedGeneration, at: stampNow(), crash
    },
  });
  const crashedHephaestusLock = verdict.crashedGeneration === null ? 'a Hephaestus lock nothing names' : `Hephaestus lock ${verdict.crashedGeneration}`;
  log(`Staying off after a crash of ${crashedHephaestusLock}${crash.suspected ? ' suspected before the machine restarted' : ''}: `
    + `started by ${origin.startOrigin}, so only a start by the user serves; the crash log is ${verdict.crashLogPath}.`);
  throw new OperationRefusal('refused', {
    kind: 'forge-off-after-crash', crashedGeneration: verdict.crashedGeneration, crashLogPath: verdict.crashLogPath, suspected: crash.suspected
  });
}
