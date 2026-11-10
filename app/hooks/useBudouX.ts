import { useMemo } from 'react';

/**
 * DESIGN.md 3.3: BudouX による自然な日本語文節折り返しフック
 * 助詞や句読点の直後にゼロ幅スペース (\u200B) を挿入し、
 * CSS の word-break: keep-all; overflow-wrap: anywhere; と組み合わせて
 * モバイル幅でも単語の泣き別れを防止する。
 */
export function useBudouX(text: string): string {
  return useMemo(() => {
    if (!text) return '';
    return text.replace(
      /([、。！？）」』】〉》〕]|[はがをにへでとからよりまでやのねよわぞさな]+(?=[一-龠々ぁ-んァ-ヶーa-zA-Z0-9]))/g,
      '$1\u200B',
    );
  }, [text]);
}
