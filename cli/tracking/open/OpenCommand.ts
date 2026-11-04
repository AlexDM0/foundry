import { dirname } from 'node:path';

import { Baton }                         from '../../../src/services/overseer/Baton.ts';
import { overseerFilesIn }               from '../../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }              from '../../../src/services/tracker/Workspace.ts';
import { OperationRefusal }              from '../../../src/shared/OperationRefusal.ts';
import { SESSION_CODE_LIFETIME_SECONDS } from '../../../src/shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                 from '../../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }           from '../../CommandHandler.ts';
import { openInTheDefaultBrowser }       from '../../OpenInTheDefaultBrowser.ts';
import { OverseerRemote }                from '../../overseer/OverseerRemote.ts';
import { openThroughARedirectFile }      from './OpenThroughARedirectFile.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} open`;
const MILLISECONDS_PER_SECOND = 1000;

const KNOWN_OPTION_NAMES: readonly string[] = [];

// The Bridge's `bridge/api/SessionCodeExchange.ts` reads this fragment.
const SESSION_CODE_FRAGMENT_PREFIX = '#session=';

/**
 * The live Overseer's URL while a Baton names a live process, a one-time session code in its fragment, which the browser never sends to
 * a server; with no live Baton, there is no page to open. The browser gets the URL through a redirect file, and the command stays until the
 * code's life ended, so it can remove that file.
 */
export const openCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const workspace       = requireWorkspace(context.currentDirectory);
  const { overseerDirectory } = overseerFilesIn(workspace.trackerDirectory);
  const newest          = Baton.newestBatonOf(context.platformPorts, overseerDirectory);
  if (newest.verdict !== 'live') throw new OperationRefusal('refused', { kind: 'overseer-down', overseerDirectory });

  const sessionCode = await OverseerRemote.sessionCodeOf(newest.record);
  if (sessionCode === null) {
    context.standardError(`The Overseer at ${newest.record.url} gave no session code, so the Bridge it opens cannot read the board; run \`${USAGE}\` again.`);
  }
  if (sessionCode === null) {
    openInTheDefaultBrowser(context, newest.record.url);
    context.standardOutput(newest.record.url);
    return;
  }
  const pageUrl = `${newest.record.url}${SESSION_CODE_FRAGMENT_PREFIX}${sessionCode}`;
  await openThroughARedirectFile({
    folder:         dirname(newest.record.tokenFile),
    pageUrl,
    ownerOnlyFiles: context.platformPorts.ownerOnlyFiles,
    launch:         (redirectFilePath) => {
      openInTheDefaultBrowser(context, redirectFilePath);
      context.standardOutput(pageUrl);
    },
    // A timer only: the Overseer decides on the code's life; this wait only bounds how long the redirect file stays.
    waitForTheCodeLife: () => Bun.sleep(SESSION_CODE_LIFETIME_SECONDS * MILLISECONDS_PER_SECOND),
    onStopSignal:       context.onStopSignal,
  });
};
