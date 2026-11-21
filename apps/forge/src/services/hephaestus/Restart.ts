/**
 * The checked restart of Hephaestus: before the serving Hephaestus lets go of the board, the code on disk runs as a preflight that reads what
 * a start reads and reports in one line. A failed preflight leaves the serving Hephaestus driving; after it, the successor is a start like any
 * other, from what the board holds.
 */

/** `spawn` and `preflight` are the serving Hephaestus's own readings of a preflight that never reported; the others are the preflight's steps. */
export type RestartStep =
  | 'spawn'
  | 'preflight'
  | 'read-board'
  | 'read-jobs'
  | 'read-child-records'
  | 'install-version';

export interface RestartFailure {
  successorCodeVersion: string;
  step:                 RestartStep;
  error:                string;
}

export interface RestartStepRun {
  step: RestartStep;
  run:  () => Promise<void> | void;
}

export type PreflightReport =
  | { verdict: 'fit'; codeVersion: string }
  | { verdict: 'unfit'; codeVersion: string; step: RestartStep; error: string };

const PREFLIGHT_STEPS: readonly RestartStep[] = ['read-board', 'read-jobs', 'read-child-records', 'install-version'];

function errorTextOf(thrown: unknown): string {
  return thrown instanceof Error ? thrown.message : String(thrown);
}

/** Runs each step in order; the first that throws is the report, and nothing after it runs. */
async function preflightReportOf(codeVersion: string, steps: readonly RestartStepRun[]): Promise<PreflightReport> {
  for (const { step, run } of steps) {
    try {
      await run();
    } catch (thrown) {
      return {
        verdict: 'unfit', codeVersion, step, error: errorTextOf(thrown)
      };
    }
  }
  return { verdict: 'fit', codeVersion };
}

function reportLineOf(report: PreflightReport): string {
  return JSON.stringify(report);
}

function isAPreflightStep(value: unknown): value is RestartStep {
  return typeof value === 'string' && (PREFLIGHT_STEPS as readonly string[]).includes(value);
}

/** The report in a preflight's output, its last line; anything else reads as no report. */
function reportIn(output: string): PreflightReport | null {
  const lastLine = output.trim().split('\n').at(-1) ?? '';
  try {
    const parsed = JSON.parse(lastLine) as Record<string, unknown> | null;
    if (typeof parsed !== 'object' || parsed === null || typeof parsed['codeVersion'] !== 'string') return null;
    const {
      codeVersion, verdict, step, error
    } = parsed;
    if (verdict === 'fit') return { verdict, codeVersion };
    if (verdict !== 'unfit' || !isAPreflightStep(step) || typeof error !== 'string') return null;
    return {
      verdict, codeVersion, step, error
    };
  } catch {
    return null;
  }
}

/** `null` for a fit report; a preflight that left no report failed at `preflight`, named with the code on disk. */
function failureOf(report: PreflightReport | null, codeVersionOnDisk: string, unreportedError: string): RestartFailure | null {
  if (report === null) return { successorCodeVersion: codeVersionOnDisk, step: 'preflight', error: unreportedError };
  if (report.verdict === 'fit') return null;
  return { successorCodeVersion: report.codeVersion, step: report.step, error: report.error };
}

export const Restart = Object.freeze({
  preflightReportOf,
  reportLineOf,
  reportIn,
  failureOf,
});
