/**
 * The Attention view's root, the shell's default route. It reads the command sender, builds the screen from the fleet document and the
 * shell's reading of the page's clock, and lays it out: the fleet (A1, B3) or no forge yet (B4). `attentionViewPartsOf` hands the shell
 * the page title's parts with it, so a new fleet document changes both at once, with no reload.
 */
import type { FleetDocument }                from '../../@types/FleetDocument.ts';
import { useCommandSender }                  from '../../api/CommandSender.ts';
import type { ViewParts }                    from '../../shared/@types/ViewParts.ts';
import { AttentionLayout }                   from './AttentionLayout.tsx';
import { AttentionModel, type ClockReading } from './AttentionModel.ts';
import { NoForgeYet }                        from './NoForgeYet.tsx';

export interface AttentionViewProps {
  readonly fleetDocument: FleetDocument;
  readonly clock:         ClockReading;
}

const TITLE = 'Attention';

const LEAD = 'What waits on you across every forge, and the forges that need a look.';

export function AttentionView({ fleetDocument, clock }: AttentionViewProps) {
  const {
    send, dismissFailure, dismissRestartPending, states
  } = useCommandSender();
  const screen = AttentionModel.screenOf(fleetDocument, clock);
  if (screen.kind === 'no-forge') return <NoForgeYet content={screen.content} />;
  return (
    <AttentionLayout
      content={screen.content}
      commandStates={states}
      onCommand={(command) => void send(command)}
      onDismissFailure={dismissFailure}
      onDismissRestartPending={dismissRestartPending}
    />
  );
}

/**
 * B4 heads itself, so it has no page title. A1's figures stand in the page title; while a forge is not fully read (B3) they fold into one
 * line atop the main column instead.
 */
export function attentionViewPartsOf(fleetDocument: FleetDocument | null, clock: ClockReading): ViewParts {
  if (fleetDocument === null) {
    return {
      title: TITLE, lead: LEAD, figures: [], actions: null, content: null
    };
  }
  const content = <AttentionView fleetDocument={fleetDocument} clock={clock} />;
  if (AttentionModel.noForgeIsRegisteredIn(fleetDocument)) {
    return {
      title: null, lead: '', figures: [], actions: null, content
    };
  }
  return {
    title: TITLE, lead: LEAD, figures: AttentionModel.titleFiguresOf(fleetDocument), actions: null, content
  };
}
