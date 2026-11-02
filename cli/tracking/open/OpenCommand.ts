import { Baton }                   from '../../../src/services/overseer/Baton.ts';
import { overseerFilesIn }         from '../../../src/services/overseer/OverseerFiles.ts';
import { requireWorkspace }        from '../../../src/services/tracker/Workspace.ts';
import { OperationRefusal }        from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }           from '../../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }     from '../../CommandHandler.ts';
import { openInTheDefaultBrowser } from '../../OpenInTheDefaultBrowser.ts';
import { OverseerRemote }          from '../../overseer/OverseerRemote.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} open`;

const KNOWN_OPTION_NAMES: readonly string[] = [];

// The Bridge's `bridge/api/SessionCodeExchange.ts` reads this fragment.
const SESSION_CODE_FRAGMENT_PREFIX = '#session=';

/**
 * The live Overseer's URL while a Baton names a live process, a one-time session code in its fragment, which the browser never sends to
 * a server; with no live Baton, there is no page to open.
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
  const pageUrl = sessionCode === null ? newest.record.url : `${newest.record.url}${SESSION_CODE_FRAGMENT_PREFIX}${sessionCode}`;
  openInTheDefaultBrowser(context, pageUrl);
  context.standardOutput(pageUrl);
};
