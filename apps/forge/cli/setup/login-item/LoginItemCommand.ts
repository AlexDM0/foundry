/**
 * `login-item add|remove|status [--repository <path>] [--json]`: the item that starts this board's Hephaestus when User logs in, the one setup's
 * `--login-item` writes, under a label of the board's own so every board has one. It writes no repository file.
 */
import { join, resolve } from 'node:path';

import { requireWorkspace }                   from '../../../src/services/tracker/Workspace.ts';
import { OperationRefusal }                   from '../../../src/shared/OperationRefusal.ts';
import { PRODUCT_NAMES }                      from '../../../src/shared/constants/ProductNames.ts';
import { boardStoreIn }                       from '../../BoardStoreOf.ts';
import type { CommandHandler }                from '../../CommandHandler.ts';
import { ProgramAnswerUtil }                  from '../../utils/ProgramAnswerUtil.ts';
import { autostartFor }                       from '../AutostartFor.ts';
import { autostartPrimitivesOf, loginItemOf } from '../LoginHephaestus.ts';
import { processSetupHostOf }                 from '../ProcessSetupHost.ts';
import type { SetupHost }                     from '../SetupHost.ts';

const USAGE = `${PRODUCT_NAMES.PROGRAM} login-item add|remove|status [--repository <path>] [--json]`;

const KNOWN_OPTION_NAMES = ['repository', 'json'];

export const LOGIN_ITEM_SUBCOMMAND_NAMES = ['add', 'remove', 'status'] as const;

export type LoginItemAction = (typeof LOGIN_ITEM_SUBCOMMAND_NAMES)[number];

export interface LoginItemAnswer {
  outcome:    'done' | 'nothing-to-do' | null;
  state:      'present' | 'absent';
  label:      string;
  location:   string;
  repository: string;
}

/** The label of a board's item: the product's, then its tracker id, so items of two boards never overwrite each other. */
function labelOf(trackerId: string): string {
  return `${PRODUCT_NAMES.LOGIN_ITEM_LABEL}.${trackerId}`;
}

/** What `login-item` does through a setup host; a spec passes a fake one, since every adapter reaches the system. */
export function loginItemAnswerOf(host: SetupHost, action: LoginItemAction, repository: string, trackerId: string): LoginItemAnswer {
  const autostart = autostartFor(host.platform, autostartPrimitivesOf(host));
  if (autostart === null) throw new OperationRefusal('refused', { kind: 'login-item-unavailable', reason: 'no login item is known for this operating system' });
  const unavailableReason = autostart.unavailableReason();
  if (unavailableReason !== null) throw new OperationRefusal('refused', { kind: 'login-item-unavailable', reason: unavailableReason });
  const label = labelOf(trackerId);
  const location = autostart.locationOf(label);
  const presentFor = (): 'present' | 'absent' => (autostart.registeredRepositoryOf(label) === null ? 'absent' : 'present');
  const answerWith = (outcome: LoginItemAnswer['outcome']): LoginItemAnswer => ({
    outcome, state: presentFor(), label, location, repository
  });
  if (action === 'status') return answerWith(null);
  if (action === 'remove') {
    const removed = autostart.remove(label);
    if (removed.verdict === 'refused') throw new OperationRefusal('refused', { kind: 'login-item-not-changed', location, reason: removed.reason });
    return answerWith(removed.verdict === 'removed' ? 'done' : 'nothing-to-do');
  }
  const written = autostart.write(loginItemOf(host, repository, label));
  if (written.verdict === 'refused') throw new OperationRefusal('refused', { kind: 'login-item-not-changed', location, reason: written.reason });
  return answerWith('done');
}

function actionOf(written: string | undefined): LoginItemAction {
  const action = LOGIN_ITEM_SUBCOMMAND_NAMES.find((name) => name === written);
  if (action === undefined) throw new OperationRefusal('refused', `Unknown login-item subcommand "${written ?? ''}". Write add, remove or status.\n  Usage: ${USAGE}`);
  return action;
}

function humanLineOf(action: LoginItemAction, answer: LoginItemAnswer): string {
  if (action === 'status') {
    return answer.state === 'present' ? `${answer.location} starts Hephaestus of ${answer.repository} at login.` : 'No login item starts this board\'s Hephaestus.';
  }
  if (action === 'remove') return answer.outcome === 'done' ? `Removed ${answer.location}; Hephaestus no longer starts at login.` : 'No login item was there to remove.';
  return `Wrote ${answer.location}: Hephaestus of ${answer.repository} starts at login.`;
}

/** This module's checkout, three folders up from `cli/setup/login-item/`: the one whose `agent-progress.ts` the item runs. */
function checkoutDirectoryOfThisProgram(): string {
  return join(import.meta.dir, '..', '..', '..');
}

export const loginItemCommand: CommandHandler = (commandArguments, context) => {
  commandArguments.rejectUnknownOptions(KNOWN_OPTION_NAMES, USAGE);
  commandArguments.rejectExtraPositionals(1, USAGE);
  const action = actionOf(commandArguments.positional());
  const workspace = requireWorkspace(resolve(context.currentDirectory, commandArguments.option('repository') ?? '.'));
  const { trackerId } = boardStoreIn(context, workspace).reads.requireProgress();
  const host = processSetupHostOf({
    platform:          context.platform as NodeJS.Platform,
    checkoutDirectory: checkoutDirectoryOfThisProgram(),
    homeDirectory:     context.homeDirectory,
    runningBun:        process.execPath,
  });
  const answer = loginItemAnswerOf(host, action, workspace.rootDirectory, trackerId);
  ProgramAnswerUtil.printAnswer(commandArguments, context, { ...answer }, humanLineOf(action, answer));
  return Promise.resolve();
};
