/**
 * Reads the board without a lock into the Overseer's `BoardState`, its `status --json --full` part built as `status` builds it, with Flint's
 * brain beside it: the Overseer's reading and the brain's runs, which the Bridge's header counts in today's tokens.
 */
import type { MonitorFlintBrainDocument } from 'forge-contracts/MonitorSnapshotDocument';

import type { OverseerFacts, UsageFacts } from '../../../src/adapters/@types/BoardStateParts.ts';
import { storedFileTextOf }               from '../../../src/adapters/StoredFileText.ts';
import { UsageMarkerFile }                from '../../../src/adapters/usage-marker/UsageMarkerFile.ts';
import { UsageWindowsFile }               from '../../../src/adapters/usage-marker/UsageWindowsFile.ts';
import { LogUtil }                        from '../../../src/adapters/utils/LogUtil.ts';
import { GitProcess }                     from '../../../src/lib/git/GitProcess.ts';
import { predictMerges }                  from '../../../src/lib/git/MergeTree.ts';
import type { LogRecord }                 from '../../../src/lib/tracker-model/@types/LogRecord.ts';
import type { Board }                     from '../../../src/lib/tracker-model/Board.ts';
import { readingBoardOf }                 from '../../../src/lib/tracker-model/ReadingBoard.ts';
import { mergeTargetRuleOf }              from '../../../src/services/lifecycle/MergeTargets.ts';
import type { BoardChildren }             from '../../../src/services/overseer/BoardChildren.ts';
import {
  BoardStateAssembly,
  type BoardState,
  type MergeForecasting,
  type MergeForecasts
} from '../../../src/services/overseer/BoardState.ts';
import { JobLiveFactsReader }                        from '../../../src/services/overseer/JobLiveFactsReader.ts';
import { MainLineReads }                             from '../../../src/services/overseer/MainLineReads.ts';
import { UsageLimits }                               from '../../../src/services/overseer/UsageLimits.ts';
import { requireTracker }                            from '../../../src/services/tracker/TrackerReader.ts';
import type { Workspace }                            from '../../../src/services/tracker/Workspace.ts';
import { type BranchNames, branchNamesOf }           from '../../../src/shared/BranchNames.ts';
import { flintBrainRunsOf, type TodayFlintBrainRun } from '../../../src/shared/monitor/TodayFigures.ts';
import type { CommandContext }                       from '../../CommandContext.ts';
import { fullDocumentOf }                            from '../../StatusDocuments.ts';

export interface BoardStateSource {
  context:             CommandContext;
  workspace:           Workspace;
  boardChildren:       BoardChildren;
  notices:             () => readonly unknown[];
  /** Everything but `paused`, which the board's stored drain flag says. */
  overseer:            () => Omit<OverseerFacts, 'paused'>;
  /** The running DrivePass's count; absent while none runs, when every job reads 0. */
  silentSweepsOf?:     (jobId: string) => number;
  /** The branch the main checkout lands on; without it the merge queue's targets go unpredicted and empty. */
  mainLine?:           string;
  /** Held across reads, so a publish over unmoved branches reuses the last forecasts; without it every read predicts afresh. */
  mergeForecastCache?: MergeForecastCache;
  /** Held across reads, so a read whose main tip has not moved runs no `git show`; without it every read asks git afresh. */
  mainLineReads?:      MainLineReads;
  /** The live Overseer's reading of Flint's brain; absent outside one, when there is none. */
  flintBrainReading?:  () => MonitorFlintBrainDocument | null;
}

/** Flint's brain as the Bridge reads it: the Overseer's reading, `null` where it cannot run confined, and every run of it. */
export interface FlintBrainBoardFacts {
  reading: MonitorFlintBrainDocument | null;
  runs:    TodayFlintBrainRun[];
}

export type BoardStateWithFlintBrain = BoardState & { flintBrain: FlintBrainBoardFacts };

/** One target's last forecasts, kept while its tip and every candidate's tip stay where they were; a failed prediction is never kept. */
export interface MergeForecastCache {
  forecastsOf: (target: string, tipSet: string, forecast: () => MergeForecasts) => MergeForecasts;
}

