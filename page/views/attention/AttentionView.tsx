/**
 * The Attention view's root, the shell's default route. It reads the command sender, builds the screen from the fleet document and the
 * shell's reading of the page's clock, and lays it out: the fleet (A1, B3) or no forge yet (B4). `attentionViewPartsOf` hands the shell
 * the top bar's status line and buttons with it, so a new fleet document changes all three at once, with no reload.
 */
import type { ReactNode } from 'react';

import type { CommandBody }                  from '../../@types/CommandDocument.ts';
import type { FleetDocument }                from '../../@types/FleetDocument.ts';
import { CommandSender, useCommandSender }   from '../../api/CommandSender.ts';
import { Button }                            from '../../design-system/Button.tsx';
import type { TopBarStatus }                 from '../../shell/TopBar.tsx';
import { AttentionLayout }                   from './AttentionLayout.tsx';
import { AttentionModel, type ClockReading } from './AttentionModel.ts';
import { NoForgeYet }                        from './NoForgeYet.tsx';

export interface AttentionViewProps {
  readonly fleetDocument: FleetDocument;
  readonly clock:         ClockReading;
}

/** The parts of the shell this view fills: the same shape as the shell's own `ShellViewParts`. */
export interface AttentionViewParts {
  readonly status:  TopBarStatus;
  readonly actions: ReactNode;
  readonly content: ReactNode;
}

const LOOK_AGAIN: CommandBody = { kind: 'fleet-look-again' };

export function AttentionView({ fleetDocument, clock }: AttentionViewProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const screen = AttentionModel.screenOf(fleetDocument, clock);
  if (screen.kind === 'no-forge') return <NoForgeYet content={screen.content} />;
  return <AttentionLayout content={screen.content} commandStates={states} onCommand={(command) => void send(command)} onDismissFailure={dismissFailure} />;
}

/** B4's top bar asks every registered forge again, since a forge set up elsewhere appears by itself. */
export function LookAgainButton() {
  const { send, states } = useCommandSender();
  const isOnItsWay = CommandSender.stateOf(states, CommandSender.subjectOf(LOOK_AGAIN)).onItsWay !== null;
  return <Button label="Look again" disabled={isOnItsWay} onPress={() => void send(LOOK_AGAIN)} />;
}

export function attentionViewPartsOf(fleetDocument: FleetDocument, clock: ClockReading): AttentionViewParts {
  return {
    status:  AttentionModel.statusLineOf(fleetDocument),
    actions: fleetDocument.forges.length === 0 ? <LookAgainButton /> : null,
    content: <AttentionView fleetDocument={fleetDocument} clock={clock} />,
  };
}
