import type { EnterKeyBehavior } from './schemas/index.ts';

export const ENTER_KEY_STORAGE_KEY = 'irori_enter_key_behavior';

export interface EnterKeyEventInput {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  justEndedComposition?: boolean;
  keyCode?: number;
  which?: number;
  isMobileOrTablet: boolean;
  enterKeyBehavior: EnterKeyBehavior;
}

export type EnterKeyResolution =
  | 'ignore_ime'
  | 'ignore_other_key'
  | 'send'
  | 'newline_native'
  | 'newline_manual';

/**
 * 日本語入力 (IME) 変換確定時の Enter、PC / モバイル・タブレット判定、およびユーザー設定 ('newline' | 'send') に基づき、
 * Enter キー押下時の挙動を決定する純粋関数。
 *
 * IME確定Enterの網羅的ガード:
 * 1. `isComposing === true` (標準 KeyboardEvent.isComposing)
 * 2. `keyCode === 229` または `which === 229` (IME処理中を示すキーコード)
 * 3. `justEndedComposition === true` (Safari / macOS 等で compositionend 直後に発火する確定 Enter keydown)
 *
 * 端末・設定別仕様:
 * - モバイル・タブレット (`isMobileOrTablet === true`):
 *   - 常に改行のみ ('newline_native')、送信はボタンタップのみ
 * - PC (`isMobileOrTablet === false`):
 *   - 設定が 'newline' (デフォルト: 単品Enter = 改行):
 *     - 単品 Enter -> 改行 ('newline_native')
 *     - Alt + Enter または Shift + Enter -> 送信 ('send')
 *   - 設定が 'send' (単品Enter = 送信):
 *     - 単品 Enter -> 送信 ('send')
 *     - Shift + Enter -> 改行 ('newline_native')
 *     - Alt + Enter -> 改行をカーソル位置へ明示挿入 ('newline_manual')
 */
export function resolveEnterKeyAction(
  input: EnterKeyEventInput,
): EnterKeyResolution {
  if (input.key !== 'Enter') {
    return 'ignore_other_key';
  }

  // 日本語IME変換中・変換確定時の Enter は送信・手動改行どちらも絶対に発火させない
  if (
    input.isComposing ||
    input.justEndedComposition ||
    input.keyCode === 229 ||
    input.which === 229
  ) {
    return 'ignore_ime';
  }

  // モバイル・タブレットはデフォルトで「改行」のみ、送信はボタンのみ
  if (input.isMobileOrTablet) {
    return 'newline_native';
  }

  const isAltOrShift = Boolean(input.altKey || input.shiftKey);

  if (input.enterKeyBehavior === 'newline') {
    // デフォルト: 単品Enterで改行、Alt+Enter または Shift+Enter で送信
    if (isAltOrShift) {
      return 'send';
    }
    return 'newline_native';
  }

  // enterKeyBehavior === 'send': 単品Enterで送信、Alt+Enter または Shift+Enter で改行
  if (isAltOrShift) {
    // Shift+Enter はブラウザ標準で textarea に改行が入るが、Alt+Enter は標準では改行されないため手動挿入する
    return input.altKey && !input.shiftKey
      ? 'newline_manual'
      : 'newline_native';
  }

  return 'send';
}

/**
 * 現在の端末がモバイルまたはタブレット（タッチ主体の端末）かどうかを判定する。
 */
export function detectMobileOrTablet(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }

  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua)) {
    return true;
  }

  // iPadOS (MacIntel + maxTouchPoints > 1) 判定
  if (
    navigator.platform === 'MacIntel' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1
  ) {
    return true;
  }

  if (typeof window.matchMedia === 'function') {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const noHover = window.matchMedia('(hover: none)').matches;
    if (coarse && noHover) {
      return true;
    }
  }

  return false;
}
