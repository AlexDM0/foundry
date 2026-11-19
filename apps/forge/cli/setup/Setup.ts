/**
 * Machine setup, the same on every operating system once Bun runs: the Bun floor, `bun install` and `bun link` with the compiled launcher,
 * and the checkout's `core.hooksPath`. The bootstrap scripts `setup.sh` and `setup.ps1` only make sure Bun exists, then hand over to
 * `setup.ts`, which calls this.
 */
import { PRODUCT_NAMES }                   from '../../src/shared/constants/ProductNames.ts';
import { bunMeetsTheFloor }                from './BunStep.ts';
import { pointHooksPathAtTheTrackedHooks } from './HooksPathStep.ts';
import { installAndLink }                  from './InstallStep.ts';
import { writeLoginOverseer }              from './LoginOverseer.ts';
import { type SetupHost }                  from './SetupHost.ts';
import { setupPlatformFor }                from './SetupPlatformFor.ts';
import { setupReportOver }                 from './SetupReport.ts';

const USAGE = 'Usage: setup [--instruct-only] | setup --login-overseer <repository> [--label <label>] [--instruct-only]';

interface SetupArguments {
  readonly instructOnly:            boolean;
  readonly loginOverseerRepository: string | null;
  readonly loginOverseerLabel:      string;
}

/** The arguments, or the line that refuses them. */
function setupArgumentsOf(commandLine: readonly string[]): SetupArguments | string {
  let instructOnly = false;
  let loginOverseerRepository: string | null = null;
  let loginOverseerLabel = PRODUCT_NAMES.LOGIN_ITEM_LABEL;
  for (let i = 0; i < commandLine.length; i++) {
    const argument = commandLine[i];
    const value = commandLine[i + 1];
    if (argument === '--instruct-only') {
      instructOnly = true;
    } else if ((argument === '--login-overseer' || argument === '--label') && value !== undefined) {
      if (argument === '--login-overseer') loginOverseerRepository = value;
      else loginOverseerLabel = value;
      i += 1;
    } else {
      return argument === '--login-overseer' || argument === '--label' ? USAGE : `Unknown option: ${argument ?? ''}\n${USAGE}`;
    }
  }
  return { instructOnly, loginOverseerRepository, loginOverseerLabel };
}

export function runSetup(commandLine: readonly string[], host: SetupHost): number {
  const setupArguments = setupArgumentsOf(commandLine);
  if (typeof setupArguments === 'string') {
    host.write(`${setupArguments}\n`);
    return 1;
  }
  const { instructOnly } = setupArguments;
  const report = setupReportOver(host.write);
  if (setupArguments.loginOverseerRepository !== null) {
    report.heading('The Overseer\'s login item');
    return writeLoginOverseer(host, report, { repository: setupArguments.loginOverseerRepository, label: setupArguments.loginOverseerLabel, instructOnly });
  }
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
