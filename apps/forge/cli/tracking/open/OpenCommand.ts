import { dirname } from 'node:path';

import { Baton, type BatonRecord }                                from '../../../src/services/overseer/Baton.ts';
import { overseerFilesIn, type OverseerFiles }                    from '../../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace, type Workspace }                       from '../../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                                       from '../../../src/shared/OperationRefusal.ts';
import { SESSION_CODE_LIFETIME_SECONDS }                          from '../../../src/shared/constants/OverseerLimits.ts';
import { PRODUCT_NAMES }                                          from '../../../src/shared/constants/ProductNames.ts';
import type { CommandContext }                                    from '../../CommandContext.ts';
import type { CommandHandler }                                    from '../../CommandHandler.ts';
import { openInTheDefaultBrowser }                                from '../../OpenInTheDefaultBrowser.ts';
import { requireTheOverseerCanStartIn, startTheOverseerDetached } from '../../overseer/DetachedOverseerStart.ts';
import { OverseerRemote }                                         from '../../overseer/OverseerRemote.ts';
import { openThroughARedirectFile }                               from './OpenThroughARedirectFile.ts';

const { PROGRAM } = PRODUCT_NAMES;

const USAGE = `${PROGRAM} open [--no-browser]`;
const NO_BROWSER_FLAG = 'no-browser';
const MILLISECONDS_PER_SECOND = 1000;

const KNOWN_OPTION_NAMES: readonly string[] = [NO_BROWSER_FLAG];

// The Bridge's `bridge/api/SessionCodeExchange.ts` reads this fragment.
const SESSION_CODE_FRAGMENT_PREFIX = '#session=';

/** The live Overseer's Baton record; with none live, `open` first starts the Overseer detached, as `oversee --detach` does. */
async function liveBatonRecordOf(context: CommandContext, workspace: Workspace, files: OverseerFiles): Promise<BatonRecord> {
  const newest = Baton.newestBatonOf(context.platformPorts, files.overseerDirectory);
  if (newest.verdict === 'live') {
    context.standardError(`Overseer: running at ${newest.record.url}.`);
    return newest.record;
  }
  context.standardError('Overseer: not running; starting it in the background.');
  requireTheOverseerCanStartIn(workspace.rootDirectory, context.platformPorts.gateConfinement);
  const url = await startTheOverseerDetached({
    context, workspace, files, portArguments: [], startOrigin: 'user'
  });
  context.standardError(`Overseer: started at ${url}. It keeps running after this command ends; \`${PROGRAM} oversee stop\` stops it.`);
  const started = Baton.newestBatonOf(context.platformPorts, files.overseerDirectory);
  if (started.verdict !== 'live') throw new OperationRefusal('refused', { kind: 'overseer-down', overseerDirectory: files.overseerDirectory });
  return started.record;
}

/**
 * The live Overseer's URL, a one-time session code in its fragment, which the browser never sends to a server. The browser gets the URL
 * through a redirect file, and the command stays until the code's life ended, so it can remove that file. With `--no-browser` the URL and
 * its code are printed instead, and nothing is launched or written.
 */
export const openCommand: CommandHandler = async (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(0, USAGE);

  const workspace = requireWorkspace(context.currentDirectory);
  const record    = await liveBatonRecordOf(context, workspace, overseerFilesIn(workspace.trackerDirectory));

  const launchesTheBrowser = !commandArguments.flag(NO_BROWSER_FLAG);
  const sessionCode = await OverseerRemote.sessionCodeOf(record);
  if (sessionCode === null) {
    context.standardError(`The Overseer at ${record.url} gave no session code, so the Bridge it opens cannot read the board; run \`${PROGRAM} open\` again.`);
    if (launchesTheBrowser) openInTheDefaultBrowser(context, record.url);
    context.standardOutput(record.url);
    return;
  }
  const pageUrl = `${record.url}${SESSION_CODE_FRAGMENT_PREFIX}${sessionCode}`;
  if (!launchesTheBrowser) {
    context.standardError(`Browser: not launched (--${NO_BROWSER_FLAG}). Open this link within ${SESSION_CODE_LIFETIME_SECONDS} seconds; its one-time code signs in one browser:`);
    context.standardOutput(pageUrl);
    return;
  }
  await openThroughARedirectFile({
    folder:         dirname(record.tokenFile),
    pageUrl,
    ownerOnlyFiles: context.platformPorts.ownerOnlyFiles,
    launch:         (redirectFilePath) => {
      context.standardError('Browser: opening the board in the default browser, signed in with a one-time code.');
      openInTheDefaultBrowser(context, redirectFilePath);
      // The session code is the launched browser's alone: a pasted copy would find it spent.
      context.standardOutput(record.url);
      context.standardError(
        `Waiting: the one-time code is valid for ${SESSION_CODE_LIFETIME_SECONDS} seconds; this command then removes the sign-in file that holds it `
        + 'and ends. Ctrl-C ends it now. The board and the Overseer keep running either way.'
      );
    },
    // A timer only: the Overseer decides on the code's life; this wait only bounds how long the redirect file stays.
    waitForTheCodeLife: () => Bun.sleep(SESSION_CODE_LIFETIME_SECONDS * MILLISECONDS_PER_SECOND),
    onStopSignal:       context.onStopSignal,
  });
  context.standardError(
    `Done: the sign-in file is removed. If no browser tab came up, run \`${PROGRAM} open --${NO_BROWSER_FLAG}\` and open the link it prints.`
  );
};
