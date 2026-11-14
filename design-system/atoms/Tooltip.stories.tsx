import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tooltip } from './Tooltip.tsx';

const meta = {
  title:     'Atoms/Tooltip',
  component: Tooltip,
  args:      {
    text:      'An example explanation.',
    placement: 'above',
    children:  <button type="button">Example trigger</button>,
  },
  parameters: { layout: 'centered' },
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Above: Story = {};
export const Below: Story = { args: { placement: 'below' } };
export const WithTitle: Story = { args: { title: 'Example title' } };
