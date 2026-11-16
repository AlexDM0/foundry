import type { Meta, StoryObj } from '@storybook/react-vite';

import { Text } from './Text.tsx';

const meta = {
  title:     'Atoms/Text',
  component: Text,
  args:      { children: 'Example Agency ships the example build today.' },
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Body: Story = {};
export const Display: Story = { args: { typeRole: 'display', element: 'h1', children: 'Example workflow' } };
export const Phase: Story = { args: { typeRole: 'phase', children: 'Example phase' } };
export const Page: Story = { args: { typeRole: 'page', element: 'h2', children: 'Example page' } };
export const Section: Story = { args: { typeRole: 'section', element: 'h3', children: 'Example section' } };
export const Title: Story = { args: { typeRole: 'title', element: 'h3', children: 'Example title' } };
export const Lead: Story = { args: { typeRole: 'lead', children: 'An example lead that opens a section.' } };
export const Tab: Story = { args: { typeRole: 'tab', children: 'Example tab' } };
export const Small: Story = { args: { typeRole: 'small', children: 'Example small print' } };
export const Pill: Story = { args: { typeRole: 'pill', children: 'Example pill' } };
export const Micro: Story = { args: { typeRole: 'micro', children: 'EXAMPLE MICRO' } };
export const Bold: Story = { args: { bold: true } };
export const Muted: Story = { args: { muted: true } };
export const Subtle: Story = { args: { subtle: true } };
export const Mono: Story = { args: { mono: true, children: 'example-build --watch' } };
export const Struck: Story = { args: { struck: true } };
export const Centered: Story = { args: { centered: true } };
export const Margins: Story = { args: { marginTop: 'sixteen', marginBottom: 'twentyFour' } };
