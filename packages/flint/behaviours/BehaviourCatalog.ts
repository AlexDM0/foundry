/**
 * Every behaviour; the mind reaches a behaviour only through this catalog, as it reaches a gesture through the gesture catalog. The
 * behaviour names and the behaviour intents of the fixed intent list are derived from it, in this order, so an intent's name is written
 * only in its behaviour's definition.
 */
import type { BehaviourState }      from '../mind/MindState.ts';
import type { BehaviourDefinition } from './BehaviourDefinition.ts';
import { CARRIED_BEHAVIOUR }        from './carried/CarriedBehaviour.ts';
import { CHASE_BUG_BEHAVIOUR }      from './chase-bug/ChaseBugBehaviour.ts';
import { COPY_BEHAVIOUR }           from './copy/CopyBehaviour.ts';
import { CURSOR_PLAY_BEHAVIOUR }    from './cursor-play/CursorPlayBehaviour.ts';
import { LANDING_BEHAVIOUR }        from './landing/LandingBehaviour.ts';
import { LAY_BAR_ALONG_BEHAVIOUR }  from './lay-bar-along/LayBarAlongBehaviour.ts';
import { SLEEP_BEHAVIOUR }          from './sleep/SleepBehaviour.ts';
import { STRANDED_BEHAVIOUR }       from './stranded/StrandedBehaviour.ts';
import { VISIT_BEHAVIOUR }          from './visit/VisitBehaviour.ts';
import { WANDER_BEHAVIOUR }         from './wander/WanderBehaviour.ts';

export const BEHAVIOUR_CATALOG = Object.freeze([
  WANDER_BEHAVIOUR,
  VISIT_BEHAVIOUR,
  COPY_BEHAVIOUR,
  SLEEP_BEHAVIOUR,
  CURSOR_PLAY_BEHAVIOUR,
  CARRIED_BEHAVIOUR,
  LANDING_BEHAVIOUR,
  STRANDED_BEHAVIOUR,
  CHASE_BUG_BEHAVIOUR,
  LAY_BAR_ALONG_BEHAVIOUR,
] as const);

type RegisteredBehaviour = typeof BEHAVIOUR_CATALOG[number];

export type BehaviourName = RegisteredBehaviour['name'];

export type BehaviourIntent = RegisteredBehaviour['intents'][number];

/** A behaviour as the mind runs it: any registered behaviour, on the state the mind keeps. */
export type CatalogBehaviour = BehaviourDefinition<BehaviourName, string, BehaviourState>;

const CATALOG: readonly CatalogBehaviour[] = BEHAVIOUR_CATALOG;

/** Every behaviour intent, in the catalog's order. */
export const BEHAVIOUR_INTENTS: readonly BehaviourIntent[] = Object.freeze(BEHAVIOUR_CATALOG.flatMap(
  (definition: RegisteredBehaviour): readonly BehaviourIntent[] => definition.intents,
));

/** The behaviour of a running state, by its name; a name the catalog lacks is a defect, since only a behaviour sets it. */
export function behaviourDefinitionOf(name: string): CatalogBehaviour {
  const definition = CATALOG.find((candidate) => candidate.name === name);
  if (definition === undefined) throw new RangeError(`the behaviour catalog has no ${name}`);
  return definition;
}

/** The behaviour an intent starts, or null when the intent is a gesture's or an emote's. */
export function behaviourOfIntent(intent: string): CatalogBehaviour | null {
  return CATALOG.find((definition) => definition.intents.includes(intent)) ?? null;
}

/** The behaviour of a role: the rest, or what a drag or a click starts. Each role is one behaviour's, which the catalog's spec holds. */
export function behaviourOfRole(role: 'rest' | 'drag' | 'click'): CatalogBehaviour {
  const definition = CATALOG.find((candidate) => candidate.role === role);
  if (definition === undefined) throw new RangeError(`no behaviour of the catalog has the role ${role}`);
  return definition;
}

/** The state of the rest at a moment: where every behaviour ends. */
export function restingBehaviourAt(elapsedMilliseconds: number): BehaviourState {
  const { atRest } = behaviourOfRole('rest');
  if (atRest === null) throw new RangeError('the rest of the behaviour catalog gives no state at rest');
  return atRest(elapsedMilliseconds);
}
