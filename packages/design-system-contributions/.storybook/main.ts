/**
 * The package's Storybook: the React framework on Vite, every story beside its component, and no backgrounds tool, as the theme paints the
 * page, and no telemetry. The design-system package is linked, so Vite keeps one React for it and for this package.
 */
import type { StorybookConfig } from '@storybook/react-vite';

const configuration: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories:   ['../**/*.stories.tsx'],
  features:  { backgrounds: false },
  viteFinal: (viteConfiguration) => ({ ...viteConfiguration, resolve: { ...viteConfiguration.resolve, dedupe: ['react', 'react-dom'] } }),
};

export default configuration;
