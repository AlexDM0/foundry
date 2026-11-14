/**
 * The Forges view's root (`#forges`, `#forges/add`). It reads the command sender, keeps which row's Stop dialog is open with its choice,
 * the last command it sent each forge, the last settings change and whether "What notifies" is open, builds the content from the fleet
 * document, and lays it out, with "Add a repository" over it when the route asks. `forgesViewPartsOf` hands the shell the page title's
 * parts with it, so a new fleet document changes both at once, with no reload.
 */
import { Button }              from 'design-system/Button';
import { useEffect, useState } from 'react';

import type { CommandBody, ForgeCommandBody }                             from '../../@types/CommandDocument.ts';
import type { FleetDocument }                                             from '../../@types/FleetDocument.ts';
import { useCommandSender }                                               from '../../api/CommandSender.ts';
import type { ViewParts }                                                 from '../../shared/@types/ViewParts.ts';
import { LookAgainButton }                                                from '../../shared/LookAgainButton.tsx';
import { AddRepositoryForm }                                              from '../../shared/add-repository/AddRepositoryForm.ts';
import { HashRouter }                                                     from '../../shell/HashRouter.ts';
import { AddRepositoryDialog }                                            from './AddRepositoryDialog.tsx';
import { forgeAnchorIdOf, ForgesLayout }                                  from './ForgesLayout.tsx';
import { type ClockReading, ForgesModel, type StopDialogState }           from './ForgesModel.ts';
import { GaiaPanelModel, type SentSettingsChange, type SettingsCheckbox } from './GaiaPanelModel.ts';
import { WhatNotifiesDialog }                                             from './WhatNotifiesDialog.tsx';

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

const TITLE = 'Forges';

const LEAD = 'Every forge on this machine, what each one runs, and the limit the machine sets.';

const FORGES_FRAGMENT = HashRouter.fragmentOf({ view: 'forges', addingARepository: false, forgeInView: null });
const ADD_A_REPOSITORY_FRAGMENT = HashRouter.fragmentOf({ view: 'forges', addingARepository: true, forgeInView: null });

export function ForgesView({
  fleetDocument, route, clock, goTo
}: ForgesViewProps) {
  const {
    send, dismissFailure, dismissRestartPending, states
  } = useCommandSender();
  const [stopDialog, setStopDialog] = useState<StopDialogState | null>(null);
  const [lastSent, setLastSent] = useState<ReadonlyMap<string, ForgeCommandBody>>(() => new Map());
  const [sentSettingsChange, setSentSettingsChange] = useState<SentSettingsChange | null>(null);
  const [whatNotifiesIsOpen, setWhatNotifiesIsOpen] = useState(false);
  const { forgeInView } = route;

  useEffect(() => {
    if (forgeInView !== null) document.getElementById(forgeAnchorIdOf(forgeInView))?.scrollIntoView({ block: 'nearest' });
  }, [forgeInView]);

  const sendRecorded = (command: CommandBody) => {
    if ('trackerId' in command) setLastSent((current) => new Map(current).set(command.trackerId, command));
    return send(command);
  };

  /** The result is kept with the checkbox that sent it, so its refusal shows beside that checkbox and nowhere else. */
  const sendSettingsCheckbox = (checkbox: SettingsCheckbox) => {
    setSentSettingsChange({ checkbox, result: null });
    void send(checkbox.command).then((result) => setSentSettingsChange((current) => (current?.checkbox === checkbox ? { checkbox, result } : current)));
  };

  const gaiaPanelSurroundings = { commandStates: states, sentSettingsChange };
  const content = ForgesModel.forgesContentOf(fleetDocument, {
    clock, commandStates: states, stopDialog, forgeInView, lastSent
  });
  // A forge stopped from elsewhere drops its dialog, so it does not open again by itself once the forge runs again.
  if (stopDialog !== null && content.rows.every((row) => row.stopDialog === null)) setStopDialog(null);
  return (
    <>
      <ForgesLayout
        content={content}
        gaiaPanel={GaiaPanelModel.gaiaPanelOf(fleetDocument, gaiaPanelSurroundings)}
        commandStates={states}
        handlers={{
          onCommand:        (command) => void sendRecorded(command),
          onOpenStopDialog: (trackerId) => setStopDialog({ trackerId, agents: 'keep' }),
          onStopChoice:     (agents) => setStopDialog((current) => (current === null ? null : { trackerId: current.trackerId, agents })),
          onCancelStop:     () => setStopDialog(null),
          onConfirmStop:    (command) => {
            void sendRecorded(command).then(() => setStopDialog((current) => (current?.trackerId === command.trackerId ? null : current)));
          },
          onDismissFailure:        dismissFailure,
          onDismissRestartPending: dismissRestartPending,
          onSettingsCheckbox:      sendSettingsCheckbox,
          onOpenWhatNotifies:      () => setWhatNotifiesIsOpen(true),
        }}
      />
      {whatNotifiesIsOpen
        ? (
          <WhatNotifiesDialog
            content={GaiaPanelModel.whatNotifiesOf(fleetDocument, gaiaPanelSurroundings)}
            handlers={{ onSettingsCheckbox: sendSettingsCheckbox, onDismissFailure: dismissFailure }}
            onClose={() => setWhatNotifiesIsOpen(false)}
          />
        )
        : null}
      {route.addingARepository
        ? <AddRepositoryDialog forgeProgramIsMissing={AddRepositoryForm.forgeProgramIsMissingIn(fleetDocument)} onClose={() => goTo(FORGES_FRAGMENT)} />
        : null}
    </>
  );
}

/** Before the first fleet document the title stands alone: no figure, and no button that acts on forges Gaia does not know yet. */
export function forgesViewPartsOf(fleetDocument: FleetDocument | null, route: ForgesRoute, clock: ClockReading, goTo: (fragment: string) => void): ViewParts {
  if (fleetDocument === null) {
    return {
      title: TITLE, lead: LEAD, figures: [], actions: null, content: null
    };
  }
  return {
    title:   TITLE,
    lead:    LEAD,
    figures: ForgesModel.titleFiguresOf(fleetDocument),
    actions: (
      <>
        <LookAgainButton />
        <Button label="Add a repository" emphasis="primary" compact href={ADD_A_REPOSITORY_FRAGMENT} />
      </>
    ),
    content: <ForgesView fleetDocument={fleetDocument} route={route} clock={clock} goTo={goTo} />,
  };
}
