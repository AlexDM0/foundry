/**
 * The intake chat's own cue of the chat habitat (Flint's board wiring design, "New habitats", `intake`): a filing draft's state becomes
 * `researching`, also a draft that appears researching, which is a draft opened with no question. A draft names no session, so the chat
 * of any intake session shows it.
 */
import type { SpriteCue }                from 'flint/SpriteHabitat';
import type { BoardFilingDraftDocument } from '../../../@types/board/BoardTicketDocuments.ts';
import { CHAT_CUES }                     from '../../conversation/ChatSpriteHabitat.ts';

/** The fields of an open filing draft the cue reads; the board's drafts satisfy it unchanged. */
export type CuedDraft = Pick<BoardFilingDraftDocument, 'id' | 'state'>;

const RESEARCHING_STATE = 'researching';

function cuesBetween(previous: readonly CuedDraft[], next: readonly CuedDraft[]): readonly SpriteCue[] {
  const previousStateById = new Map(previous.map((draft) => [draft.id, draft.state]));
  const beganResearching = next.some((draft) => draft.state === RESEARCHING_STATE && previousStateById.get(draft.id) !== RESEARCHING_STATE);
  return beganResearching ? [CHAT_CUES.DRAFT_IS_RESEARCHING] : [];
}

export const IntakeSpriteModel = Object.freeze({ cuesBetween });
