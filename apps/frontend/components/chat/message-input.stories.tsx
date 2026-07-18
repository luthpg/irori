import type { Meta, StoryObj } from '@storybook/react';
import { MessageInput } from './message-input';

const meta: Meta<typeof MessageInput> = {
  title: 'Components/Chat/MessageInput',
  component: MessageInput,
  parameters: {
    layout: 'padded',
  },
  args: {
    onSend: async (content: string, mediaUrl?: string) => {
      console.log('Storybook onSend:', { content, mediaUrl });
    },
    onTyping: () => {
      console.log('Storybook onTyping');
    },
    placeholder: 'メッセージを入力...',
    disabled: false,
  },
};

export default meta;
type Story = StoryObj<typeof MessageInput>;

export const Default: Story = {};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};
