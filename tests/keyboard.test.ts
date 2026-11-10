import { describe, expect, it } from 'vitest';
import {
  type EnterKeyEventInput,
  resolveEnterKeyAction,
} from '../app/lib/keyboard';

describe('resolveEnterKeyAction', () => {
  const baseInput: EnterKeyEventInput = {
    key: 'Enter',
    shiftKey: false,
    altKey: false,
    isMobileOrTablet: false,
    enterKeyBehavior: 'newline',
  };

  describe('Non-Enter keys', () => {
    it('ignores non-Enter keys', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          key: 'a',
        }),
      ).toBe('ignore_other_key');

      expect(
        resolveEnterKeyAction({
          ...baseInput,
          key: 'Escape',
        }),
      ).toBe('ignore_other_key');

      expect(
        resolveEnterKeyAction({
          ...baseInput,
          key: 'Tab',
        }),
      ).toBe('ignore_other_key');
    });
  });

  describe('Japanese IME Conversion Guards', () => {
    it('ignores Enter when isComposing is true', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isComposing: true,
        }),
      ).toBe('ignore_ime');
    });

    it('ignores Enter when keyCode is 229', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          keyCode: 229,
        }),
      ).toBe('ignore_ime');
    });

    it('ignores Enter when which is 229', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          which: 229,
        }),
      ).toBe('ignore_ime');
    });

    it('ignores Enter immediately after compositionend (justEndedComposition is true)', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isComposing: false,
          justEndedComposition: true,
        }),
      ).toBe('ignore_ime');
    });

    it('guards IME even with Shift or Alt pressed', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          shiftKey: true,
          isComposing: true,
        }),
      ).toBe('ignore_ime');

      expect(
        resolveEnterKeyAction({
          ...baseInput,
          altKey: true,
          justEndedComposition: true,
        }),
      ).toBe('ignore_ime');
    });
  });

  describe('Mobile & Tablet Mode', () => {
    it('always resolves to native newline on mobile with default newline setting', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: true,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('newline_native');

      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: true,
          shiftKey: true,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('newline_native');

      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: true,
          altKey: true,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('newline_native');
    });

    it('always resolves to native newline on mobile even if enterKeyBehavior is send', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: true,
          enterKeyBehavior: 'send',
        }),
      ).toBe('newline_native');

      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: true,
          shiftKey: true,
          enterKeyBehavior: 'send',
        }),
      ).toBe('newline_native');
    });
  });

  describe('PC Mode - Default newline setting', () => {
    it('resolves plain Enter to native newline', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: false,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('newline_native');
    });

    it('resolves Shift + Enter to send', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          shiftKey: true,
          isMobileOrTablet: false,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('send');
    });

    it('resolves Alt + Enter to send', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          altKey: true,
          isMobileOrTablet: false,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('send');
    });

    it('resolves Shift + Alt + Enter to send', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          shiftKey: true,
          altKey: true,
          isMobileOrTablet: false,
          enterKeyBehavior: 'newline',
        }),
      ).toBe('send');
    });
  });

  describe('PC Mode - Send setting', () => {
    it('resolves plain Enter to send', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          isMobileOrTablet: false,
          enterKeyBehavior: 'send',
        }),
      ).toBe('send');
    });

    it('resolves Shift + Enter to native newline', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          shiftKey: true,
          isMobileOrTablet: false,
          enterKeyBehavior: 'send',
        }),
      ).toBe('newline_native');
    });

    it('resolves Alt + Enter to manual newline insertion', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          altKey: true,
          isMobileOrTablet: false,
          enterKeyBehavior: 'send',
        }),
      ).toBe('newline_manual');
    });

    it('resolves Shift + Alt + Enter to native newline', () => {
      expect(
        resolveEnterKeyAction({
          ...baseInput,
          shiftKey: true,
          altKey: true,
          isMobileOrTablet: false,
          enterKeyBehavior: 'send',
        }),
      ).toBe('newline_native');
    });
  });
});
