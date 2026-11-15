/**
 * Where each item of a shown list stands in its coming and going: an item the list gained after its data arrived is arriving until it
 * leaves, an item the list lost is leaving from the place it held, and every other item is settled.
 */

export type ItemPresence = 'settled' | 'arriving' | 'leaving';

export interface KeyedItem<Item> {
  readonly key:  string;
  readonly item: Item;
}

export interface PresentItem<Item> extends KeyedItem<Item> {
  readonly presence: ItemPresence;
}

/** An item the list lost, with its place in the list that last held it. */
export interface LeavingItem<Item> extends KeyedItem<Item> {
  readonly position: number;
}

const NO_KEYS: ReadonlySet<string> = new Set();

/** The arrivals that stayed, and every key the current list holds that the previous one did not. */
function arrivedKeysAfter<Item>(arrivedKeys: ReadonlySet<string>, previousItems: readonly KeyedItem<Item>[], currentKeys: ReadonlySet<string>): ReadonlySet<string> {
  const previousKeys = new Set(previousItems.map(({ key }) => key));
  const arrived = new Set([...currentKeys].filter((key) => arrivedKeys.has(key) || !previousKeys.has(key)));
  return arrived.size === 0 ? NO_KEYS : arrived;
}

function departedItemsOf<Item>(previousItems: readonly KeyedItem<Item>[], currentKeys: ReadonlySet<string>): LeavingItem<Item>[] {
  return previousItems.flatMap(({ key, item }, position) => (currentKeys.has(key) ? [] : [{ key, item, position }]));
}

/** The current items in order, each leaving item put back at its old place; one that came back is current, not leaving. */
function presentItemsOf<Item>(
  currentItems: readonly KeyedItem<Item>[],
  arrivedKeys: ReadonlySet<string>,
  leavingItems: readonly LeavingItem<Item>[],
): PresentItem<Item>[] {
  const presentItems: PresentItem<Item>[] = currentItems.map(({ key, item }) => ({ key, item, presence: arrivedKeys.has(key) ? 'arriving' : 'settled' }));
  const currentKeys = new Set(currentItems.map(({ key }) => key));
  const stillLeaving = leavingItems.filter(({ key }) => !currentKeys.has(key)).toSorted((a, b) => a.position - b.position);
  for (const { key, item, position } of stillLeaving) {
    presentItems.splice(Math.min(position, presentItems.length), 0, { key, item, presence: 'leaving' });
  }
  return presentItems;
}

export const ItemPresenceUtil = Object.freeze({
  arrivedKeysAfter, departedItemsOf, presentItemsOf, NO_KEYS
});
