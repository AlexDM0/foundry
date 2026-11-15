import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text }        from '../atoms/Text.tsx';
import { TitledBlock } from './TitledBlock.tsx';

const meta = {
  title:     'Molecules/TitledBlock',
  component: TitledBlock,
  args:      { title: 'Example block', children: <Text>Example content of the block.</Text> },
} satisfies Meta<typeof TitledBlock>;

export default meta;

type Story = StoryObj<typeof meta>;

export const NoRule: Story = {};
export const RuleAbove: Story = { args: { rule: 'above' } };
export const RuleBetween: Story = { args: { rule: 'between' } };
export const NestedHeading: Story = { args: { titleElement: 'h4' } };
export const Label: Story = { args: { look: 'label' } };
