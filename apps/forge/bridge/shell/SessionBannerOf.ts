/** How the Bridge words a lost browser session: a refused session code, or no session the Overseer knows. Both ask to open the board again. */

/** `code-refused`: the Overseer refused the code in the fragment. `no-session`: a data route answered 401. */
export type SessionLoss = 'code-refused' | 'no-session';

const OPEN_AGAIN = 'Open the board again.';

export function sessionBannerOf(loss: SessionLoss): string {
  if (loss === 'code-refused') return `This page's session code was already used or expired; another process may have used it. ${OPEN_AGAIN}`;
  return `This page has no session with the Overseer, which may have restarted. ${OPEN_AGAIN}`;
}
