import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageInput } from './message-input';

describe('MessageInput Component', () => {
  it('renders correctly with placeholder', () => {
    render(
      <MessageInput
        onSend={vi.fn()}
        onTyping={vi.fn()}
        placeholder="テスト送信..."
      />
    );
    const inputElement = screen.getByPlaceholderText('テスト送信...');
    expect(inputElement).toBeInTheDocument();
  });

  it('triggers onTyping when typing keys', () => {
    const handleTyping = vi.fn();
    render(<MessageInput onSend={vi.fn()} onTyping={handleTyping} />);
    const inputElement = screen.getByRole('textbox');

    fireEvent.change(inputElement, { target: { value: 'あ' } });
    expect(handleTyping).toHaveBeenCalled();
  });

  it('triggers onSend on form submission', async () => {
    const handleSend = vi.fn();
    render(<MessageInput onSend={handleSend} onTyping={vi.fn()} />);
    const inputElement = screen.getByRole('textbox');
    const submitButton = screen.getByLabelText('送信');

    fireEvent.change(inputElement, { target: { value: 'こんにちは！' } });
    fireEvent.click(submitButton);

    expect(handleSend).toHaveBeenCalledWith('こんにちは！', undefined);
  });
});
