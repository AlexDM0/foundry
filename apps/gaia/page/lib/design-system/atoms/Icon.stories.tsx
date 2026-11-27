import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode }      from 'react';

import { Icon, type IconName } from './Icon.tsx';
import { Text }                from './Text.tsx';
import { View }                from './View.tsx';

const ICON_NAMES: readonly IconName[] = [
  'hammer',
  'magnifier',
  'inbox',
  'lifebuoy',
  'flow',
  'merge',
  'cycle',
  'document',
  'dot',
  'paper-plane',
  'narrowing-lines',
  'arrow-out-of-square',
  'caret-down',
  'chevron-down',
  'chevron-up',
  'check',
  'plus',
  'exclamation-triangle',
  'stopwatch',
];

/** An icon fills its holder, so each story holds it in a box of a size a host gives it. */
function IconHolder({ children }: { readonly children: ReactNode }) {
  return <span style={{ display: 'inline-flex', width: 24, height: 24 }}>{children}</span>;
}

const meta = {
  title:     'Atoms/Icon',
  component: Icon,
  args:      { name: 'hammer', label: 'Example build' },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Named: Story = { render: (args) => <IconHolder><Icon {...args} /></IconHolder> };
export const Decorative: Story = { args: { label: null }, render: (args) => <IconHolder><Icon {...args} /></IconHolder> };

export const EveryIcon: Story = {
  render: () => (
    <View row wrap gap="sixteen">
      {ICON_NAMES.map((name) => (
        <View key={name} centerX gap="four">
          <IconHolder><Icon name={name} label={name} /></IconHolder>
          <Text typeRole="small" muted>{name}</Text>
        </View>
      ))}
    </View>
  ),
};

/** A holder sets the stroke through `--icon-stroke-width`: the check at 12px with a 2px line, as a toast and a question card hold it. */
export const HoldersStroke: Story = {
  args:   { name: 'check', label: 'Example done' },
  render: (args) => (
    <span style={{
      display: 'inline-flex', width: 12, height: 12, ['--icon-stroke-width' as string]: '2.67'
    }}><Icon {...args} /></span>
  ),
};
