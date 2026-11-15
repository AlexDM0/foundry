/**
 * When the mind asks a director, which one, and what it tells it. The director is asked every few seconds, and at once when a cue waits,
 * but only while the running behaviour asks it. A host's brain answers in place of the rule director until its maximum time ends, except
 * while Flint sleeps.
 */
import type {
  Director,
  PerceptionDigest,
  SpriteContent,
  SpriteHabitat
} from '../SpriteHabitat.ts';
import { isSpriteIntent }        from '../SpriteHabitat.ts';
import { behaviourDefinitionOf } from '../behaviours/BehaviourCatalog.ts';
import { DIRECTOR }              from '../constants/Mind.ts';
import { sleepIsActive }         from '../sleep/SleepSequence.ts';
import type { SpriteMindState }  from './MindState.ts';

export interface BrainSession {
  readonly director:           Director;
  readonly endsAtMilliseconds: number;
}

/** Null when the maximum time is not a positive number: the rule director goes on. */
export function brainSessionOf(director: Director, maximumMilliseconds: number, elapsedMilliseconds: number): BrainSession | null {
  if (!Number.isFinite(maximumMilliseconds) || maximumMilliseconds <= 0) return null;
  return { director, endsAtMilliseconds: elapsedMilliseconds + maximumMilliseconds };
}

/** The session while its time runs; null once it has ended. */
export function brainSessionAt(session: BrainSession | null, elapsedMilliseconds: number): BrainSession | null {
  return session !== null && elapsedMilliseconds < session.endsAtMilliseconds ? session : null;
}

export function directorIsDue(state: SpriteMindState, elapsedMilliseconds: number): boolean {
  if (!behaviourDefinitionOf(state.behaviour.name).asksDirector || state.pendingIntent !== null) return false;
  return state.directorInbox.length > 0 || elapsedMilliseconds - state.lastDirectorAskMilliseconds >= DIRECTOR.ASK_INTERVAL_MILLISECONDS;
}

/** The brain never answers while Flint sleeps, so a sleeping Flint makes no call. */
export function brainAnswers(session: BrainSession | null, state: SpriteMindState): boolean {
  return session !== null && !sleepIsActive(state.sleep);
}

export interface DigestInput {
  readonly state:               SpriteMindState;
  /** The habitat Flint lives in; null is its home. */
  readonly habitat:             SpriteHabitat | null;
  readonly content:             SpriteContent | null;
  readonly visitTargetKind:     string | null;
  readonly copyIsOffered:       boolean;
  readonly elapsedMilliseconds: number;
}

export function perceptionDigestOf(input: DigestInput): PerceptionDigest {
  const { state, habitat } = input;
  return {
    habitatKind:       habitat?.kind ?? null,
    description:       habitat?.description ?? null,
    suggestions:       habitat?.suggestions ?? [],
    recentCues:        state.recentCues,
    newCues:           state.directorInbox,
    content:           input.content,
    lastIntent:        state.lastIntent !== null && isSpriteIntent(state.lastIntent) ? state.lastIntent : null,
    isAsleep:          sleepIsActive(state.sleep),
    visitTargetKind:   input.visitTargetKind,
    copyIsOffered:     input.copyIsOffered,
    quietMilliseconds: input.elapsedMilliseconds - state.quietSinceMilliseconds,
  };
}
