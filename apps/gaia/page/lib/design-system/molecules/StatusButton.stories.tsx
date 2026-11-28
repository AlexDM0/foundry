import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { StatusButton } from './StatusButton.tsx';

const meta = {
  title:     'Molecules/StatusButton',
  component: StatusButton,
  args:      { label: 'Example done', glyph: 'done', onPress: fn() },
} satisfies Meta<typeof StatusButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Done: Story = {};
export const Again: Story = { args: { label: 'Example again', glyph: 'again' } };
export const BusyQuiet: Story = { args: { label: 'Example under way', glyph: 'busy', busy: true } };
export const Fetch: Story = {
  args: {
    label: 'Example fetch', glyph: 'fetch', emphasis: 'primary', count: '3', accessibleName: 'Example fetch, 3 waiting'
  }
};
export const BusyPrimary: Story = {
  args: {
    label: 'Example under way', glyph: 'busy', emphasis: 'primary', busy: true
  }
};
export const Restart: Story = { args: { label: 'Example restart', glyph: 'restart', emphasis: 'primary' } };
export const Disabled: Story = { args: { label: 'Example restart', glyph: 'restart', disabled: true } };
