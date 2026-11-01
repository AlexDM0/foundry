/** The two calls of a DrivePass that start a process, in one record a spec replaces: a Watcher, and a merged tree's gate pipeline. */
import { GateRun }      from '../lifecycle/GateRun.ts';
import { WatcherFleet } from './WatcherFleet.ts';

export interface ProcessStarts {
  readonly spawnWatcher:    typeof WatcherFleet.spawnWatcher;
  readonly runGatePipeline: typeof GateRun.runPipeline;
}

export const REAL_PROCESS_STARTS: ProcessStarts = Object.freeze({
  spawnWatcher:    WatcherFleet.spawnWatcher,
  runGatePipeline: GateRun.runPipeline,
});
