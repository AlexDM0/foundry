import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from './Text.tsx';
import { View } from './View.tsx';

const children = (
  <>
    <Text>First example line</Text>
    <Text>Second example line</Text>
    <Text>Third example line</Text>
  </>
);

const meta = {
  title:     'Atoms/View',
  component: View,
  args:      { gap: 'eight', children },
} satisfies Meta<typeof View>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Column: Story = {};
export const RowDirection: Story = { args: { row: true } };
export const Centered: Story = { args: { centered: true, padding: 'twentyFour' } };
export const CenterX: Story = { args: { centerX: true } };
export const CenterY: Story = { args: { row: true, centerY: true } };
export const Between: Story = { args: { row: true, between: true } };
export const Wrap: Story = { args: { row: true, wrap: true, gap: 'twentyEight' } };
export const Divider: Story = { args: { divider: true } };
export const Grow: Story = {
  args:   { row: true },
  render: (args) => (
    <View {...args}>
      <View grow><Text>Takes the room left</Text></View>
      <Text>Its own width</Text>
    </View>
  ),
};
export const Padding: Story = { args: { padding: 'sixteen', paddingTop: 'four' } };
export const PaddingAxes: Story = { args: { paddingHorizontal: 'twentyFour', paddingVertical: 'four' } };
export const Margin: Story = { args: { margin: 'sixteen', marginBottom: 'twentyEight' } };
export const MarginAxes: Story = { args: { marginHorizontal: 'twentyFour', marginVertical: 'eight' } };
export const NoGap: Story = { args: { gap: 'none' } };
