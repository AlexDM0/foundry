/**
 * The contracts between Flint and its host (`03-behaviour-and-architecture.md`, "The sprite field"): the habitat a host component
 * declares, the fixed list of intents Flint can carry out, and the director that picks the next intent. Habitat kinds and cue names are
 * the host's own strings; Flint knows no host component.
 */

/** The attribute that marks Flint's overlay in the host's document: a host reads it to tell a press on Flint from a press on its page. */
export const FLINT_OVERLAY_ATTRIBUTE = 'data-flint';

/** Each contract carries its own version; a change of shape or meaning raises it. */
export const FLINT_CONTRACT_VERSIONS = Object.freeze({
  spriteHabitat: 1,
  spriteIntents: 1,
  storedHabitat: 1,
});

/** Every move Flint knows. A suggestion, a director and `perform` pick from this list only; anything else is refused. */
export const SPRITE_INTENTS = Object.freeze([
  'wander',
  'visit',
  'copy',
  'sleep',
  'wave',
  'point',
  'type',
  'type-busy',
  'type-angry',
  'review',
  'review-busy',
  'review-angry',
  'research',
  'make-ticket',
  'merge',
  'fasten',
  'grab',
  'annoyed',
  'sweatdrop',
  'surprised',
  'doubt',
  'thinking',
  'idea',
  'happy',
  'nervous',
] as const);

export type SpriteIntent = typeof SPRITE_INTENTS[number];

export function isSpriteIntent(value: string): value is SpriteIntent {
  return (SPRITE_INTENTS as readonly string[]).includes(value);
}

/**
 * The host's direct control of Flint (`steer`), as the arrow keys and the space bar of the playground: a held walk until `stop-walking`, a
 * jump, a turn, and `rest`, which ends the gesture.
 */
export const FLINT_STEERINGS = Object.freeze(['walk-left', 'walk-right', 'stop-walking', 'jump', 'face-left', 'face-right', 'rest'] as const);

export type FlintSteering = typeof FLINT_STEERINGS[number];

export function isFlintSteering(value: string): value is FlintSteering {
  return (FLINT_STEERINGS as readonly string[]).includes(value);
}

/** A host's cue name, such as `idle` or `agent-is-writing`. */
export type SpriteCue = string;

/** The one cue Flint raises itself: it arrived in a habitat, after a visit or a drop. A suggestion answers it like a host's cue. */
export const ARRIVED_CUE: SpriteCue = 'arrived';

export interface SpriteSuggestion {
  readonly when:    SpriteCue;
  readonly respond: SpriteIntent;
  /** A hint in words that only a brain reads. */
  readonly note?:   string;
}

export interface SpriteContent {
  readonly facts:    Readonly<Record<string, string | number>>;
  /** Text with a maximum length, such as the last lines of a chat; it is untrusted, so it can only change which move Flint makes. */
  readonly excerpt?: string;
}

/** What the copy behaviour copies: the element it stands below (an agent's row), and the gesture intent that shows that agent's state. */
export interface SpriteCopyTarget {
  readonly element: Element;
  /** A gesture intent, such as `type-busy` or `review`; any other intent ends the copy. */
  readonly intent:  SpriteIntent;
}

/** The sprite field one host component declares. A suggestion is not a command: the director selects one. */
export interface SpriteHabitat {
  /** The host's own name for this kind of place, such as `chat` or `agent-panel`. */
  readonly kind:           string;
  /** What this place is, in one sentence. */
  readonly description:    string;
  readonly suggestions:    readonly SpriteSuggestion[];
  /** What the component shows at this time; optional, since it sends conversation text to a brain. */
  readonly contentFor?:    () => SpriteContent;
  /** What a `copy` intent copies here, now; null copies nothing. Flint reads it on each frame while it copies, so keep it cheap. */
  readonly copyTargetFor?: () => SpriteCopyTarget | null;
}

/** What a director knows when it picks the next intent. The habitat is the one Flint lives in; null is its home. */
export interface PerceptionDigest {
  readonly habitatKind:       string | null;
  readonly description:       string | null;
  readonly suggestions:       readonly SpriteSuggestion[];
  /** The cues of this habitat, the most recent last, up to a limit. */
  readonly recentCues:        readonly SpriteCue[];
  /** The cues that arrived since the director was last asked, the most recent last. */
  readonly newCues:           readonly SpriteCue[];
  /** Given only to a brain, never to the rule director, since it can hold conversation text. */
  readonly content:           SpriteContent | null;
  readonly lastIntent:        SpriteIntent | null;
  readonly isAsleep:          boolean;
  /** The kind of the habitat the visit-target policy picks, when it is not where Flint lives; a `visit` intent goes there. */
  readonly visitTargetKind:   string | null;
  /** The habitat Flint lives in names something to copy now; a `copy` intent copies it. */
  readonly copyIsOffered:     boolean;
  /** Since the last cue, click, drag or intent. */
  readonly quietMilliseconds: number;
}

/**
 * The rule director follows the habitat's suggestions; a host's brain is a second director with the same interface. An answer that is not
 * on the fixed list, or a promise that fails, is refused, and the rule director answers that time.
 */
export interface Director {
  readonly nextIntent: (digest: PerceptionDigest) => SpriteIntent | Promise<SpriteIntent>;
}

export interface RegisteredHabitat {
  readonly element: HTMLElement;
  readonly habitat: SpriteHabitat;
}

/**
 * Which habitat Flint visits as "the component the user works in": a built-in strategy, or the host's own choice among the registered
 * habitats (null visits none).
 */
export type VisitTargetPolicy =
  | 'last-focused-or-clicked'
  | 'under-pointer'
  | 'content-changed-last'
  | ((habitats: readonly RegisteredHabitat[]) => RegisteredHabitat | null);
