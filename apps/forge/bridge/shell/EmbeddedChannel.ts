/**
 * The window ends of the Bridge in a frame: the framing parent and its origin, and Esc forwarded to it as the leave message. A framing
 * page frames the Bridge across origins, and `frame-ancestors` lets only the origins forge knows frame it, so the parent's origin is one
 * of them. The Bridge posts only to that origin, never to `*`; the messages themselves are the embed channel's (`VersionedEmbedChannel.ts`).
 */

export interface EmbeddedSurroundings {
  readonly window:       Pick<Window, 'addEventListener' | 'removeEventListener'>;
  readonly parent:       Pick<Window, 'postMessage'> | null;
  /** The framing parent's origin, `null` when it cannot be known; then nothing is accepted or sent. */
  readonly parentOrigin: string | null;
}

export interface EmbeddedChannel {
  readonly close: () => void;
}

/** `panelIsOpen` says whether a panel is open, which Esc closes first instead of leaving the frame. */
function forwardEscape(surroundings: EmbeddedSurroundings, panelIsOpen: () => boolean, leaveMessage: object): EmbeddedChannel {
  const { parent, parentOrigin } = surroundings;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.defaultPrevented || panelIsOpen() || parent === null || parentOrigin === null) return;
    parent.postMessage(leaveMessage, parentOrigin);
  };
  surroundings.window.addEventListener('keydown', onKeyDown as EventListener);
  return { close: () => surroundings.window.removeEventListener('keydown', onKeyDown as EventListener) };
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

export const EmbeddedChannel = Object.freeze({ forwardEscape, browserSurroundings });
