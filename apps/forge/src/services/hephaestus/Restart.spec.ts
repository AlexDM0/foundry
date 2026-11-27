/**
 * The checked restart, as the serving Hephaestus reads a preflight: the first failing step is the report, a report survives whatever the
 * error says, output that is no report reads as none, and only a fit report lets the board go. The real processes are held by
 * `cli/hephaestus/StartCommand.integration.spec.ts`.
 */
import { describe, expect, test } from 'bun:test';

import {
  type PreflightReport,
  type RestartStep,
  type RestartStepRun,
  Restart
} from './Restart.ts';

const CODE_ON_DISK = 'code-example';

const PREFLIGHT_STEPS: readonly RestartStep[] = ['read-board', 'read-jobs', 'read-child-records', 'install-version'];

function stepsFailingAt(failingStep: RestartStep | null, stepsRun: RestartStep[]): readonly RestartStepRun[] {
  return PREFLIGHT_STEPS.map((step) => ({
    step,
    run: () => {
      stepsRun.push(step);
      if (step === failingStep) throw new Error(`example failure at ${step}`);
    },
  }));
}

describe('the preflight of the code on disk', () => {
  test('every step passing is a fit report naming the code', async () => {
    const stepsRun: RestartStep[] = [];
    expect(await Restart.preflightReportOf(CODE_ON_DISK, stepsFailingAt(null, stepsRun))).toEqual({ verdict: 'fit', codeVersion: CODE_ON_DISK });
    expect(stepsRun).toEqual([...PREFLIGHT_STEPS]);
  });

  test.each([...PREFLIGHT_STEPS])('a failure at %s is the report, and no later step runs', async (failingStep) => {
    const stepsRun: RestartStep[] = [];
    expect(await Restart.preflightReportOf(CODE_ON_DISK, stepsFailingAt(failingStep, stepsRun))).toEqual({
      verdict: 'unfit', codeVersion: CODE_ON_DISK, step: failingStep, error: `example failure at ${failingStep}`
    });
    expect(stepsRun).toEqual(PREFLIGHT_STEPS.slice(0, PREFLIGHT_STEPS.indexOf(failingStep) + 1));
  });

  test('a step that throws no error is reported by its text', async () => {

    const steps: readonly RestartStepRun[] = [{ step: 'read-board', run: () => { throw 'example text'; } }];
    expect(await Restart.preflightReportOf(CODE_ON_DISK, steps)).toMatchObject({ verdict: 'unfit', error: 'example text' });
  });
});

describe('the report as the serving Hephaestus reads it', () => {
  const reports: readonly PreflightReport[] = [
    { verdict: 'fit', codeVersion: CODE_ON_DISK },
    {
      verdict: 'unfit', codeVersion: CODE_ON_DISK, step: 'install-version', error: 'a "quoted" error\nover two lines'
    },
  ];

  test.each([...reports])('a report printed as one line reads back as itself: %j', (report) => {
    const line = Restart.reportLineOf(report);
    expect(line).not.toContain('\n');
    expect(Restart.reportIn(`${line}\n`)).toEqual(report);
  });

  test('the report is the last line, whatever the code printed before it', () => {
    const fit: PreflightReport = { verdict: 'fit', codeVersion: CODE_ON_DISK };
    expect(Restart.reportIn(`example warning\n${Restart.reportLineOf(fit)}\n`)).toEqual(fit);
  });

  test.each([
    ['no output', ''],
    ['text that is no JSON', 'example refusal'],
    ['JSON that is no object', '[]'],
    ['a report with no code version', JSON.stringify({ verdict: 'fit' })],
    ['a verdict nobody knows', JSON.stringify({ verdict: 'ready', codeVersion: CODE_ON_DISK })],
    ['an unfit report at a step no preflight runs', JSON.stringify({
      verdict: 'unfit', codeVersion: CODE_ON_DISK, step: 'serve', error: 'example'
    })],
    ['an unfit report with no error', JSON.stringify({ verdict: 'unfit', codeVersion: CODE_ON_DISK, step: 'read-board' })],
  ])('%s reads as no report', (_case, output) => {
    expect(Restart.reportIn(output)).toBeNull();
  });
});

describe('what a preflight means for the restart', () => {
  test('only a fit report lets the board go', () => {
    expect(Restart.failureOf({ verdict: 'fit', codeVersion: CODE_ON_DISK }, CODE_ON_DISK, 'unused')).toBeNull();
  });

  test('an unfit report fails the restart at its step, naming the code that reported', () => {
    const report: PreflightReport = {
      verdict: 'unfit', codeVersion: 'code-reported', step: 'read-jobs', error: 'example error'
    };
    expect(Restart.failureOf(report, CODE_ON_DISK, 'unused')).toEqual({ successorCodeVersion: 'code-reported', step: 'read-jobs', error: 'example error' });
  });

  test('no report fails the restart at preflight, naming the code on disk and why none came', () => {
    const unreportedError = 'the preflight exited 1 with no report';
    expect(Restart.failureOf(null, CODE_ON_DISK, unreportedError)).toEqual({ successorCodeVersion: CODE_ON_DISK, step: 'preflight', error: unreportedError });
  });
});
