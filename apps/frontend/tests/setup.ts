import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 各テストの実行後に DOM をクリーンアップする
afterEach(() => {
  cleanup();
});
