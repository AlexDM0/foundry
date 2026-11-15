/**
 * The page contract of `POST /api/forges/<trackerId>/frame-session` (PLAN 8.1 and 8.3): the address the page sets as the frame's `src`
 * to show one forge's Bridge in place, or why there is none. The server maps its verdict out to this answer in `src/adapters/page-api/`.
 */
import type { CONTRACT_VERSIONS } from '../../src/shared/constants/ContractVersions.ts';

/** `not-supported`: the forge serves no embed channel Gaia knows, so it opens only in a new tab. */
export type FrameSessionOutcome = 'done' | 'refused' | 'unreachable' | 'not-supported';

/**
 * `frameUrl` is set only at `done`: the Bridge's address with `?embedded=frame` and a one-time `#session=<code>`, spent by the frame's
 * first load. `refusal` is the forge's own code or Gaia's, and `text` the forge's sentence, in Gaia's words where the forge's names a
 * command (D10) and `null` where Gaia has none for it.
 */
export interface FrameSessionAnswerDocument {
  frameSessionVersion: typeof CONTRACT_VERSIONS.gaiaFrameSession;
  outcome:             FrameSessionOutcome;
  frameUrl:            string | null;
  refusal:             string | null;
  text:                string | null;
}
