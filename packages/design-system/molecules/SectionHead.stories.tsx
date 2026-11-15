import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { TextButton }  from '../atoms/TextButton.tsx';
import { SectionHead } from './SectionHead.tsx';

const meta = {
  title:     'Molecules/SectionHead',
  component: SectionHead,
  args:      { title: 'Example items' },
} satisfies Meta<typeof SectionHead>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Counted: Story = { args: { count: 3 } };
export const WithAction: Story = { args: { count: 3, children: <TextButton label="Example action" onPress={fn()} /> } };
export const NestedHeading: Story = { args: { titleElement: 'h3' } };
export const Inline: Story = { args: { count: 3, inline: true, children: <TextButton label="Example action" onPress={fn()} /> } };
export const Heading: Story = { args: { count: 3, look: 'heading', children: <TextButton label="Example action" onPress={fn()} /> } };
