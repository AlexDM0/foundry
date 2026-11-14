/** Every emote by its name; the mind reaches an emote only through this catalog. */
import { ANNOYED_EMOTE }                   from './AnnoyedEmote.ts';
import { DOUBT_EMOTE }                     from './DoubtEmote.ts';
import type { EmoteDefinition, EmoteName } from './EmoteDefinition.ts';
import { HAPPY_EMOTE }                     from './HappyEmote.ts';
import { IDEA_EMOTE }                      from './IdeaEmote.ts';
import { NERVOUS_EMOTE }                   from './NervousEmote.ts';
import { SURPRISED_EMOTE }                 from './SurprisedEmote.ts';
import { SWEATDROP_EMOTE }                 from './SweatdropEmote.ts';
import { THINKING_EMOTE }                  from './ThinkingEmote.ts';

export const EMOTE_CATALOG: Readonly<Record<EmoteName, EmoteDefinition>> = Object.freeze({
  annoyed:   ANNOYED_EMOTE,
  sweatdrop: SWEATDROP_EMOTE,
  surprised: SURPRISED_EMOTE,
  doubt:     DOUBT_EMOTE,
  thinking:  THINKING_EMOTE,
  idea:      IDEA_EMOTE,
  happy:     HAPPY_EMOTE,
  nervous:   NERVOUS_EMOTE,
});
