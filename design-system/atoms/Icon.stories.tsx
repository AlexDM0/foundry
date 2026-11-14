import type { Meta, StoryObj } from '@storybook/react-vite';

import { Icon, type IconName } from './Icon.tsx';
import { View }                from './View.tsx';

const ICON_NAMES: readonly IconName[] = ['hammer', 'magnifier', 'inbox', 'lifebuoy', 'flow', 'merge', 'cycle', 'document', 'dot', 'paper-plane', 'narrowing-lines'];

const meta = {
  title:     'Atoms/Icon',
  component: Icon,
  args:      { name: 'hammer', label: 'Example build' },
} satisfies Meta<typeof Icon>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Named: Story = {};
export const Decorative: Story = { args: { label: null } };

export const EveryIcon: Story = {
  render: () => (
    <View row wrap gap="sixteen">
      {ICON_NAMES.map((name) => <Icon key={name} name={name} label={name} />)}
    </View>
  ),
};
