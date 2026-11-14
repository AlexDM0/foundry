import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from '../atoms/Text.tsx';
import { Row }  from './Row.tsx';

const meta = {
  title:     'Molecules/Row',
  component: Row,
  args:      {
    gap:      'twelve',
    children: (
      <>
        <Text typeRole="title">Example title</Text>
        <Text typeRole="small" muted>Example note</Text>
      </>
    ),
  },
} satisfies Meta<typeof Row>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Start: Story = {};
export const Between: Story = { args: { between: true, centerY: true } };
export const Centered: Story = { args: { centered: true, padding: 'twentyFour' } };
export const CenterX: Story = { args: { centerX: true } };
export const CenterY: Story = { args: { centerY: true } };
export const Wrap: Story = { args: { wrap: true } };
export const Divider: Story = { args: { divider: true } };
export const Padding: Story = { args: { paddingHorizontal: 'sixteen', paddingVertical: 'eight' } };
export const Margin: Story = { args: { marginTop: 'twentyFour', marginLeft: 'sixteen' } };
