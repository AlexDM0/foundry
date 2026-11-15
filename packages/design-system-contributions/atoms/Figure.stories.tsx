import type { Meta, StoryObj } from '@storybook/react-vite';
import { Row }                 from 'design-system/Row';

import { Figure } from './Figure.tsx';

const meta = {
  title:     'Atoms/Figure',
  component: Figure,
  args:      { value: '12 / 16', label: 'agents running' },
} satisfies Meta<typeof Figure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Stacked: Story = {};
export const Accent: Story = { args: { value: '3', label: 'waiting', tone: 'accent' } };
export const Inline: Story = { args: { form: 'inline' } };
export const InlineRow: Story = {
  render: () => (
    <Row>
      <Figure value="12" label="running" form="inline" />
      <Figure value="3" label="waiting" form="inline" tone="accent" />
      <Figure value="4" label="landed" form="inline" />
    </Row>
  ),
};
