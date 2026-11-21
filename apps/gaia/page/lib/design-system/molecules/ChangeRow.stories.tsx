import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { TextButton } from '../atoms/TextButton.tsx';
import { ChangeRow }  from './ChangeRow.tsx';

const meta = {
  title:     'Molecules/ChangeRow',
  component: ChangeRow,
  args:      {
    change: 'changed', title: 'Example limit', location: 'Example step', density: 'card'
  },
} satisfies Meta<typeof ChangeRow>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Changed: Story = { args: { before: '2', after: '4' } };
export const New: Story = { args: { change: 'new', after: 'Example check' } };
export const Removed: Story = { args: { change: 'removed', before: 'Example check' } };
export const RowDensity: Story = { args: { density: 'row', before: '2', after: '4' } };
export const RemovedRow: Story = { args: { density: 'row', change: 'removed', before: 'Example check' } };
export const WithNote: Story = { args: { note: 'An example reason for the change.' } };
export const WithActions: Story = { args: { actions: <TextButton label="Example undo" onPress={fn()} /> } };
