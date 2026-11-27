/**
 * The list form of `usePresence`: a shown list's items, each with where it stands in its coming and going, for the `data-presence` the
 * holder's stylesheet animates. An arrival is marked until it leaves; a lost item stays in its place, inert, through the leaving animation
 * of the list's leaving children, read from their style as `usePresence` reads one part's, so with no motion it goes at once.
 */
import { useEffect, useState, type RefObject } from 'react';

import { CssDurationUtil } from './CssDurationUtil.ts';
import {
  ListPresenceUtil,
  type KeyedItem,
  type LeavingItem,
  type ListItemPresence,
  type PresentItem
} from './ListPresenceUtil.ts';

/** The baseline of a list whose data is whole at mount: only the mounted list is no arrival. */
const MOUNTED_LIST_BASELINE = 'mounted-list';

const KEY_SEPARATOR = '\n';

const LEAVING_PRESENCE: ListItemPresence = 'leaving';

interface ShownList<Item> {
  readonly keySignature: string;
  readonly items:        readonly KeyedItem<Item>[];
  readonly baselineKey:  string | null;
  readonly arrivedKeys:  ReadonlySet<string>;
}

/** A settled item carries no mark, so a list that never changes renders as it did. */
export function presenceAttributeOf(presence: ListItemPresence): Exclude<ListItemPresence, 'settled'> | undefined {
  return presence === 'settled' ? undefined : presence;
}

function leavingMillisecondsOf(element: Element): number {
  const style = getComputedStyle(element);
  if (style.animationName === '' || style.animationName === 'none') return 0;
  return (CssDurationUtil.millisecondsOf(style.animationDuration) ?? 0) + (CssDurationUtil.millisecondsOf(style.animationDelay) ?? 0);
}

/** The longest leaving animation among the list element's children marked leaving. */
function longestLeaveOf(list: Element | null): number {
  if (list === null) return 0;
  const leavingChildren = [...list.children].filter((child) => child.getAttribute('data-presence') === LEAVING_PRESENCE);
  return Math.max(0, ...leavingChildren.map(leavingMillisecondsOf));
}

/**
 * `list` is the element whose children the items render as. `baselineKey` names the data the list is read from when it arrives after
 * mount, such as a chat's history: the list that comes with a new key is that data's state, so nothing in it arrives and nothing before it
 * leaves, and while the key is `null` nothing arrives or leaves.
 */
export function useListPresence<Item>(
  items: readonly Item[],
  keyOf: (item: Item) => string,
  list: RefObject<Element | null>,
  baselineKey: string | null = MOUNTED_LIST_BASELINE,
): readonly PresentItem<Item>[] {
  const keyedItems = items.map((item) => ({ key: keyOf(item), item }));
  const keySignature = keyedItems.map(({ key }) => key).join(KEY_SEPARATOR);
  const [shownList, setShownList] = useState<ShownList<Item>>(() => ({
    keySignature, items: keyedItems, baselineKey, arrivedKeys: ListPresenceUtil.NO_KEYS
  }));
  const [leavingItems, setLeavingItems] = useState<readonly LeavingItem<Item>[]>([]);
  if (keySignature !== shownList.keySignature || baselineKey !== shownList.baselineKey) {
    const isTheSameData = baselineKey !== null && baselineKey === shownList.baselineKey;
    const currentKeys = new Set(keyedItems.map(({ key }) => key));
    setShownList({
      keySignature,
      items:       keyedItems,
      baselineKey,
      arrivedKeys: isTheSameData ? ListPresenceUtil.arrivedKeysAfter(shownList.arrivedKeys, shownList.items, currentKeys) : ListPresenceUtil.NO_KEYS,
    });
    setLeavingItems(isTheSameData ? [...leavingItems, ...ListPresenceUtil.departedItemsOf(shownList.items, currentKeys)] : []);
  }
  useEffect(() => {
    if (leavingItems.length === 0) return undefined;
    const finish = (): void => setLeavingItems([]);
    const duration = longestLeaveOf(list.current);
    if (duration === 0) {
      finish();
      return undefined;
    }
    const timer = window.setTimeout(finish, duration);
    return () => window.clearTimeout(timer);
  }, [leavingItems, list]);
  return ListPresenceUtil.presentItemsOf(keyedItems, shownList.arrivedKeys, leavingItems);
}
