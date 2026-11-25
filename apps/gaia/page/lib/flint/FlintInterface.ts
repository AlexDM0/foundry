/** The Flint library's interface: the only module code outside the library imports. Each export is named one by one. */
export { FlintRefusal, createFlint } from './CreateFlint.ts';
export type { AttendVerdict, FlintHandle, FlintOptions, FlintRefusalReason, FlintStorage, PerformVerdict, SteerVerdict } from './CreateFlint.ts';
export {
  ARRIVED_CUE,
  BEHAVIOUR_INTENTS,
  FLINT_CONTRACT_VERSIONS,
  FLINT_OVERLAY_ATTRIBUTE,
  FLINT_STEERINGS,
  SPRITE_ATTENDANTS,
  SPRITE_INTENTS,
  isFlintSteering,
  isSpriteAttendant,
  isSpriteIntent
} from './SpriteHabitat.ts';
export type {
  BehaviourIntent,
  Director,
  FlintConfinement,
  FlintSteering,
  PerceptionDigest,
  RegisteredHabitat,
  SpriteAttendant,
  SpriteContent,
  SpriteCopyTarget,
  SpriteCue,
  SpriteHabitat,
  SpriteIntent,
  SpriteSuggestion,
  VisitTargetPolicy
} from './SpriteHabitat.ts';
export { intentExtentOf } from './IntentMeaning.ts';
export type { DrawnExtent } from './SpriteGeometry.ts';
export { attendantExtentOf } from './attendants/AttendantRoster.ts';
export { Flint } from './react/Flint.tsx';
export type { FlintProperties } from './react/Flint.tsx';
export { useFlintHabitat } from './react/UseFlintHabitat.ts';
export { useFlintPerform } from './react/UseFlintPerform.ts';
