/**
 * A shown list's items with where each stands in its coming and going (`ItemPresenceUtil`), for the `data-presence` its stylesheet
 * animates: an arrival rises in, and a lost item stays in its place, inert, for `LEAVING_MILLISECONDS` while it fades out.
 */
import { useEffect, useState } from 'react';

import {
  ItemPresenceUtil,
  type ItemPresence,
  type KeyedItem,
  type LeavingItem,
  type PresentItem
} from '../utils/ItemPresenceUtil.ts';
import { useBoardClock } from './BoardClock.ts';

/** As long as `--motion-leave` in the board's tokens; reduced motion hides a leaving item at once. */
export const LEAVING_MILLISECONDS = 220;

/** The baseline of a list whose data is whole at mount: only the mounted list is no arrival. */
const MOUNTED_LIST_BASELINE = 'mounted-list';

const KEY_SEPARATOR = '\n';

interface ShownList<Item> {
  readonly keySignature: string;
  readonly items:        readonly KeyedItem<Item>[];
  readonly baselineKey:  string | null;
  readonly arrivedKeys:  ReadonlySet<string>;
}

/** A settled item carries no mark, so a list that never changes renders as it did. */
export function presenceAttributeOf(presence: ItemPresence): Exclude<ItemPresence, 'settled'> | undefined {
  return presence === 'settled' ? undefined : presence;
}

/**
 * `baselineKey` names the data the list is read from when it arrives after mount, as `useCueOnChange` does, such as a chat's history:
 * the list that comes with a new key is that data's state, so nothing in it arrives and nothing before it leaves, and while the key is
 * `null` nothing arrives or leaves.
 */
export function useItemPresence<Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
  baselineKey: string | null = MOUNTED_LIST_BASELINE,
): readonly PresentItem<Item>[] {
  const clock = useBoardClock();
  const keyedItems = items.map((item) => ({ key: keyOf(item), item }));
  const keySignature = keyedItems.map(({ key }) => key).join(KEY_SEPARATOR);
  const [shownList, setShownList] = useState<ShownList<Item>>(() => ({
    keySignature, items: keyedItems, baselineKey, arrivedKeys: ItemPresenceUtil.NO_KEYS
  }));
  const [leavingItems, setLeavingItems] = useState<readonly LeavingItem<Item>[]>([]);
  if (keySignature !== shownList.keySignature || baselineKey !== shownList.baselineKey) {
    const isTheSameData = baselineKey !== null && baselineKey === shownList.baselineKey;
    const currentKeys = new Set(keyedItems.map(({ key }) => key));
    setShownList({
      keySignature,
      items:       keyedItems,
      baselineKey,
      arrivedKeys: isTheSameData ? ItemPresenceUtil.arrivedKeysAfter(shownList.arrivedKeys, shownList.items, currentKeys) : ItemPresenceUtil.NO_KEYS,
    });
    setLeavingItems(isTheSameData ? [...leavingItems, ...ItemPresenceUtil.departedItemsOf(shownList.items, currentKeys)] : []);
  }
  useEffect(() => (leavingItems.length === 0 ? undefined : clock.after(LEAVING_MILLISECONDS, () => setLeavingItems([]))), [leavingItems, clock]);
  return ItemPresenceUtil.presentItemsOf(keyedItems, shownList.arrivedKeys, leavingItems);
}
