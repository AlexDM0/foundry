import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { TextButton } from '../atoms/TextButton.tsx';
import { ListedFile } from './ListedFile.tsx';

const meta = {
  title:     'Molecules/ListedFile',
  component: ListedFile,
  args:      {
    name: 'example-brief.md', roleText: 'Example brief', removeLabel: 'Remove example-brief.md', onRemove: fn()
  },
} satisfies Meta<typeof ListedFile>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Openable: Story = { args: { action: <TextButton label="Open" href="#example/brief" /> } };
export const Changed: Story = { args: { change: 'changed' } };
export const New: Story = { args: { change: 'new' } };
export const Removed: Story = { args: { change: 'removed' } };
export const Ruled: Story = { args: { ruled: true, action: <TextButton label="Open" href="#example/brief" /> } };
