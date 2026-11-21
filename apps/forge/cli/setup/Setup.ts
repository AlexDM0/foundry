/**
 * Machine setup, the same on every operating system once Bun runs: the Bun floor, `bun install` and `bun link` with the compiled launcher,
 * and the checkout's `core.hooksPath`. The bootstrap scripts `setup.sh` and `setup.ps1` only make sure Bun exists, then hand over to
 * `setup.ts`, which calls this.
 */
import { PRODUCT_NAMES }                   from '../../src/shared/constants/ProductNames.ts';
import { bunMeetsTheFloor }                from './BunStep.ts';
import { pointHooksPathAtTheTrackedHooks } from './HooksPathStep.ts';
import { installAndLink }                  from './InstallStep.ts';
import { type SetupHost }                  from './SetupHost.ts';
import { setupPlatformFor }                from './SetupPlatformFor.ts';
import { setupReportOver }                 from './SetupReport.ts';

const USAGE = 'Usage: setup [--instruct-only]';

/** Whether setup only announces its steps, or the line that refuses the arguments. */
function instructOnlyOf(commandLine: readonly string[]): boolean | string {
  const unknownArgument = commandLine.find((argument) => argument !== '--instruct-only');
  if (unknownArgument !== undefined) return `Unknown option: ${unknownArgument}\n${USAGE}`;
  return commandLine.length > 0;
}

export function runSetup(commandLine: readonly string[], host: SetupHost): number {
  const instructOnly = instructOnlyOf(commandLine);
  if (typeof instructOnly === 'string') {
    host.write(`${instructOnly}\n`);
    return 1;
  }
  const report = setupReportOver(host.write);
  report.heading('1/3 Bun');
  if (!bunMeetsTheFloor(host, report, instructOnly)) return 1;
  report.heading(`2/3 Dependencies and the global ${PRODUCT_NAMES.PROGRAM} command (bun install, bun link)`);
  installAndLink({
    host, platform: setupPlatformFor(host.platform), report, instructOnly
  });
  report.heading('3/3 The pre-commit hook (git config core.hooksPath)');
  pointHooksPathAtTheTrackedHooks(host, report, instructOnly);
  host.write(`\n\u001b[1mTooling ready.\u001b[0m Next:  cd <a repository> && ${PRODUCT_NAMES.PROGRAM} init\n`);
  return 0;
}
