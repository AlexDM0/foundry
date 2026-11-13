/**
 * The Forges view's root (`#forges`, `#forges/add`). It reads the command sender, keeps which row's Stop dialog is open with its choice and
 * the last command it sent each forge, builds the content from the fleet document, and lays it out, with "Add a repository" over it when
 * the route asks. `forgesViewPartsOf` hands the shell the top bar's status line and buttons with it, so a new fleet document changes all
 * three at once, with no reload.
 */
import { type ReactNode, useEffect, useState } from 'react';

import type { CommandBody, ForgeCommandBody }                   from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                   from '../../@types/FleetDocument.ts';
import { useCommandSender }                                     from '../../api/CommandSender.ts';
import { Button }                                               from '../../design-system/Button.tsx';
import { LookAgainButton }                                      from '../../shared/LookAgainButton.tsx';
import { AddRepositoryForm }                                    from '../../shared/add-repository/AddRepositoryForm.ts';
import { HashRouter }                                           from '../../shell/HashRouter.ts';
import type { TopBarStatus }                                    from '../../shell/TopBar.tsx';
import { AddRepositoryDialog }                                  from './AddRepositoryDialog.tsx';
import { forgeAnchorIdOf, ForgesLayout }                        from './ForgesLayout.tsx';
import { type ClockReading, ForgesModel, type StopDialogState } from './ForgesModel.ts';

export interface ForgesRoute {
  readonly addingARepository: boolean;
  readonly forgeInView:       string | null;
}

export interface ForgesViewProps {
  readonly fleetDocument: FleetDocument;
  readonly route:         ForgesRoute;
  readonly clock:         ClockReading;
  readonly goTo:          (fragment: string) => void;
}

/** The parts of the shell this view fills: the same shape as the shell's own `ShellViewParts`. */
export interface ForgesViewParts {
  readonly status:  TopBarStatus;
  readonly actions: ReactNode;
  readonly content: ReactNode;
}

const FORGES_FRAGMENT = HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: null });
const ADD_A_REPOSITORY_FRAGMENT = HashRouter.fragmentOf({ view: 'forges', addingARepository: true, forgeInView: null });

export function ForgesView({
  fleetDocument, route, clock, goTo
}: ForgesViewProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const [stopDialog, setStopDialog] = useState<StopDialogState | null>(null);
  const [lastSent, setLastSent] = useState<ReadonlyMap<string, ForgeCommandBody>>(() => new Map());
  const { forgeInView } = route;

  useEffect(() => {
    if (forgeInView !== null) document.getElementById(forgeAnchorIdOf(forgeInView))?.scrollIntoView({ block: 'nearest' });
  }, [forgeInView]);

  const sendRecorded = (command: CommandBody) => {
    if ('trackerId' in command) setLastSent((current) => new Map(current).set(command.trackerId, command));
    return send(command);
  };

  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock, commandStates: states, stopDialog, forgeInView, lastSent
  });
  // A forge stopped from elsewhere drops its dialog, so it does not open again by itself once the forge runs again.
  if (stopDialog !== null && content.rows.every((row) => row.stopDialog === null)) setStopDialog(null);
  return (
    <>
      <ForgesLayout
        content={content}
        commandStates={states}
        handlers={{
          onCommand:        (command) => void sendRecorded(command),
          onOpenStopDialog: (trackerId) => setStopDialog({ trackerId, agents: 'keep' }),
          onStopChoice:     (agents) => setStopDialog((current) => (current === null ? null : { trackerId: current.trackerId, agents })),
          onCancelStop:     () => setStopDialog(null),
          onConfirmStop:    (command) => {
            void sendRecorded(command).then(() => setStopDialog((current) => (current?.trackerId === command.trackerId ? null : current)));
          },
          onDismissFailure: dismissFailure,
        }}
      />
      {route.addingARepository
        ? <AddRepositoryDialog forgeProgramIsMissing={AddRepositoryForm.forgeProgramIsMissingIn(fleetDocument)} onClose={() => goTo(FORGES_FRAGMENT)} />
        : null}
    </>
  );
}

export function forgesViewPartsOf(fleetDocument: FleetDocument, route: ForgesRoute, clock: ClockReading, goTo: (fragment: string) => void): ForgesViewParts {
  return {
    status:  ForgesModel.statusOf(fleetDocument),
    actions: (
      <>
        <LookAgainButton />
        <Button label="Add a repository" emphasis="primary" href={ADD_A_REPOSITORY_FRAGMENT} />
      </>
    ),
    content: <ForgesView fleetDocument={fleetDocument} route={route} clock={clock} goTo={goTo} />,
  };
}
