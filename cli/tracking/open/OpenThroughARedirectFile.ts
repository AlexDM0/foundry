/**
 * The page URL, its session code included, reaches the browser through an owner-only HTML file that redirects to it: the opener gets only
 * the file's path, since another local user can read a process's arguments. The file is removed when the code's life ends or a stop
 * signal comes, whether the browser read it or not.
 */
import { randomBytes } from 'node:crypto';
import { rmSync }      from 'node:fs';
import { join }        from 'node:path';

import { writeOwnerOnlyFileAtomically } from '../../../src/lib/atomic-file/AtomicFile.ts';
import type { OwnerOnlyFiles }          from '../../../src/lib/owner-only-files/OwnerOnlyFiles.ts';

export interface RedirectFileOpening {
  /** An owner-only folder in the user's data folder, such as the one that holds the Overseer's token. */
  readonly folder:             string;
  readonly pageUrl:            string;
  readonly ownerOnlyFiles:     OwnerOnlyFiles;
  /** Starts the browser opener with the redirect file's path. */
  readonly launch:             (redirectFilePath: string) => void;
  /** Settles when the session code's life ended. */
  readonly waitForTheCodeLife: () => Promise<void>;
  readonly onStopSignal:       (listener: () => void) => () => void;
}

const REDIRECT_FILE_PREFIX = 'bridge-redirect-';
const REDIRECT_FILE_SUFFIX = '.html';
const REDIRECT_FILE_NAME_BYTES = 8;

function attributeTextOf(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\'', '&#39;');
}

export function redirectPageOf(pageUrl: string): string {
  const address = attributeTextOf(pageUrl);
  return '<!doctype html>\n<meta charset="utf-8">\n<meta name="referrer" content="no-referrer">\n'
    + `<meta http-equiv="refresh" content="0; url=${address}">\n<title>Bridge</title>\n<a href="${address}">Open the Bridge</a>\n`;
}

/** Answers the redirect file's path once the file is removed again. */
export async function openThroughARedirectFile(opening: RedirectFileOpening): Promise<string> {
  const redirectFilePath = join(opening.folder, `${REDIRECT_FILE_PREFIX}${randomBytes(REDIRECT_FILE_NAME_BYTES).toString('hex')}${REDIRECT_FILE_SUFFIX}`);
  let stopListenerRemoval: () => void = () => undefined;
  const stopSignalCame = new Promise<void>((resolve) => {
    stopListenerRemoval = opening.onStopSignal(resolve);
  });
  try {
    opening.ownerOnlyFiles.restrictFolder(opening.folder);
    writeOwnerOnlyFileAtomically(redirectFilePath, redirectPageOf(opening.pageUrl));
    opening.ownerOnlyFiles.restrictFile(redirectFilePath);
    opening.launch(redirectFilePath);
    await Promise.race([opening.waitForTheCodeLife(), stopSignalCame]);
  } finally {
    stopListenerRemoval();
    rmSync(redirectFilePath, { force: true });
  }
  return redirectFilePath;
}
