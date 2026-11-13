/**
 * One forge's Bridge in Gaia's frame, from the frame session it asks for to the embed channel it keeps (SCREENS B1, PLAN 8.3). Once the
 * Bridge is ready Gaia posts the theme, and `navigate` to the route's Bridge fragment when the Bridge does not already show it; the
 * Bridge's own route is written into Gaia's address without a history entry, so Back leaves the forge; `leave` goes back to the view Gaia
 * came from; `session-lost` from a ready Bridge asks for a new frame session and loads a fresh frame, so a restarted Overseer needs
 * nothing of User.
 */
import { HashRouter }       from '../../shell/HashRouter.ts';
import type { ThemeChoice } from '../../shell/ThemeBootstrap.ts';
import {
  type BridgeMessage,
  EmbedChannel,
  type EmbedChannelSurroundings,
  type EmbedFrameWindow,
  type OpenEmbedChannel,
} from './EmbedChannel.ts';
import type { FrameSessionResult } from './FrameSessionRequest.ts';

/**
 * `opened` holds the frame's address, which only the frame's `src` may carry, and the count of frames loaded in this session, which keys a
 * fresh frame after each new session. `refused` and `server-unreachable` keep what the refusal shows.
 */
export type ForgeFrameState =
  | { readonly phase: 'asking' }
  | {
    readonly phase:         'opened';
    readonly frameUrl:      string;
    readonly frameOrigin:   string;
    readonly frameLoad:     number;
    readonly bridgeIsReady: boolean;
  }
  | { readonly phase: 'not-supported' }
  | { readonly phase: 'unreachable' }
  | { readonly phase: 'refused'; readonly refusal: string; readonly text: string | null };

export interface ForgeFrameSessionSurroundings {
  readonly requestFrameSession: (trackerId: string) => Promise<FrameSessionResult>;
  readonly embed:               EmbedChannelSurroundings;
  /** Writes Gaia's address in place of the current one, adding no history entry. */
  readonly replaceFragment:     (fragment: string) => void;
  /** Goes back to the view Gaia came from. */
  readonly leave:               () => void;
}

export interface ForgeFrameSessionOpening {
  readonly trackerId:      string;
  readonly bridgeFragment: string | null;
  readonly themeChoice:    ThemeChoice;
}

export interface ForgeFrameSession {
  readonly state:        () => ForgeFrameState;
  readonly subscribe:    (listener: () => void) => () => void;
  /** Asks for a frame session; the returned stop ignores an answer still on its way and closes the channel. */
  readonly start:        () => () => void;
  readonly askAgain:     () => void;
  /** Opens the embed channel to the frame now loading the opened session; the returned close ends it. */
  readonly attachFrame:  (frameWindow: EmbedFrameWindow) => () => void;
  readonly routeChanged: (bridgeFragment: string | null) => void;
  readonly themeChanged: (themeChoice: ThemeChoice) => void;
}

const ASKING: ForgeFrameState = { phase: 'asking' };

const FRAGMENT_MARK = '#';

/** Gaia's own reason for no frame when the Bridge lost the session it was just given. */
export const SESSION_LOST_WHILE_OPENING = 'session-lost-while-opening';

/** The Bridge's own session exchange reads its code from this fragment; such a fragment is never written into Gaia's address. */
const SESSION_CODE_FRAGMENT_PREFIX = '#session=';

/** The Bridge's fragment as Gaia's route keeps it: with its mark, and `null` for the Bridge's start. */
function bridgeFragmentOf(fragment: string): string | null {
  if (fragment === '' || fragment === FRAGMENT_MARK) return null;
  return fragment.startsWith(FRAGMENT_MARK) ? fragment : `${FRAGMENT_MARK}${fragment}`;
}

