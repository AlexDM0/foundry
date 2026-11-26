/**
 * The level a pipeline screen shows in monorepo mode, pure: the forge, or one entity. The level is held in the route, ahead of the screen's
 * own item: `#pipeline/forge/<item>` and `#pipeline/entity/<key>/<item>`, so every screen opens at the level the owner was on. An entity
 * takes two segments because a key may be any word, `forge` too. An item with no level is a single-mode route and reads as it always did.
 * A draft field belongs to the entity its `entity:<key>` scope names, and every other field to the forge.
 */
import type { BoardRoute } from '../../../../shared/BoardRouter.ts';

/** The forge's own level: its kind is a value of the route and of this union, never the program's name. */
export interface ForgeLevel {
  readonly kind: 'forge';
}

export type PipelineLevel = ForgeLevel | { readonly kind: 'entity'; readonly key: string };

/** A route item read as its level and the screen's own item under it; `level` is `null` on a single-mode route. */
export interface LeveledItem {
  readonly level: PipelineLevel | null;
  readonly item:  string | null;
}

export const FORGE_LEVEL: PipelineLevel = Object.freeze({ kind: 'forge' });

const FORGE_SEGMENT = 'forge';

const ENTITY_SEGMENT = 'entity';

const ENTITY_FIELD_PREFIX = 'entity:';

/** The word the rail, the breadcrumb and the chat's head name the forge level by. */
const FORGE_LEVEL_NAME = 'Forge';

function isForgeLevel(level: PipelineLevel): level is ForgeLevel {
  return level.kind === 'forge';
}

function entityLevelOf(key: string): PipelineLevel {
  return { kind: 'entity', key };
}

function itemOfSegments(segments: readonly string[]): string | null {
  return segments.length === 0 ? null : segments.join('/');
}

function leveledItemOf(item: string | null): LeveledItem {
  if (item === null) return { level: null, item: null };
  const [first, second, ...rest] = item.split('/');
  if (first === FORGE_SEGMENT) return { level: FORGE_LEVEL, item: itemOfSegments(second === undefined ? [] : [second, ...rest]) };
  if (first === ENTITY_SEGMENT && second !== undefined && second !== '') return { level: entityLevelOf(second), item: itemOfSegments(rest) };
  return { level: null, item };
}

/** The screen's own item under the route's level, as single mode would route it. */
function itemWithinLevelOf(item: string | null): string | null {
  return leveledItemOf(item).item;
}

function itemAtLevel(level: PipelineLevel, item: string | null): string {
  const levelItem = level.kind === 'forge' ? FORGE_SEGMENT : `${ENTITY_SEGMENT}/${level.key}`;
  return item === null ? levelItem : `${levelItem}/${item}`;
}

function routeAtLevel(level: PipelineLevel, item: string | null): BoardRoute {
  return { tab: 'pipeline', item: itemAtLevel(level, item) };
}

/** The same screen at another level: a rail row and a breadcrumb keep the screen and change only the level. */
function routeMovedTo(route: BoardRoute, level: PipelineLevel): BoardRoute {
  return routeAtLevel(level, itemWithinLevelOf(route.item));
}

function levelsAreEqual(first: PipelineLevel, second: PipelineLevel): boolean {
  if (first.kind === 'forge' || second.kind === 'forge') return first.kind === second.kind;
  return first.key === second.key;
}

function levelNameOf(level: PipelineLevel): string {
  return level.kind === 'forge' ? FORGE_LEVEL_NAME : level.key;
}

/** `entity:web/gate:lint` and `entity:web` are web's; `approval:merge` and every unscoped field are the forge's. */
function levelOfField(field: string): PipelineLevel {
  if (!field.startsWith(ENTITY_FIELD_PREFIX)) return FORGE_LEVEL;
  const scope = field.slice(ENTITY_FIELD_PREFIX.length);
  const separatorIndex = scope.indexOf('/');
  return entityLevelOf(separatorIndex === -1 ? scope : scope.slice(0, separatorIndex));
}

/** The field inside its entity, `gate:lint` for `entity:web/gate:lint`; `null` for an entity's definition; a forge field as it is. */
function fieldWithinEntityOf(field: string): string | null {
  if (!field.startsWith(ENTITY_FIELD_PREFIX)) return field;
  const separatorIndex = field.indexOf('/');
  return separatorIndex === -1 ? null : field.slice(separatorIndex + 1);
}

/** An entity's summary as the first sentence of a page's lead: research words it as a phrase, "Next.js storefront", so it gains its stop. */
function summarySentenceOf(summary: string): string {
  const trimmed = summary.trim();
  return /[.!?]$/u.test(trimmed) ? trimmed : `${trimmed}.`;
}

export const PipelineLevelModel = Object.freeze({
  isForgeLevel,
  entityLevelOf,
  leveledItemOf,
  itemWithinLevelOf,
  itemAtLevel,
  routeAtLevel,
  routeMovedTo,
  levelsAreEqual,
  levelNameOf,
  levelOfField,
  fieldWithinEntityOf,
  summarySentenceOf,
});
