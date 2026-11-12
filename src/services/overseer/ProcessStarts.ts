/**
 * The calls of a DrivePass that start a process, in one record a spec replaces: a Watcher, a merged tree's gate pipeline, and a gate
 * profile's lines.
 */
import { GateLineRun }  from '../lifecycle/GateLineRun.ts';
import { GateRun }      from '../lifecycle/GateRun.ts';
import { WatcherFleet } from './WatcherFleet.ts';

export interface ProcessStarts {
  readonly spawnWatcher:    typeof WatcherFleet.spawnWatcher;
  readonly runGatePipeline: typeof GateRun.runPipeline;
  readonly runGateLines:    typeof GateLineRun.runOnce;
}

export const REAL_PROCESS_STARTS: ProcessStarts = Object.freeze({
  spawnWatcher:    WatcherFleet.spawnWatcher,
  runGatePipeline: GateRun.runPipeline,
  runGateLines:    GateLineRun.runOnce,
});
