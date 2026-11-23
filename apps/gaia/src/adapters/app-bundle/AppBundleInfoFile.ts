/**
 * Where `gaia install-app` places Gaia.app, `~/Applications/Gaia.app`, and the ingestion of its `Contents/Info.plist`: the install version
 * the bundle was installed at (`GaiaInstallVersion`, `docs/contracts.md`, "The install version"), which the launcher compares with Gaia's
 * own before it starts anything.
 */
import { join } from 'node:path';

import { AtomicFile }    from '../../lib/atomic-file/AtomicFile.ts';
import { PRODUCT_NAMES } from '../../shared/constants/ProductNames.ts';

const APPLICATIONS_FOLDER_NAME = 'Applications';
const INSTALL_VERSION_KEY = 'GaiaInstallVersion';

/** Gaia writes the plist in XML from its own template, so the key and its integer sit as the template puts them. */
const INSTALL_VERSION_ENTRY = new RegExp(`<key>${INSTALL_VERSION_KEY}</key>\\s*<integer>(\\d+)</integer>`);

export type AppBundleInfoReading =
  | { readonly verdict: 'readable'; readonly installVersion: number }
  | { readonly verdict: 'absent' }
  /** A plist that holds no install version, as another application's does, or one that cannot be read. */
  | { readonly verdict: 'unreadable'; readonly failure: string };

export function applicationsFolderIn(homeDirectory: string): string {
  return join(homeDirectory, APPLICATIONS_FOLDER_NAME);
}

export function appBundleFolderName(): string {
  return `${PRODUCT_NAMES.applicationName}.app`;
}

export function infoPlistPathIn(appBundlePath: string): string {
  return join(appBundlePath, 'Contents', 'Info.plist');
}

export class AppBundleInfoFile {
  readonly #appBundlePath: string;

  public constructor(appBundlePath: string) {
    this.#appBundlePath = appBundlePath;
  }

  public async read(): Promise<AppBundleInfoReading> {
    const fileReading = await AtomicFile.read(infoPlistPathIn(this.#appBundlePath));
    if (fileReading.verdict === 'absent') return { verdict: 'absent' };
    if (fileReading.verdict === 'unreadable') return { verdict: 'unreadable', failure: fileReading.failure };
    const installVersionText = INSTALL_VERSION_ENTRY.exec(fileReading.contents)?.[1];
    if (installVersionText === undefined) return { verdict: 'unreadable', failure: `no ${INSTALL_VERSION_KEY}` };
    const installVersion = Number(installVersionText);
    return Number.isSafeInteger(installVersion) ? { verdict: 'readable', installVersion } : { verdict: 'unreadable', failure: `${INSTALL_VERSION_KEY} out of range` };
  }
}
