/** The package's Storybook: the React framework on Vite, every story beside its component, and no backgrounds tool, as the theme paints the page. */
import type { StorybookConfig } from '@storybook/react-vite';

const configuration: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories:   ['../**/*.stories.tsx'],
  features:  { backgrounds: false },
};

export default configuration;
