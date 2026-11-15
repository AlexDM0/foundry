import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { ThemeCycleButton } from './ThemeCycleButton.tsx';

const meta = {
  title:     'Molecules/ThemeCycleButton',
  component: ThemeCycleButton,
  args:      { choice: 'auto', accessibleName: 'Theme: auto. Switch to light', onCycle: fn() },
} satisfies Meta<typeof ThemeCycleButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Auto: Story = {};
export const Light: Story = { args: { choice: 'light', accessibleName: 'Theme: light. Switch to dark' } };
export const Dark: Story = { args: { choice: 'dark', accessibleName: 'Theme: dark. Switch to auto' } };
