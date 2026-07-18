import type { Preview } from '@storybook/react';
import '../app/globals.css'; // Tailwind CSS をロード

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        {
          name: 'dark',
          value: '#0A0A0C', // DESIGN.md の背景色
        },
        {
          name: 'light',
          value: '#FFFFFF',
        },
      ],
    },
  },
};

export default preview;
