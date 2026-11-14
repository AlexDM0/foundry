import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from '../atoms/Text.tsx';
import { Card } from './Card.tsx';

const meta = {
  title:     'Molecules/Card',
  component: Card,
  args:      { gap: 'eight', children: <Text>Two example editors and one example reviewer are online.</Text> },
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const WithTitle: Story = { args: { title: 'Example agents', titleElement: 'h3' } };
export const OwnTitle: Story = {
  args: {
    children: (
      <>
        <Text typeRole="lead" bold>Example decision</Text>
        <Text muted>Apply the example edits to the example draft?</Text>
      </>
    ),
  },
};
export const Quiet: Story = { args: { quiet: true } };
export const Step: Story = { args: { step: true } };
export const Decision: Story = { args: { decision: true } };
export const Dashed: Story = { args: { dashed: true } };
export const Interactive: Story = { args: { interactive: true } };
export const Selected: Story = { args: { selected: true } };
export const Highlighted: Story = { args: { step: true, highlighted: true } };
export const Grow: Story = { args: { grow: true } };
export const StepRadius: Story = { args: { radius: 'step', interactive: true } };
export const Clipped: Story = { args: { clipped: true } };
export const Washes: Story = { args: { washes: true } };
export const OverriddenPadding: Story = { args: { padding: 'twentyEight' } };
export const RowLayout: Story = { args: { row: true, between: true, children: [<Text key="first">Start</Text>, <Text key="second">End</Text>] } };
