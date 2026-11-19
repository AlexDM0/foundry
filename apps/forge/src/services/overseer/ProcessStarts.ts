/**
 * The calls of a DrivePass that start a process, in one record a spec replaces: the board's Talos, and the runs whose lines Talos starts
 * through the line runner: a merged tree's gate pipeline, a gate profile's lines, and a pipeline check's two runs.
 */
import { GateLineRun }                 from '../lifecycle/GateLineRun.ts';
import { GateRun }                     from '../lifecycle/GateRun.ts';
import { ProposalTwiceRun }            from '../lifecycle/ProposalTwiceRun.ts';
import { type TalosSpawn, spawnTalos } from './TalosStart.ts';

export interface ProcessStarts {
  readonly startTalos:       TalosSpawn;
  readonly runGatePipeline:  typeof GateRun.runPipeline;
  readonly runGateLines:     typeof GateLineRun.runOnce;
  readonly runProposalTwice: typeof ProposalTwiceRun.runProposalTwice;
}

export const REAL_PROCESS_STARTS: ProcessStarts = Object.freeze({
  startTalos:       spawnTalos,
  runGatePipeline:  GateRun.runPipeline,
  runGateLines:     GateLineRun.runOnce,
  runProposalTwice: ProposalTwiceRun.runProposalTwice,
});
