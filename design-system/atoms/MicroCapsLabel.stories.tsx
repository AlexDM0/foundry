import type { Meta, StoryObj } from '@storybook/react-vite';

import { MicroCapsLabel } from './MicroCapsLabel.tsx';

const meta = {
  title:     'Atoms/MicroCapsLabel',
  component: MicroCapsLabel,
  args:      { text: 'Example section' },
} satisfies Meta<typeof MicroCapsLabel>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Muted: Story = { args: { tone: 'muted' } };
export const State: Story = { args: { tone: 'state' } };
export const ErrorTone: Story = { args: { tone: 'error' } };
export const Heading: Story = { args: { element: 'h3' } };
