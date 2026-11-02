/**
 * Where the host's GnuPG keeps its sockets and keys, as `gpgconf --list-dirs` reports them on every OS. A host with no gpgconf, or one that
 * fails, answers `null` and never throws: commits then go unsigned and the default home is denied whole.
 */
import { join } from 'node:path';

import { hostExecutableResolver } from '../../lib/executable-resolver/ExecutableResolverFor.ts';

export interface GpgDirectories {
  agentSocket:   string | null;
  /** Only a gpg that has `use-keyboxd` reads its public keyring through this socket. */
  keyboxdSocket: string | null;
  homeDirectory: string | null;
}

/** The output of `gpgconf --list-dirs`, or `null` when it could not run or failed. */
export type GpgconfRun = () => string | null;

const GPGCONF_PROGRAM_NAME = 'gpgconf';
const LIST_DIRECTORIES_ARGUMENTS = ['--list-dirs'];
const SUCCESS_EXIT_CODE = 0;
/** GnuPG's own default when gpgconf cannot say: the folder a POSIX gpg reads unless `GNUPGHOME` moves it. */
const DEFAULT_GPG_HOME_FOLDER_NAME = '.gnupg';

/** Each line is `name:value`, the value percent-escaped so that a colon in a Windows path cannot split it. */
function gpgDirectoriesOf(listing: string): GpgDirectories {
  const values = new Map<string, string>();
  for (const line of listing.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    values.set(line.slice(0, separator), unescapedValueOf(line.slice(separator + 1)));
  }
  const valueOf = (name: string): string | null => {
    const value = values.get(name);
    return value === undefined || value === '' ? null : value;
  };
  return { agentSocket: valueOf('agent-socket'), keyboxdSocket: valueOf('keyboxd-socket'), homeDirectory: valueOf('homedir') };
}

function unescapedValueOf(escaped: string): string {
  try {
    return decodeURIComponent(escaped);
  } catch {
    return escaped;
  }
}

/** Resolved through the search path alone, never the working directory. */
function runRealGpgconf(): string | null {
  const gpgconf = hostExecutableResolver().absolutePathOf(GPGCONF_PROGRAM_NAME, []);
  if (gpgconf.verdict === 'refused') return null;
  try {
    const finished = Bun.spawnSync({
      cmd: [gpgconf.path, ...LIST_DIRECTORIES_ARGUMENTS], stdin: 'ignore', stdout: 'pipe', stderr: 'ignore', windowsHide: true
    });
    return finished.exitCode === SUCCESS_EXIT_CODE ? finished.stdout.toString() : null;
  } catch {
    return null;
  }
}

function read(runGpgconf: GpgconfRun = runRealGpgconf): GpgDirectories | null {
  const listing = runGpgconf();
  return listing === null ? null : gpgDirectoriesOf(listing);
}

function homeDirectoryOf(directories: GpgDirectories | null, userHomeDirectory: string): string {
  return directories?.homeDirectory ?? join(userHomeDirectory, DEFAULT_GPG_HOME_FOLDER_NAME);
}

export const GpgDirectories = Object.freeze({ gpgDirectoriesOf, read, homeDirectoryOf });
