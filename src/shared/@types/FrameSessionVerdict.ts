/** How Gaia ended one request for a forge's frame session (PLAN 8.3). Internal only, so it carries no version. */

/**
 * `forge-not-registered`: the registry names no such forge. `token-unreadable`: the Overseer's token file cannot be read.
 * `token-rejected`: the Overseer refused the token.
 */
export type FrameSessionRefusal = 'forge-not-registered' | 'token-unreadable' | 'token-rejected';

/**
 * `opened`: the forge gave a session code, and `frameUrl` holds it. `unreachable`: no Overseer of the forge answers. `not-supported`: the
 * forge serves no embed channel Gaia knows, or answered the code in a way Gaia does not understand.
 */
export type FrameSessionVerdict =
  | { readonly verdict: 'opened'; readonly frameUrl: string }
  | { readonly verdict: 'refused'; readonly refusedBy: 'forge'; readonly refusal: string | null; readonly text: string | null }
  | { readonly verdict: 'refused'; readonly refusedBy: 'gaia'; readonly refusal: FrameSessionRefusal }
  | { readonly verdict: 'unreachable' }
  | { readonly verdict: 'not-supported' };
