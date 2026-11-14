import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Button } from '../atoms/Button.tsx';
import { Banner } from './Banner.tsx';

const meta = {
  title:     'Molecules/Banner',
  component: Banner,
  args:      { tone: 'warn', text: 'The example stream is down; the page shows the last example state.' },
} satisfies Meta<typeof Banner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Warn: Story = {};
export const ErrorTone: Story = { args: { tone: 'error', role: 'alert' } };
export const Quiet: Story = { args: { tone: 'quiet', role: 'status' } };
export const WithLead: Story = { args: { lead: 'Example lead.' } };
export const WithAction: Story = { args: { action: <Button label="Example retry" compact onPress={fn()} /> } };
