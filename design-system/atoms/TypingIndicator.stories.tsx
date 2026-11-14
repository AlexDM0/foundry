import type { Meta, StoryObj } from '@storybook/react-vite';

import { TypingIndicator } from './TypingIndicator.tsx';

const meta = {
  title:     'Atoms/TypingIndicator',
  component: TypingIndicator,
  args:      { text: 'Example writes', accessibleName: 'Example is writing' },
} satisfies Meta<typeof TypingIndicator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Typing: Story = {};
