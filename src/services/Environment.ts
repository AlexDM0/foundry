/** The one module that reads the environment, through getters that read it at each call, never a snapshot. */
import { homedir } from 'node:os';

import { PRODUCT_NAMES } from '../shared/constants/ProductNames.ts';

const PORT_VARIABLE = `${PRODUCT_NAMES.environmentPrefix}PORT`;

const HIGHEST_PORT = 65535;

/** `HOME`, so every spec can run under a scratch home; the account's home folder when it is unset. */
export function homeDirectory(): string {
  const home = process.env['HOME'];
  return home === undefined || home === '' ? homedir() : home;
}

/** `GAIA_PORT` overrides the default port, for a second Gaia in development; null when unset or not a port. */
export function portOverride(): number | null {
  const text = process.env[PORT_VARIABLE];
  if (text === undefined || !/^\d+$/.test(text)) return null;
  const port = Number(text);
  return port >= 1 && port <= HIGHEST_PORT ? port : null;
}

/** Test-only: moves `HOME` for the rest of the run, so no spec can reach the account's real home folder. */
export function moveHomeDirectoryTo(directory: string): void {
  process.env['HOME'] = directory;
}