function create(opening: ForgeFrameSessionOpening, surroundings: ForgeFrameSessionSurroundings): ForgeFrameSession {
  const { trackerId } = opening;
  const listeners = new Set<() => void>();
  let state: ForgeFrameState = ASKING;
  let { bridgeFragment } = opening;
  let { themeChoice } = opening;
  let isStarted = false;
  let askNumber = 0;
  let frameLoads = 0;
  let channel: OpenEmbedChannel | null = null;
  /** What the frame now loaded last said it shows; `null` until it says. */
  let reportedBridgeFragment: string | null = null;

  const changeState = (next: ForgeFrameState): void => {
    state = next;
    [...listeners].forEach((listener) => listener());
  };

  const closeChannel = (): void => {
    channel?.close();
    channel = null;
  };

  const stateAfter = (result: FrameSessionResult): ForgeFrameState => {
    switch (result.verdict) {
      case 'opened':
        frameLoads += 1;
        return {
          phase: 'opened', frameUrl: result.frameUrl, frameOrigin: result.frameOrigin, frameLoad: frameLoads, bridgeIsReady: false,
        };
      case 'refused':
        return { phase: 'refused', refusal: result.refusal, text: result.text };
      case 'server-unreachable':
      case 'answer-not-understood':
        return { phase: 'refused', refusal: result.verdict, text: null };
      case 'not-supported':
      case 'unreachable':
        return { phase: result.verdict };
    }
  };

  const ask = (): void => {
    askNumber += 1;
    const thisAsk = askNumber;
    closeChannel();
    reportedBridgeFragment = null;
    changeState(ASKING);
    void surroundings.requestFrameSession(trackerId).then((result) => {
      if (isStarted && thisAsk === askNumber) changeState(stateAfter(result));
    });
  };

  const postNavigateIfTheBridgeShowsAnotherRoute = (): void => {
    if (channel === null || bridgeFragment === null || bridgeFragment === reportedBridgeFragment) return;
    channel.post({ kind: 'navigate', fragment: bridgeFragment });
  };

  const onReady = (): void => {
    if (state.phase !== 'opened' || state.bridgeIsReady) return;
    changeState({ ...state, bridgeIsReady: true });
    channel?.post({ kind: 'theme', themeChoice });
    postNavigateIfTheBridgeShowsAnotherRoute();
  };

  /** A route before `ready` is the Bridge's own first route, which would overwrite the one Gaia is about to ask for. */
  const onRoute = (fragment: string): void => {
    if (state.phase !== 'opened' || !state.bridgeIsReady || fragment.startsWith(SESSION_CODE_FRAGMENT_PREFIX)) return;
    const reported = bridgeFragmentOf(fragment);
    reportedBridgeFragment = reported;
    bridgeFragment = reported;
    surroundings.replaceFragment(HashRouter.fragmentOf({ view: 'forge', trackerId, bridgeFragment: reported }));
  };

  /** A frame that loses its session before it was ever ready would lose the next one too: Gaia stops there rather than ask without end. */
  const onSessionLost = (): void => {
    if (state.phase !== 'opened') return;
    if (state.bridgeIsReady) {
      ask();
      return;
    }
    closeChannel();
    changeState({ phase: 'refused', refusal: SESSION_LOST_WHILE_OPENING, text: null });
  };

  const onMessage = (message: BridgeMessage): void => {
    switch (message.kind) {
      case 'ready':
        onReady();
        return;
      case 'route':
        onRoute(message.fragment);
        return;
      case 'leave':
        surroundings.leave();
        return;
      case 'session-lost':
        onSessionLost();
    }
  };

  return {
    state:     () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start: () => {
      isStarted = true;
      ask();
      return () => {
        isStarted = false;
        askNumber += 1;
        closeChannel();
      };
    },
    askAgain: () => {
      if (isStarted) ask();
    },
    attachFrame: (frameWindow) => {
      if (state.phase !== 'opened') return () => undefined;
      closeChannel();
      reportedBridgeFragment = null;
      const attached = EmbedChannel.open({ frameOrigin: state.frameOrigin, frameWindow }, surroundings.embed, onMessage);
      channel = attached;
      return () => {
        if (channel !== attached) return;
        closeChannel();
      };
    },
    routeChanged: (nextBridgeFragment) => {
      if (nextBridgeFragment === bridgeFragment) return;
      bridgeFragment = nextBridgeFragment;
      if (state.phase === 'opened' && state.bridgeIsReady) postNavigateIfTheBridgeShowsAnotherRoute();
    },
    themeChanged: (nextThemeChoice) => {
      if (nextThemeChoice === themeChoice) return;
      themeChoice = nextThemeChoice;
      if (state.phase === 'opened' && state.bridgeIsReady) channel?.post({ kind: 'theme', themeChoice });
    },
  };
}

export const ForgeFrameSession = { create } as const;
