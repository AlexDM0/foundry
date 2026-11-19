/**
 * Flint's brain for one serving period of the Overseer: made with the board's facts, fed its paused flag and the machine's usage marker,
 * publishing the board state and the monitor snapshot on each change, logging each run that ended, and closed with the period.
 */
import { UsageMarkerFile }                                                                      from '../../src/adapters/usage-marker/UsageMarkerFile.ts';
import { readingBoardOf }                                                                       from '../../src/lib/tracker-model/ReadingBoard.ts';
import type { FlintBrainEndedRun }                                                              from '../../src/services/overseer/@types/FlintBrainRun.ts';
import type { BoardChildren }                                                                   from '../../src/services/overseer/BoardChildren.ts';
import { type FlintBrain, REAL_FLINT_BRAIN_TIMERS, createFlintBrain }                           from '../../src/services/overseer/FlintBrain.ts';
import { type FlintBrainSessionHost, FlintBrainSessionHosts, createFlintBrainSessionHost }      from '../../src/services/overseer/FlintBrainSessionHost.ts';
import { UsageLimits }                                                                          from '../../src/services/overseer/UsageLimits.ts';
import { requireProgressFile }                                                                  from '../../src/services/tracker/TrackerReader.ts';
import type { Workspace }                                                                       from '../../src/services/tracker/Workspace.ts';
import { environmentCopy, flintBrainIsWithheld, flintBrainMaximumOverride }                     from '../../src/shared/Environment.ts';
import { FLINT_BRAIN_MAXIMUM_RUN_MILLISECONDS, FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS } from '../../src/shared/constants/OverseerLimits.ts';
import type { CommandContext }                                                                  from '../CommandContext.ts';
import { openTrackerForWriting }                                                                from '../OpenTrackerForWriting.ts';
import type { ArgumentParser }                                                                  from '../arguments/ArgumentParser.ts';

export interface OverseerFlintBrainRequest {
  commandArguments: ArgumentParser;
  context:          CommandContext;
  workspace:        Workspace;
  trackerId:        string;
  /** The repository's root, which the brain's session may not write. */
  repositoryRoot:   string;
  /** The board's children, under which each run of the brain is a child of the `flint-brain/` folder. */
  boardChildren:    BoardChildren;
  /** Publishes the board state and the monitor snapshot, as after a pass. */
  publish:          () => void;
  log:              (line: string) => void;
}

export interface OverseerFlintBrain {
  brain: FlintBrain;
  /** Ends a running brain `stopped` and waits until every ended run is logged. */
  close: () => Promise<void>;
}

/** A board that cannot be read is not taken as paused: the drive pass reports that read's failure. */
function boardIsPaused(workspace: Workspace): boolean {
  try {
    return readingBoardOf(requireProgressFile(workspace), [], []).overseerState() === 'paused';
  } catch {
    return false;
  }
}

/** The brain answers a failed launch `brain-failed-to-start` alone, so the Overseer's log keeps the reason. */
function sessionHostLoggingLaunches(sessionHost: FlintBrainSessionHost, log: (line: string) => void): FlintBrainSessionHost {
  return {
    ...sessionHost,
    launch: async (planOf) => {
      try {
        const outcome = await sessionHost.launch(planOf);
        if (outcome.verdict === 'refused') log(`Flint's brain's session did not launch: ${outcome.reason}`);
        return outcome;
      } catch (thrown) {
        log(`Flint's brain's session did not launch: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
        throw thrown;
      }
    },
  };
}

export function createOverseerFlintBrain(request: OverseerFlintBrainRequest): OverseerFlintBrain {
  const {
    commandArguments, context, workspace, log
  } = request;
  const { platformPorts } = context;
  const monitorFolder = platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
  const pendingLogWrites = new Set<Promise<void>>();

  const logEndedRun = (run: FlintBrainEndedRun): void => {
    const writing: Promise<void> = openTrackerForWriting(commandArguments, context, (change) => change.board.recordFlintBrainEnded(run, change.at))
      .then(request.publish, (thrown: unknown) => log(`The end of Flint's brain's run could not be logged: ${thrown instanceof Error ? thrown.message : String(thrown)}`))
      .finally(() => pendingLogWrites.delete(writing));
    pendingLogWrites.add(writing);
  };

  const usageLimitHolds = (): string | null => {
    const resetsAt = UsageLimits.usageResetsAtOf(UsageMarkerFile.read(monitorFolder), []);
    return UsageLimits.millisecondsUntilReset(resetsAt, context.now()) === null ? null : resetsAt;
  };

  const brain = createFlintBrain({
    adapter:     context.agentAdapter,
    launchFacts: {
      platformPorts,
      inheritedEnvironment:   environmentCopy(),
      repositoryRoot:         request.repositoryRoot,
      trackerId:              request.trackerId,
      homeDirectory:          context.homeDirectory,
      brainIsWithheld:        flintBrainIsWithheld(),
      maximumRunMilliseconds: flintBrainMaximumOverride() ?? FLINT_BRAIN_MAXIMUM_RUN_MILLISECONDS,
    },
    sessionHost: sessionHostLoggingLaunches(createFlintBrainSessionHost({
      boardChildren:    request.boardChildren,
      trackerDirectory: workspace.trackerDirectory,
    }), log),
    timers:           REAL_FLINT_BRAIN_TIMERS,
    now:              context.now,
    overseerIsPaused: () => boardIsPaused(workspace),
    usageLimitHolds,
    onChange:         request.publish,
    onEnded:          logEndedRun,
  });

  return {
    brain,
    close: async () => {
      await brain.close();
      await Promise.all([...pendingLogWrites]);
      await FlintBrainSessionHosts.awaitRunsAtStop(request.boardChildren, workspace.trackerDirectory, FLINT_BRAIN_SESSION_READ_INTERVAL_MILLISECONDS);
    },
  };
}
