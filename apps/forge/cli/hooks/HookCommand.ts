/**
 * The `hook` verb. `session-start` prints the session instructions `init` and `update` wire it to; `bash-domains` is the network guard and
 * `stage-edits` the stage's edit guard a Hephaestus renders into a job's launch.
 */
import { OperationRefusal }            from '../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }               from '../../src/shared/constants/ProductNames.ts';
import type { CommandHandler }         from '../CommandHandler.ts';
import { guardTheNetworkDomains }      from './BashDomainsHook.ts';
import { printTheSessionInstructions } from './SessionStartHook.ts';
import { guardTheStageEdits }          from './StageEditsHook.ts';

const BASH_DOMAINS_EVENT = 'bash-domains';

const SESSION_START_EVENT = 'session-start';

const STAGE_EDITS_EVENT = 'stage-edits';

const USAGE = `${PRODUCT_NAMES.PROGRAM} hook session-start|bash-domains --allow <domains>|stage-edits --allow <folder>…  (the hook input arrives on standard input)`;

/** The three events refuse nothing and exit 0 whatever they are given; any other event is a person typing the command by hand, refused at exit 1. */
export const hookCommand: CommandHandler = async (commandArguments, context) => {
  const event = commandArguments.positional();
  if (event === SESSION_START_EVENT) {
    printTheSessionInstructions(context);
    return;
  }
  if (event === BASH_DOMAINS_EVENT) {
    await guardTheNetworkDomains(commandArguments, context);
    return;
  }
  if (event === STAGE_EDITS_EVENT) {
    await guardTheStageEdits(commandArguments, context);
    return;
  }
  const named = event === undefined ? 'no hook event' : `"${event}"`;
  throw new OperationRefusal('refused', `${PRODUCT_NAMES.PROGRAM} hook takes one event and was given ${named}.\n  Usage: ${USAGE}`);
};
