/**
 * A forge in place, the root of `#forge/<trackerId>` (SCREENS B1). It reads the command sender, keeps the Stop question's state, and keeps
 * one frame session per Overseer: a new address or a new start of the forge's Overseer, as the fleet document reports it, mounts a new one.
 * The bar's Wake, its Stop for Flint's brain and the forge mark's double click send the brain's commands for this forge alone.
 * The view heads itself with the forge's bar, so `forgeFrameViewPartsOf` hands the shell no page title, only the bar over the frame area.
 * A new fleet document changes both at once.
 */
import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';

import type { CommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type { FleetDocument }                from '../../@types/FleetDocument.ts';
import { CommandSender, useCommandSender }   from '../../api/CommandSender.ts';
import type { ViewParts }                    from '../../shared/@types/ViewParts.ts';
import type { ThemeChoice }                  from '../../shell/ThemeBootstrap.ts';
import type { EmbedChannelSurroundings }     from './EmbedChannel.ts';
import {
  BarRefusalLine,
  ForgeBarControls,
  ForgeBarLayout,
  type FrameAreaShown,
  ForgeFrameAreaLayout,
  forgeMarkPropsOf,
} from './ForgeFrameLayout.tsx';
import {
  type ForgeBar,
  type ForgeFrameArea,
  type ForgeFrameClock,
  type ForgeFrameContent,
  ForgeFrameModel,
} from './ForgeFrameModel.ts';
import { ForgeFrameSession, type ForgeFrameState } from './ForgeFrameSession.ts';
import type { FrameSessionResult }                 from './FrameSessionRequest.ts';

/** What the page around a forge in place hands it: the server's frame sessions, the page's messages, its address and its theme. */
export interface ForgeFrameSurroundings {
  readonly requestFrameSession: (trackerId: string) => Promise<FrameSessionResult>;
  readonly embed:               EmbedChannelSurroundings;
  readonly replaceFragment:     (fragment: string) => void;
  readonly goTo:                (fragment: string) => void;
  /** The fragment of the view Gaia came from, where `leave` goes. */
  readonly leaveFragment:       string;
  readonly themeChoice:         ThemeChoice;
}

const LOOK_AGAIN: CommandBody = { kind: 'fleet-look-again' };

function shownOf(state: ForgeFrameState): FrameAreaShown {
  switch (state.phase) {
    case 'asking':
      return { kind: 'opening' };
    case 'opened':
      return {
        kind: 'frame', frameUrl: state.frameUrl, frameLoad: state.frameLoad, bridgeIsReady: state.bridgeIsReady,
      };
    case 'not-supported':
      return { kind: 'cannot-show' };
    case 'unreachable':
      return { kind: 'unreachable' };
    case 'refused':
      return { kind: 'refused', refusal: ForgeFrameModel.frameSessionRefusalTextOf(state.refusal, state.text) };
  }
}

function ForgeBarWithControls({ bar }: { readonly bar: ForgeBar }) {
  const { send, states } = useCommandSender();
  const [stopIsOpen, setStopIsOpen] = useState(false);
  const [stopAgents, setStopAgents] = useState<ForgeStopAgents>('keep');
  const commandState = CommandSender.stateOf(states, { trackerId: bar.trackerId });
  const commandIsOnItsWay = commandState.onItsWay !== null;
  const brainShown = bar.brain === null ? null : ForgeFrameModel.brainShownAfter(bar.brain, commandState.failure);
  const markWake = ForgeFrameModel.markWakeOf(bar.brain, brainShown);
  const wakeBrain = (): void => void send({ kind: 'forge-brain-start', trackerId: bar.trackerId });
  return (
    <ForgeBarLayout
      name={bar.project}
      status={bar.status}
      mark={forgeMarkPropsOf(markWake, commandIsOnItsWay, wakeBrain)}
      controls={(
        <ForgeBarControls
          bar={bar}
          brainShown={brainShown}
          commandIsOnItsWay={commandIsOnItsWay}
          stopIsOpen={stopIsOpen}
          stopAgents={stopAgents}
          onCommand={(command) => {
            if (command.kind === 'forge-stop') setStopIsOpen(false);
            void send(command);
          }}
          onOpenStop={() => {
            setStopAgents('keep');
            setStopIsOpen((isOpen) => !isOpen);
          }}
          onChooseStop={setStopAgents}
          onCancelStop={() => setStopIsOpen(false)}
        />
      )}
    />
  );
}

interface FramedForgeProps {
  readonly area:              Extract<ForgeFrameArea, { kind: 'frame' }>;
  readonly bridgeFragment:    string | null;
  readonly surroundings:      ForgeFrameSurroundings;
  readonly commandIsOnItsWay: boolean;
  readonly onOpenInNewTab:    () => void;
}

/** One frame session, for as long as the same Overseer serves the forge; its key in the parent is the forge and its Overseer. */
function FramedForge({
  area, bridgeFragment, surroundings, commandIsOnItsWay, onOpenInNewTab
}: FramedForgeProps) {
  const {
    requestFrameSession, embed, replaceFragment, goTo, leaveFragment, themeChoice
  } = surroundings;
  const leave = useCallback(() => goTo(leaveFragment), [goTo, leaveFragment]);
  const [session] = useState(() => ForgeFrameSession.create(
    { trackerId: area.trackerId, bridgeFragment, themeChoice },
    {
      requestFrameSession, embed, replaceFragment, leave,
    },
  ));
  const state = useSyncExternalStore(session.subscribe, session.state, session.state);
  useEffect(() => session.start(), [session]);
  useEffect(() => session.routeChanged(bridgeFragment), [session, bridgeFragment]);
  useEffect(() => session.themeChanged(themeChoice), [session, themeChoice]);
  const onFrameElement = useCallback((element: HTMLIFrameElement | null) => {
    const frameWindow = element?.contentWindow ?? null;
    return frameWindow === null ? undefined : session.attachFrame(frameWindow);
  }, [session]);
  return (
    <ForgeFrameAreaLayout
      area={area}
      shown={shownOf(state)}
      onFrameElement={onFrameElement}
      onLookAgain={session.askAgain}
      onAskAgain={session.askAgain}
      onLeave={leave}
      onOpenInNewTab={onOpenInNewTab}
      commandIsOnItsWay={commandIsOnItsWay}
    />
  );
}

interface ForgeFrameContentViewProps {
  readonly content:        ForgeFrameContent;
  readonly bridgeFragment: string | null;
  readonly surroundings:   ForgeFrameSurroundings;
}

function ForgeFrameContentView({ content, bridgeFragment, surroundings }: ForgeFrameContentViewProps) {
  const { send, dismissFailure, states } = useCommandSender();
  const { area } = content;
  const subject = { trackerId: area.trackerId };
  const commandState = CommandSender.stateOf(states, subject);
  const refusal = ForgeFrameModel.barRefusalOf(area.trackerId, commandState.failure);
  const commandIsOnItsWay = commandState.onItsWay !== null;
  const sendCommand = (command: CommandBody): void => void send(command);
  const openInNewTab = (): void => sendCommand({ kind: 'forge-open-in-browser', trackerId: area.trackerId });
  return (
    <div className="gaia-forge-frame">
      {refusal === null ? null : <BarRefusalLine refusal={refusal} onCommand={sendCommand} onDismiss={() => dismissFailure(subject)} />}
      {area.kind === 'frame'
        ? (
          <FramedForge
            key={`${area.trackerId} ${area.overseerKey}`}
            area={area}
            bridgeFragment={bridgeFragment}
            surroundings={surroundings}
            commandIsOnItsWay={commandIsOnItsWay}
            onOpenInNewTab={openInNewTab}
          />
        )
        : (
          <ForgeFrameAreaLayout
            area={area}
            shown={null}
            onFrameElement={null}
            onLookAgain={() => sendCommand(LOOK_AGAIN)}
            onAskAgain={() => sendCommand(LOOK_AGAIN)}
            onLeave={() => surroundings.goTo(surroundings.leaveFragment)}
            onOpenInNewTab={openInNewTab}
            commandIsOnItsWay={commandIsOnItsWay}
          />
        )}
    </div>
  );
}

/**
 * Before the first fleet document the bar names the forge by its tracker id and the view shows nothing more: Gaia does not yet know whether
 * the forge can open in place.
 */
export function forgeFrameViewPartsOf(
  route: { readonly trackerId: string; readonly bridgeFragment: string | null },
  fleetDocument: FleetDocument | null,
  clock: ForgeFrameClock,
  surroundings: ForgeFrameSurroundings,
): ViewParts {
  const selfHeaded = {
    title: null, lead: '', figures: [], actions: null
  } as const;
  if (fleetDocument === null) {
    return { ...selfHeaded, content: <div className="gaia-forge-frame-view"><ForgeBarLayout name={route.trackerId} status={null} mark={{}} controls={null} /></div> };
  }
  const content = ForgeFrameModel.forgeFrameContentOf(route.trackerId, fleetDocument, clock);
  const { bar } = content;
  return {
    ...selfHeaded,
    content: (
      <div className="gaia-forge-frame-view">
        {bar === null
          ? <ForgeBarLayout name={route.trackerId} status={null} mark={{}} controls={null} />
          : <ForgeBarWithControls key={bar.trackerId} bar={bar} />}
        <ForgeFrameContentView content={content} bridgeFragment={route.bridgeFragment} surroundings={surroundings} />
      </div>
    ),
  };
}
