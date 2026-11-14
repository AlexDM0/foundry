/** "Look again" in a page title: asks the registry and every registered forge again at once, and waits while that is on its way. */
import { Button } from 'design-system/Button';

import type { CommandBody }                from '../@types/CommandDocument.ts';
import { CommandSender, useCommandSender } from '../api/CommandSender.ts';

const LOOK_AGAIN: CommandBody = { kind: 'fleet-look-again' };

export function LookAgainButton() {
  const { send, states } = useCommandSender();
  const isOnItsWay = CommandSender.stateOf(states, CommandSender.subjectOf(LOOK_AGAIN)).onItsWay !== null;
  return <Button label="Look again" compact disabled={isOnItsWay} onPress={() => void send(LOOK_AGAIN)} />;
}
