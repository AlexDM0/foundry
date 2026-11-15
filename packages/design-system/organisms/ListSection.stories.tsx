import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Text }        from '../atoms/Text.tsx';
import { TextButton }  from '../atoms/TextButton.tsx';
import { ListSection } from './ListSection.tsx';

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
