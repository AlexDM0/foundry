/**
 * The calls of a DrivePass that start a process, in one record a spec replaces: a Watcher, the board's Talos, a merged tree's gate
 * pipeline, a gate profile's lines, and a pipeline check's two runs.
 */
import { GateLineRun }                 from '../lifecycle/GateLineRun.ts';
import { GateRun }                     from '../lifecycle/GateRun.ts';
import { ProposalTwiceRun }            from '../lifecycle/ProposalTwiceRun.ts';
import { type TalosSpawn, spawnTalos } from './TalosStart.ts';
import { WatcherFleet }                from './WatcherFleet.ts';

export interface ProcessStarts {
  readonly spawnWatcher:     typeof WatcherFleet.spawnWatcher;
  readonly startTalos:       TalosSpawn;
  readonly runGatePipeline:  typeof GateRun.runPipeline;
  readonly runGateLines:     typeof GateLineRun.runOnce;
  readonly runProposalTwice: typeof ProposalTwiceRun.runProposalTwice;
}

export const REAL_PROCESS_STARTS: ProcessStarts = Object.freeze({
  spawnWatcher:     WatcherFleet.spawnWatcher,
  startTalos:       spawnTalos,
  runGatePipeline:  GateRun.runPipeline,
  runGateLines:     GateLineRun.runOnce,
  runProposalTwice: ProposalTwiceRun.runProposalTwice,
});
