/** How the Bridge words a lost browser session: a refused session code, or no session the Overseer knows. Both send the user to `open`. */
import { PRODUCT_NAMES } from '../../src/shared/constants/ProductNames.ts';

/** `code-refused`: the Overseer refused the code in the fragment. `no-session`: a data route answered 401. */
export type SessionLoss = 'code-refused' | 'no-session';

function openCommand(): string {
  return `${PRODUCT_NAMES.PROGRAM} open`;
}

function bannerOf(loss: SessionLoss): string {
  if (loss === 'code-refused') {
    return `This page's session code was already used or expired; another process may have used it. Run \`${openCommand()}\` again.`;
  }
  return `This page has no session with the Overseer, which may have restarted. Run \`${openCommand()}\` again.`;
}

export const SessionWordingUtil = Object.freeze({ bannerOf, openCommand });
