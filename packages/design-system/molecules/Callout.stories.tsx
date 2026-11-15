import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn }                  from 'storybook/test';

import { Button }  from '../atoms/Button.tsx';
import { Text }    from '../atoms/Text.tsx';
import { Callout } from './Callout.tsx';

const meta = {
  title:     'Molecules/Callout',
  component: Callout,
  args:      { tone: 'state', stateTone: 'accent', children: <Text>An example note about the example step.</Text> },
} satisfies Meta<typeof Callout>;

export default meta;

type Story = StoryObj<typeof meta>;

export const State: Story = {};
export const Warn: Story = { args: { tone: 'warn' } };
export const WarnTinted: Story = { args: { tone: 'warn', tinted: true } };
export const ErrorTone: Story = { args: { tone: 'error' } };
export const Neutral: Story = { args: { tone: 'neutral' } };
export const NeutralDashed: Story = { args: { tone: 'neutral', dashed: true } };
export const WithActions: Story = {
  args: {
    tone: 'warn', tinted: true, title: 'Example title', actions: <Button label="Example action" compact onPress={fn()} />
  },
};
export const WithTitle: Story = { args: { title: 'Example title' } };
export const NestedHeading: Story = { args: { title: 'Example title', titleElement: 'h4' } };
