/**
 * The cache report a forge gate may write: forge hands each gate line it runs a path in `FORGE_GATE_REPORT`, and a gate that writes
 * `{"version": 1, "cache": "hit" | "partial" | "miss"}` there gets its run marked cached in the Bridge's Pipeline view. Here the report is
 * read from a turbo run's summary: every task that ran replayed from the cache, some did, or none did.
 */
import { writeFileSync } from 'node:fs';

import { type SummarizedTask, TASK_WITHOUT_SCRIPT_COMMAND } from './TurboRunSummary.ts';

export const GATE_REPORT_VARIABLE = 'FORGE_GATE_REPORT';

const GATE_REPORT_FORMAT_VERSION = 1;
const CACHE_HIT_STATUS = 'HIT';

export type GateCacheReport = 'hit' | 'partial' | 'miss';

/** `null` when no task with a script was in the run, so there is nothing to report. */
export function cacheReportOf(tasks: readonly SummarizedTask[]): GateCacheReport | null {
  const tasksWithScripts = tasks.filter((task) => task.command !== TASK_WITHOUT_SCRIPT_COMMAND);
  if (tasksWithScripts.length === 0) return null;
  const replayedCount = tasksWithScripts.filter((task) => task.cache?.status === CACHE_HIT_STATUS).length;
  if (replayedCount === tasksWithScripts.length) return 'hit';
  return replayedCount === 0 ? 'miss' : 'partial';
}

export function gateReportTextOf(cacheReport: GateCacheReport): string {
  return `${JSON.stringify({ version: GATE_REPORT_FORMAT_VERSION, cache: cacheReport })}\n`;
}

/**
 * Writes the report at `reportPath` when forge handed one and the run had a task to report on. A report is only a mark, so a path that
 * cannot be written is said on standard error and never fails the gate.
 */
export function writeGateReport(reportPath: string | undefined, tasks: readonly SummarizedTask[] | undefined): void {
  if (reportPath === undefined || reportPath.trim() === '' || tasks === undefined) return;
  const cacheReport = cacheReportOf(tasks);
  if (cacheReport === null) return;
  try {
    writeFileSync(reportPath, gateReportTextOf(cacheReport));
  } catch (error) {
    console.error(`gate report: ${reportPath} could not be written (${error instanceof Error ? error.message : String(error)}).`);
  }
}
