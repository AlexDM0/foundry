import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { FailedAction } from './FailedAction.tsx';

const meta = {
  title:     'Molecules/FailedAction',
  component: FailedAction,
  args:      { sentence: 'The disk is full.' },
} satisfies Meta<typeof FailedAction>;

export default meta;

type Story = StoryObj<typeof meta>;

export const SentenceOnly: Story = {};
export const WithLeadAndCode: Story = { args: { lead: 'Saving failed: ', code: 'disk-full' } };
export const WithRetryAndDismiss: Story = {
  args: {
    lead: 'Saving failed: ', code: 'disk-full', retryLabel: 'Try again', onRetry: fn(), dismissLabel: 'Dismiss this failure', onDismiss: fn()
  },
};
export const DismissOnly: Story = { args: { dismissLabel: 'Dismiss this failure', onDismiss: fn() } };
