/**
 * Every mark an emote or a gesture can show. The mark names, their details and the mark part of the pose are derived from this list, so
 * a mark's name is written only in its own definition.
 */
import type { MarkDefinition } from './MarkDefinition.ts';
import { ANGER_VEIN_MARK }     from './anger-vein/AngerVeinMark.ts';
import { EXCLAMATION_MARK }    from './exclamation/ExclamationMark.ts';
import { GREETING_MARK }       from './greeting/GreetingMark.ts';
import { HAPPY_GLINTS_MARK }   from './happy-glints/HappyGlintsMark.ts';
import { LIGHTBULB_MARK }      from './lightbulb/LightbulbMark.ts';
import { QUESTION_MARK }       from './question/QuestionMark.ts';
import { SWEAT_BEADS_MARK }    from './sweat-beads/SweatBeadsMark.ts';
import { SWEAT_DROP_MARK }     from './sweat-drop/SweatDropMark.ts';
import { THINKING_DOTS_MARK }  from './thinking-dots/ThinkingDotsMark.ts';

export const MARK_CATALOG = Object.freeze([
  ANGER_VEIN_MARK,
  SWEAT_DROP_MARK,
  EXCLAMATION_MARK,
  QUESTION_MARK,
  THINKING_DOTS_MARK,
  LIGHTBULB_MARK,
  HAPPY_GLINTS_MARK,
  SWEAT_BEADS_MARK,
  GREETING_MARK,
] as const);

type RegisteredMark = typeof MARK_CATALOG[number];

export type MarkName = RegisteredMark['name'];

type MarkDetailsByName = { readonly [Definition in RegisteredMark as Definition['name']]: Definition['restDetails'] };

export type MarkDetailsOf<Name extends MarkName> = MarkDetailsByName[Name];

type MarkDefinitionsByName = { readonly [Name in MarkName]: MarkDefinition<Name, MarkDetailsOf<Name>> };

const MARK_DEFINITIONS_BY_NAME = Object.freeze(Object.fromEntries(MARK_CATALOG.map((definition) => [definition.name, definition]))) as unknown as MarkDefinitionsByName;

export function markDefinitionOf<Name extends MarkName>(name: Name): MarkDefinitionsByName[Name] {
  return MARK_DEFINITIONS_BY_NAME[name];
}
