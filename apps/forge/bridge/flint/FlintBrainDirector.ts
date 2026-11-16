/**
 * Flint's second director while the Overseer runs its brain: each ask goes to the brain over the ask route, with the moves this Flint
 * knows and the excerpt cut to the length the brain reads, and its move comes back. No ask goes out while the page is hidden or Flint
 * sleeps; that time, and whenever the brain does not move, the director refuses, and Flint's rule director moves instead.
 */
import type {
  Director,
  PerceptionDigest,
  SpriteContent,
  SpriteIntent
} from 'flint/SpriteHabitat';
import { isSpriteIntent, SPRITE_INTENTS } from 'flint/SpriteHabitat';

import { FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS }                                    from '../../src/shared/constants/OverseerLimits.ts';
import type { FlintBrainAsk, FlintBrainContentDocument, FlintBrainDigestDocument } from '../api/FlintBrainClient.ts';

export type FlintBrainFallbackReason = 'page-hidden' | 'asleep' | 'not-asked' | 'refused' | 'no-session' | 'unreachable' | 'off-list-answer';

/** The director's refusal, which hands this move to the rule director. */
export class FlintBrainFallback extends Error {
  public readonly reason: FlintBrainFallbackReason;

  public constructor(reason: FlintBrainFallbackReason) {
    super(reason);
    this.name = 'FlintBrainFallback';
    this.reason = reason;
  }
}

export interface FlintBrainDirectorOptions {
  readonly ask:              (digest: FlintBrainDigestDocument) => Promise<FlintBrainAsk>;
  readonly documentIsHidden: () => boolean;
}

/** The package names its emotes only on its intent list, so the brain chooses an emote as its one intent and never beside one. */
const NO_SEPARATE_EMOTES: readonly string[] = Object.freeze([]);

function contentDocumentOf(content: SpriteContent | null): FlintBrainContentDocument | null {
  if (content === null) return null;
  const { excerpt } = content;
  return excerpt === undefined ? { facts: content.facts } : { facts: content.facts, excerpt: excerpt.slice(-FLINT_BRAIN_EXCERPT_LIMIT_CHARACTERS) };
}

function digestDocumentOf(digest: PerceptionDigest): FlintBrainDigestDocument {
  return {
    habitatKind:       digest.habitatKind,
    description:       digest.description,
    suggestions:       digest.suggestions,
    recentCues:        digest.recentCues,
    newCues:           digest.newCues,
    content:           contentDocumentOf(digest.content),
    lastIntent:        digest.lastIntent,
    isAsleep:          digest.isAsleep,
    visitTargetKind:   digest.visitTargetKind,
    copyIsOffered:     digest.copyIsOffered,
    quietMilliseconds: digest.quietMilliseconds,
    intents:           SPRITE_INTENTS,
    emotes:            NO_SEPARATE_EMOTES,
  };
}

function create(options: FlintBrainDirectorOptions): Director {
  const nextIntent = async (digest: PerceptionDigest): Promise<SpriteIntent> => {
    if (options.documentIsHidden()) throw new FlintBrainFallback('page-hidden');
    if (digest.isAsleep) throw new FlintBrainFallback('asleep');
    const asked = await options.ask(digestDocumentOf(digest));
    if (asked.verdict !== 'answered') throw new FlintBrainFallback(asked.verdict);
    if (!isSpriteIntent(asked.intent)) throw new FlintBrainFallback('off-list-answer');
    return asked.intent;
  };
  return Object.freeze({ nextIntent });
}

export const FlintBrainDirector = Object.freeze({ create, digestDocumentOf });