export function createMergeForecastCache(): MergeForecastCache {
  const lastForecastsByTarget = new Map<string, { tipSet: string; forecasts: MergeForecasts }>();
  return {
    forecastsOf: (target, tipSet, forecast) => {
      const last = lastForecastsByTarget.get(target);
      if (last?.tipSet === tipSet) return last.forecasts;
      const forecasts = forecast();
      const anyPredictionFailed = Object.values(forecasts.againstTarget).some((entry) => entry.forecast === 'prediction-failed');
      if (anyPredictionFailed) lastForecastsByTarget.delete(target);
      else lastForecastsByTarget.set(target, { tipSet, forecasts });
      return forecasts;
    },
  };
}

/** The candidates in order with the commits the target and their branches point at; `null` when any of them does not resolve. */
function tipSetOf(repositoryRoot: string, target: string, ticketIds: readonly string[], branchOf: (ticketId: string) => string): string | null {
  const tipRun = GitProcess.run(repositoryRoot, ['rev-parse', '--end-of-options', target, ...ticketIds.map(branchOf)]);
  return GitProcess.succeeded(tipRun) ? `${ticketIds.join(' ')}\n${tipRun.standardOutput}` : null;
}

/**
 * The Airlocks' own target rule and git's predictions, read in the main checkout as the slots read them. With a cache, a target
 * whose tip set has not moved since the last read runs no merge-tree; a tip set that does not resolve is never cached.
 */
