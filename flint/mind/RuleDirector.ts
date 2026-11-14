/**
 * The default director (`03-behaviour-and-architecture.md`, "The mind"): it follows the suggestions of the habitat Flint lives in. The
 * newest new cue that has a suggestion wins. With nothing new, a sleeping Flint sleeps on, an awake one visits the visit target, copies
 * what its habitat offers to copy, and after the quiet time goes home to sleep; otherwise it wanders. The copy follows the habitat's state,
 * so a Flint that arrives while an agent already works copies it too.
 */
import type { Director, PerceptionDigest, SpriteIntent } from '../SpriteHabitat.ts';
import { DIRECTOR }                                      from '../constants/Behaviours.ts';

export function ruleDirectorIntentOf(digest: PerceptionDigest): SpriteIntent {
  for (const cue of [...digest.newCues].reverse()) {
    const suggestion = digest.suggestions.find((candidate) => candidate.when === cue);
    if (suggestion !== undefined) return suggestion.respond;
  }
  if (digest.isAsleep) return 'sleep';
  if (digest.visitTargetKind !== null) return 'visit';
  if (digest.copyIsOffered) return 'copy';
  if (digest.quietMilliseconds >= DIRECTOR.QUIET_BEFORE_SLEEP_MILLISECONDS) return 'sleep';
  return 'wander';
}

export const RULE_DIRECTOR: Director = Object.freeze({ nextIntent: ruleDirectorIntentOf });
