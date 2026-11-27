/**
 * The Attention view's root, the shell's default route. It reads the command sender, builds the screen from the fleet document and the
 * shell's reading of the page's clock, and lays it out: the fleet or no forge yet. `attentionViewPartsOf` hands the shell
 * the page title's parts with it, so a new fleet document changes both at once, with no reload.
 */
import type { FleetDocument } from '../../@types/FleetDocument.ts';
import { useCommandSender }   from '../../api/CommandSender.ts';
import type { ClockReading }  from '../../shared/@types/ClockReading.ts';
import type { ViewParts }     from '../../shared/@types/ViewParts.ts';
import { AttentionLayout }    from './AttentionLayout.tsx';
import { AttentionModel }     from './AttentionModel.ts';
import { NoForgeYet }         from './NoForgeYet.tsx';
import { OutageResumeButton } from './OutageResumeButton.tsx';

export interface AttentionViewProps {
  readonly fleetDocument: FleetDocument;
  readonly clock:         ClockReading;
}

const TITLE = 'Attention';

const LEAD = 'What waits on you across every forge, and the forges that need a look.';

export function AttentionView({ fleetDocument, clock }: AttentionViewProps) {
  const {
    send, dismissFailure, dismissRestartPending, dismissAnswer, states
  } = useCommandSender();
  const screen = AttentionModel.screenOf(fleetDocument, clock);
  if (screen.kind === 'no-forge') return <NoForgeYet content={screen.content} />;
  return (
    <AttentionLayout
      content={screen.content}
      outageResumeAnswer={AttentionModel.outageResumeAnswerOf(states.fleetAnswers.get('fleet-outage-resume') ?? null, fleetDocument)}
      commandStates={states}
      onCommand={(command) => void send(command)}
      onDismissFailure={dismissFailure}
      onDismissRestartPending={dismissRestartPending}
      onDismissOutageResumeAnswer={() => dismissAnswer('fleet-outage-resume')}
    />
  );
}

/**
 * The no-forge screen heads itself, so it has no page title. The fleet's figures stand in the page title; while a forge is not fully read they
 * fold into one line atop the main column instead. The outage resume stands in the page title whenever the fleet shows, with nothing to resume too.
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
    title: TITLE, lead: LEAD, figures: AttentionModel.titleFiguresOf(fleetDocument), actions: <OutageResumeButton />, content
  };
}