export function mergeForecastingIn(
  repositoryRoot: string,
  mainLine: string,
  branchNames: BranchNames,
  cache: MergeForecastCache | null,
  predict: typeof predictMerges = predictMerges,
): MergeForecasting {
  const { ticketBranchOf } = branchNames;
  const forecastsOf = (target: string, ticketIds: readonly string[]): MergeForecasts => {
    const predictions = predict(repositoryRoot, ticketIds.map((ticketId) => ({ target, branch: ticketBranchOf(ticketId) })));
    const againstTarget = Object.fromEntries(ticketIds.map((ticketId, index) => {
      const prediction = predictions[index] ?? { verdict: 'prediction-failed', reason: '' };
      const conflictedFiles = prediction.verdict === 'clean' ? [] : prediction.verdict === 'conflicting' ? prediction.conflictedFiles : null;
      return [ticketId, { forecast: prediction.verdict, conflictedFiles }];
    }));
    const cleanTicketIds = ticketIds.filter((ticketId) => againstTarget[ticketId]?.forecast === 'clean');
    const pairs = ticketIds.flatMap((ticketId) => cleanTicketIds
      .filter((cleanTicketId) => cleanTicketId !== ticketId && !(cleanTicketIds.includes(ticketId) && cleanTicketId < ticketId))
      .map((cleanTicketId) => [ticketId, cleanTicketId] as const));
    const pairPredictions = predict(repositoryRoot, pairs.map(([first, second]) => ({ target: ticketBranchOf(second), branch: ticketBranchOf(first) })));
    return { againstTarget, pairwiseConflicts: pairs.filter((_pair, index) => pairPredictions[index]?.verdict !== 'clean') };
  };
  return {
    targetOf:     mergeTargetRuleOf(mainLine, branchNames.groupTargetPrefix),
    branchTreeOf: (ticketId) => {
      const treeRun = GitProcess.run(repositoryRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${ticketBranchOf(ticketId)}^{tree}`]);
      return GitProcess.succeeded(treeRun) ? treeRun.standardOutput.trim() : null;
    },
    forecastsOf: (target, ticketIds) => {
      const tipSet = cache === null ? null : tipSetOf(repositoryRoot, target, ticketIds, ticketBranchOf);
      if (cache === null || tipSet === null) return forecastsOf(target, ticketIds);
      return cache.forecastsOf(target, tipSet, () => forecastsOf(target, ticketIds));
    },
  };
}

function usageOf(context: CommandContext, apiBilling: boolean): UsageFacts {
  const monitorFolder = context.platformPorts.dataFolders.monitorFolderOf(context.homeDirectory);
  return UsageLimits.usageFactsOf(UsageMarkerFile.read(monitorFolder), UsageWindowsFile.read(monitorFolder), apiBilling);
}

/** The stored text, for "View pipeline.json"; null when none is stored or it could not be read. */
function pipelineFileTextOf(workspace: Workspace, verdict: string): string | null {
  if (verdict === 'absent') return null;
  const stored = storedFileTextOf(workspace.pipelineFilePath);
  return stored.verdict === 'readable' ? stored.text : null;
}

/** The state, and the Board and the log records it was read from, which the monitor snapshot reads beside it. */
export interface BoardStateRead {
  state:          BoardStateWithFlintBrain;
  project:        string;
  readyTicketIds: string[];
  board:          Board;
  logRecords:     readonly LogRecord[];
  flintBrain:     MonitorFlintBrainDocument | null;
}

export function readBoardState(source: BoardStateSource): BoardStateRead {
  const { context, workspace } = source;
  const {
    progress, pipelineReading, pipelineSetupReading, gateProfilesReading, storedLog, listing, epicListing, draftListing
  } = requireTracker(workspace);
  const pipeline = pipelineReading.verdict === 'readable' ? pipelineReading.pipeline : null;
  const board = readingBoardOf(progress, listing.tickets, epicListing.epics, draftListing.drafts, storedLog.records, pipeline);
  const confinementInForce = { confinement: context.platformPorts.gateConfinement.availability().verdict, confinementSource: 'overseer' } as const;
  const liveFactsSource = {
    boardChildren: source.boardChildren, trackerDirectory: workspace.trackerDirectory, adapter: context.agentAdapter, board
  };
  const assembledState = BoardStateAssembly.boardStateOf({
    statusDocument: fullDocumentOf(progress, storedLog.records.map(LogUtil.wordedEntryOf), board, false, confinementInForce, pipeline !== null),
    board,
    progress,
    tickets:        listing.tickets,
    epics:          epicListing.epics,
    drafts:         draftListing.drafts,
    logRecords:     storedLog.records,
    generatedAt:    context.now(),
    renderMarkdown: context.renderState.markdownRenderer.renderMarkdown,
    liveFactsOf:    (job) => ({
      ...JobLiveFactsReader.liveFactsOf(liveFactsSource, job, {
        homeDirectory: context.homeDirectory,
        sessionId:     context.agentAdapter.sessionIdOf(progress.trackerId, job.id),
      }),
      silentSweeps: source.silentSweepsOf?.(job.id) ?? 0,
    }),
    notices:          source.notices(),
    overseer:         { ...source.overseer(), paused: board.overseerState() === 'paused' },
    usage:            usageOf(context, pipeline?.billing?.mode === 'api'),
    mergeForecasting: source.mainLine === undefined ? null : mergeForecastingIn(
      workspace.rootDirectory,
      source.mainLine,
      branchNamesOf(board.branchNamespace()),
      source.mergeForecastCache ?? null,
    ),
    agentTakesPictures: context.agentAdapter.capabilities.pictures,
    pipelineSources:    {
      pipelineReading,
      pipelineFileText: pipelineFileTextOf(workspace, pipelineReading.verdict),
      pipelineSetupReading,
      gateProfilesReading,
      mainLine:         source.mainLine ?? null,
      mainLineTexts:    BoardStateAssembly.mainLineTextsOf(source.mainLineReads ?? new MainLineReads(workspace.rootDirectory), workspace.rootDirectory, source.mainLine ?? null),
    },
  });
  const flintBrain = source.flintBrainReading?.() ?? null;
  return {
    state:          { ...assembledState, flintBrain: { reading: flintBrain, runs: flintBrainRunsOf(storedLog.records, flintBrain) } },
    project:        progress.project,
    readyTicketIds: board.readyTicketEntries().map((ready) => ready.id),
    board,
    logRecords:     storedLog.records,
    flintBrain,
  };
}
