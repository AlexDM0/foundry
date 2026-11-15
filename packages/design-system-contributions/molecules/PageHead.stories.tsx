import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button }              from 'design-system/Button';

import { PageHead } from './PageHead.tsx';

const meta = {
  title:     'Molecules/PageHead',
  component: PageHead,
  args:      { title: 'Overview', lead: 'Everything that waits on you, across every project.' },
} satisfies Meta<typeof PageHead>;

export default meta;

type Story = StoryObj<typeof meta>;

export const TitleAndLead: Story = {};
const FIGURES = [{ value: '12 / 16', label: 'running' }, { value: '3', label: 'waiting', tone: 'accent' }, { value: '4', label: 'landed today' }] as const;

export const WithFigures: Story = { args: { figures: FIGURES } };
export const WithActions: Story = { args: { actions: <Button label="Add a project" emphasis="primary" compact /> } };
export const Nested: Story = { args: { titleElement: 'h2' } };
