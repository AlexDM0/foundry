/**
 * agent-dashboard frames the Bridge across origins, so theme in and Esc out travel by `postMessage`, in agent-dashboard's own message
 * shapes: `{kind: 'theme', themeChoice}` in and `{kind: 'leave-board'}` out. A message is accepted only from the framing parent at its own
 * origin: `frame-ancestors` lets only agent-dashboard's origins frame the Bridge, so that origin is one of them. The Bridge posts only to
 * that origin, never to `*`.
 */
import type { ThemeChoice } from './ThemeBootstrap.ts';

export const THEME_MESSAGE_KIND = 'theme';
export const LEAVE_BOARD_MESSAGE_KIND = 'leave-board';

export interface EmbeddedSurroundings {
  readonly window:       Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly parent:       Pick<Window, 'postMessage'> | null;
  /** The framing parent's origin, `null` when it cannot be known; then nothing is accepted or sent. */
  readonly parentOrigin: string | null;
}

export interface EmbeddedChannelOptions {
  readonly onTheme:     (choice: ThemeChoice) => void;
  /** Whether a panel is open, which Esc closes first instead of leaving the frame. */
  readonly panelIsOpen: () => boolean;
}

export interface EmbeddedChannel {
  readonly close: () => void;
}

function themeChoiceCarriedBy(data: unknown): ThemeChoice | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { kind, themeChoice } = data as { kind?: unknown; themeChoice?: unknown };
  if (kind !== THEME_MESSAGE_KIND) return null;
  return themeChoice === 'auto' || themeChoice === 'light' || themeChoice === 'dark' ? themeChoice : null;
}

function open(surroundings: EmbeddedSurroundings, options: EmbeddedChannelOptions): EmbeddedChannel {
  const { parent, parentOrigin } = surroundings;
  const onMessage = (event: MessageEvent): void => {
    if (parentOrigin === null || event.origin !== parentOrigin || event.source !== parent) return;
    const themeChoice = themeChoiceCarriedBy(event.data);
    if (themeChoice !== null) options.onTheme(themeChoice);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || options.panelIsOpen() || parent === null || parentOrigin === null) return;
    parent.postMessage({ kind: LEAVE_BOARD_MESSAGE_KIND }, parentOrigin);
  };
  surroundings.window.addEventListener('message', onMessage as EventListener);
  surroundings.window.addEventListener('keydown', onKeyDown as EventListener);
  return {
    close: () => {
      surroundings.window.removeEventListener('message', onMessage as EventListener);
      surroundings.window.removeEventListener('keydown', onKeyDown as EventListener);
    },
  };
}

/** The parent's origin from the browser's ancestor list where it has one, otherwise from the referrer the framing page sent. */
function parentOriginOf(location: Location, referrer: string): string | null {
  const [ancestorOrigin] = location.ancestorOrigins ?? [];
  if (ancestorOrigin !== undefined) return ancestorOrigin;
  try {
    return referrer === '' ? null : new URL(referrer).origin;
  } catch {
    return null;
  }
}

function browserSurroundings(): EmbeddedSurroundings {
  const framed = window.parent !== window;
  return { window, parent: framed ? window.parent : null, parentOrigin: framed ? parentOriginOf(window.location, document.referrer) : null };
}

export const EmbeddedChannel = Object.freeze({ open, browserSurroundings });
