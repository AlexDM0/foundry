import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { type SetupHost }   from './SetupHost.ts';
import { type SetupReport } from './SetupReport.ts';

/** The pinned Bun is the floor: an older one can panic on a busy pipe, on Windows above all. */
const BUN_VERSION_FILE_NAME = '.bun-version';

export function pinnedBunVersionOf(checkoutDirectory: string): string {
  return readFileSync(join(checkoutDirectory, BUN_VERSION_FILE_NAME), 'utf8').trim();
}

function versionOfBun(host: SetupHost): string {
  return host.run([host.bunProgram, '--version'], host.checkoutDirectory).output.trim();
}

function isBelow(version: string, floor: string): boolean {
  return Bun.semver.order(version, floor) < 0;
}

/** Holds the Bun that setup runs to the pinned version, offering `bun upgrade` below it; false means setup stops here. */
export function bunMeetsTheFloor(host: SetupHost, report: SetupReport, instructOnly: boolean): boolean {
  const floor = pinnedBunVersionOf(host.checkoutDirectory);
  const version = versionOfBun(host);
  if (!isBelow(version, floor)) {
    report.done(`bun ${version} found (${host.bunProgram})`);
    return true;
  }
  report.failure(`bun ${version} is below ${floor}, the version ${BUN_VERSION_FILE_NAME} pins (${host.bunProgram})`);
  if (!instructOnly && host.answersYes('Upgrade Bun now (bun upgrade)?')) {
    host.run([host.bunProgram, 'upgrade'], host.checkoutDirectory);
    const upgradedVersion = versionOfBun(host);
    if (!isBelow(upgradedVersion, floor)) {
      report.done(`bun ${upgradedVersion} installed`);
      return true;
    }
    report.failure(`bun is still ${upgradedVersion} after the upgrade`);
  }
  report.failure(`Bun ${floor} or later is required. Run bun upgrade, then run setup again`);
  return false;
}
