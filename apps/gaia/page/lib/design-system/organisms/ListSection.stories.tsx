import type { Meta, StoryObj } from '@storybook/react-vite';
import { useRef, useState }    from 'react';
import { fn }                  from 'storybook/test';

import { Text }                                 from '../atoms/Text.tsx';
import { TextButton }                           from '../atoms/TextButton.tsx';
import { presenceAttributeOf, useListPresence } from '../utils/ListPresence.ts';
import { ListSection }                          from './ListSection.tsx';

const EXAMPLE_ITEMS: readonly string[] = ['First example item', 'Second example item', 'Third example item'];

const meta = {
  title:     'Organisms/ListSection',
  component: ListSection<string>,
  args:      {
    label:      'Example section',
    title:      'Example items',
    count:      EXAMPLE_ITEMS.length,
    emptyText:  'No example items yet.',
    items:      EXAMPLE_ITEMS,
    keyOf:      (item) => item,
    renderItem: (item) => <Text>{item}</Text>,
  },
} satisfies Meta<typeof ListSection<string>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const WithItems: Story = {};
export const Empty: Story = { args: { items: [], count: 0 } };
export const WithHeadEnd: Story = { args: { headEnd: <TextButton label="Example action" onPress={fn()} /> } };
export const NestedHeading: Story = { args: { titleElement: 'h3' } };

/** Items that come and go through `useListPresence`, its list element handed over by `listRef`: an arrival and a leaving item are marked. */
function ComingAndGoingItems() {
  const [items, setItems] = useState<readonly string[]>(EXAMPLE_ITEMS);
  const list = useRef<HTMLUListElement>(null);
  const presentItems = useListPresence(items, (item) => item, list);
  return (
    <ListSection
      label="Example section"
      title="Example items"
      count={items.length}
      headEnd={(
        <>
          <TextButton label="Add an item" onPress={() => setItems([...items, `Example item ${items.length + 1}`])} />
          <TextButton label="Remove the first" onPress={() => setItems(items.slice(1))} />
        </>
      )}
      emptyText="No example items yet."
      items={presentItems}
      keyOf={({ key }) => key}
      renderItem={({ item, presence }) => <li data-presence={presenceAttributeOf(presence)}><Text>{`${item} (${presence})`}</Text></li>}
      listRef={list}
    />
  );
}

export const WithListPresence: Story = { render: () => <ComingAndGoingItems /> };
