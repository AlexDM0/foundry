import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Button } from '../atoms/Button.tsx';
import { Text }   from '../atoms/Text.tsx';
import { Pane }   from './Pane.tsx';

const meta = {
  title:     'Organisms/Pane',
  component: Pane,
  args:      {
    label: 'Example pane', title: 'Example agents', body: 'padded', children: <Text>Example content of the pane.</Text>
  },
} satisfies Meta<typeof Pane>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Padded: Story = {};
export const Flush: Story = { args: { body: 'flush' } };
export const Aside: Story = { args: { element: 'aside' } };
export const FullHead: Story = {
  args: {
    titleMark: 'EX-101',
    subtitle:  'Example subtitle',
    countText: '3 running',
    headEnd:   <Button label="Example" compact onPress={fn()} />,
  },
};
export const WithFoot: Story = { args: { foot: <Text typeRole="small" muted>Example foot</Text> } };
export const NestedHeading: Story = { args: { titleElement: 'h3' } };
