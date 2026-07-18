import type { Meta, StoryObj } from '@storybook/react';
import { AppProvider } from '../../hooks/useAppContext';
import { StatusLampPicker } from './status-lamp-picker';

const meta: Meta<typeof StatusLampPicker> = {
  title: 'Components/Sidebar/StatusLampPicker',
  component: StatusLampPicker,
  decorators: [
    (Story) => (
      <AppProvider>
        <div className="p-8 bg-[#0A0A0C] rounded border border-[#1F1F23] relative min-w-[200px] min-h-[180px]">
          <Story />
        </div>
      </AppProvider>
    ),
  ],
  parameters: {
    layout: 'centered',
  },
  args: {
    onClose: () => {
      console.log('Storybook onClose');
    },
  },
};

export default meta;
type Story = StoryObj<typeof StatusLampPicker>;

export const Default: Story = {};
