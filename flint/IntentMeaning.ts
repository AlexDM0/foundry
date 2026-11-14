/** What each intent of the fixed list asks of Flint: a behaviour of the mind, a gesture in a mood, or an emote. */
import type { SpriteIntent }      from './SpriteHabitat.ts';
import type { EmoteName }         from './emotes/EmoteDefinition.ts';
import type { GestureName, Mood } from './gestures/GestureDefinition.ts';

export type BehaviourIntent = 'wander' | 'visit' | 'copy' | 'sleep';

export type IntentMeaning =
  | { readonly kind: 'behaviour'; readonly behaviour: BehaviourIntent }
  | { readonly kind: 'gesture'; readonly gesture: GestureName; readonly mood: Mood }
  | { readonly kind: 'emote'; readonly emote: EmoteName };

const INTENT_MEANINGS: Readonly<Record<SpriteIntent, IntentMeaning>> = Object.freeze({
  'wander':       { kind: 'behaviour', behaviour: 'wander' },
  'visit':        { kind: 'behaviour', behaviour: 'visit' },
  'copy':         { kind: 'behaviour', behaviour: 'copy' },
  'sleep':        { kind: 'behaviour', behaviour: 'sleep' },
  'wave':         { kind: 'gesture', gesture: 'wave', mood: 'normal' },
  'point':        { kind: 'gesture', gesture: 'point', mood: 'normal' },
  'type':         { kind: 'gesture', gesture: 'type', mood: 'normal' },
  'type-busy':    { kind: 'gesture', gesture: 'type', mood: 'busy' },
  'type-angry':   { kind: 'gesture', gesture: 'type', mood: 'angry' },
  'review':       { kind: 'gesture', gesture: 'review', mood: 'normal' },
  'review-busy':  { kind: 'gesture', gesture: 'review', mood: 'busy' },
  'review-angry': { kind: 'gesture', gesture: 'review', mood: 'angry' },
  'research':     { kind: 'gesture', gesture: 'research', mood: 'normal' },
  'make-ticket':  { kind: 'gesture', gesture: 'make-ticket', mood: 'normal' },
  'merge':        { kind: 'gesture', gesture: 'merge', mood: 'normal' },
  'fasten':       { kind: 'gesture', gesture: 'fasten', mood: 'normal' },
  'grab':         { kind: 'gesture', gesture: 'grab', mood: 'normal' },
  'annoyed':      { kind: 'emote', emote: 'annoyed' },
  'sweatdrop':    { kind: 'emote', emote: 'sweatdrop' },
  'surprised':    { kind: 'emote', emote: 'surprised' },
  'doubt':        { kind: 'emote', emote: 'doubt' },
  'thinking':     { kind: 'emote', emote: 'thinking' },
  'idea':         { kind: 'emote', emote: 'idea' },
  'happy':        { kind: 'emote', emote: 'happy' },
  'nervous':      { kind: 'emote', emote: 'nervous' },
});

export function intentMeaningOf(intent: SpriteIntent): IntentMeaning {
  return INTENT_MEANINGS[intent];
}
