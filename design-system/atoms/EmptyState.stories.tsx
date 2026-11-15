import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState }            from 'react';

import { Row }        from '../molecules/Row.tsx';
import { Button }     from './Button.tsx';
import { EmptyState } from './EmptyState.tsx';
import { Text }       from './Text.tsx';
import { View }       from './View.tsx';

/** A list the reader empties: the empty state fades in where the last item left. */
function EmptyingList() {
  const [items, setItems] = useState(['Example first', 'Example second']);
  return (
    <View gap="eight">
      <Row gap="eight">
        <Button label="Remove one" compact disabled={items.length === 0} onPress={() => setItems(items.slice(1))} />
        <Button label="Refill" compact onPress={() => setItems(['Example first', 'Example second'])} />
      </Row>
      {items.length === 0 ? <EmptyState text="No example items yet." /> : items.map((item) => <Text key={item}>{item}</Text>)}
    </View>
  );
}

const meta = {
  title:     'Atoms/EmptyState',
  component: EmptyState,
  args:      { text: 'No example items yet.' },
} satisfies Meta<typeof EmptyState>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithAction: Story = { args: { text: 'Nothing here. ', children: <a href="#example">Example place</a> } };
export const Compact: Story = { args: { compact: true } };
export const AfterTheLastItem: Story = { render: () => <EmptyingList /> };
