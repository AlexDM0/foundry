/** Every emote; the mind reaches an emote only through this catalog. The emote names, which are their intents, are derived from it. */
import { ANNOYED_EMOTE }   from './annoyed/AnnoyedEmote.ts';
import { DOUBT_EMOTE }     from './doubt/DoubtEmote.ts';
import { HAPPY_EMOTE }     from './happy/HappyEmote.ts';
import { IDEA_EMOTE }      from './idea/IdeaEmote.ts';
import { NERVOUS_EMOTE }   from './nervous/NervousEmote.ts';
import { SURPRISED_EMOTE } from './surprised/SurprisedEmote.ts';
import { SWEATDROP_EMOTE } from './sweatdrop/SweatdropEmote.ts';
import { THINKING_EMOTE }  from './thinking/ThinkingEmote.ts';

export const EMOTE_CATALOG = Object.freeze([
  ANNOYED_EMOTE,
  SWEATDROP_EMOTE,
  SURPRISED_EMOTE,
  DOUBT_EMOTE,
  THINKING_EMOTE,
  IDEA_EMOTE,
  HAPPY_EMOTE,
  NERVOUS_EMOTE,
] as const);

export type EmoteName = typeof EMOTE_CATALOG[number]['name'];

export const EMOTE_NAMES: readonly EmoteName[] = Object.freeze(EMOTE_CATALOG.map((definition) => definition.name));
