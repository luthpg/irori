---
version: "alpha"
name: "Irori (イロリ)"
description: "A dark-themed, calming dashboard for digital gathering with refined Japanese lettering."
colors:
  primary: "#FF5722"
  secondary: "#8E8E93"
  background: "#0A0A0C"
  surface: "#131316"
  surface-popover: "#18181C"
  on-surface: "#F5F5F7"
  border: "#1F1F23"
typography:
  headline-display:
    fontFamily: "Noto Sans JP, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.4
  headline-md:
    fontFamily: "Noto Sans JP, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.5
  body-md:
    fontFamily: "Noto Sans JP, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.7
  body-sm:
    fontFamily: "Noto Sans JP, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  mono:
    fontFamily: "Noto Sans Mono, monospace"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    padding: "12px"
  message-bubble:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.md}"
    padding: "16px"
---

# Irori (イロリ) DESIGN.md

## Overview

Irori（イロリ）は、「デジタルな囲炉裏」をコンセプトにしたコミュニケーション・ダッシュボードです。深く沈んだ漆黒の夜を思わせるダークテーマを基調とし、情報を穏やかに配置することで、ノイズのない静かなユーザー体験を提供します。アクセントカラーには炎を連想させるオレンジを用い、UI全体に温かみを持たせています。

本ドキュメントは、生成AIエージェントが日本語の美しい文字組（リテラリング）とアクセシビリティを考慮したUIコンポーネントを自動生成・検証するためのデザインシステム仕様です。

## Colors

カラーパレットは、暗い背景の中での視認性と、目に優しいコントラストを両立させています。

* **Primary (#FF5722):** 囲炉裏の炎を象徴するオレンジ。主要なアクションや状態（気配）の強調に限定して使用します。
* **Secondary (#8E8E93):** メタデータやタイムスタンプなどの補助テキストに使用するグレー。
* **Background (#0A0A0C):** 画面の基盤となる最も暗い色です。
* **Surface (#131316):** パネルやカード要素に使用する色で、背景とわずかなコントラストを作ります。
* **Surface-Popover (#18181C):** ドロップダウンやポップオーバーなど、手前に浮き出る要素に使用します。
* **On-Surface (#F5F5F7):** メインテキストに使用するオフホワイト。
* **Border (#1F1F23):** 領域を区切るための非常に繊細な境界線。

## Typography

日本語の美しさと読みやすさを最優先し、デジタル庁のデザインシステムに準拠した文字組ルールを採用します。

### フォントファミリーの選定

* 可読性や視認性が高いサンセリフとして「Noto Sans JP」を採用します[cite: 3]。
* コード系コンテンツや等幅フォントが必要な領域には「Noto Sans Mono」を採用します[cite: 3]。
* AIエージェントは、CSSの記述において以下の定義を厳格に適用してください[cite: 3]。

```css
body {
  font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, sans-serif;
}

code {
  font-family: 'Noto Sans Mono', monospace;
}
```

### 書体の太さ（`font-weight`）と大きさ（`font-size`）

* 書体の太さは、主に `400` (Normal) と `700` (Bold) の2つのウェイトを基準として使い分けます[cite: 3]。
* 視認性と可読性の観点から、本文およびUIの文字サイズは `16px` 以上を基準値とします[cite: 3]。
* 領域的な制約がある場合の補助情報（タイムスタンプ等）に限り `14px` の使用を認めますが、`14px` 未満の大きさの使用は原則として禁止します[cite: 3]。

### 行ボックスの高さ（`line-height`）と文字間隔（`letter-spacing`）

* 長文のチャットタイムラインにおいて認知負荷を軽減するため、本文テキストの行高はフォントサイズに対して `160%` から `170%` （単位なし数値で `1.6` 〜 `1.7`）を維持してください[cite: 3]。
* コンポーネント内のワンラインテキスト（ボタン等）は `100%` [`1.0`](cite: 3)、見出しなどの大きな文字には `140%` 〜 `150%` (`1.4` 〜 `1.5`) を適用します[cite: 3]。
* 日本語の文字間隔（`letter-spacing`）は、可読性を高めるためにサイズに応じて `1%` (`0.01em`) または `2%` (`0.02em`) の微細な余裕を持たせます[cite: 3]。

### 日本語リテラリング独自の禁則・美学

* **和欧混植の四分空き:** 全角の日本語文字と半角英数字が隣接する場合、視覚的な詰まりを防ぐため、原則として半角スペースを1つ挿入した文字組を出力してください（例:「`3カラム構成`」ではなく「`3 カラム構成`」）。
* **斜体（イタリック）の禁止:** 日本語フォントは通常イタリック体の書体をもたないため、標準のフェイスを傾けただけの斜体が合成され、可読性が著しく低下します[cite: 3]。そのため、日本語テキストに対するイタリック体の使用は原則禁止とします[cite: 3]。

## Layout

画面サイズに応じた柔軟なマルチカラム構成と、呼吸を感じる余白（スペーシング）を定義します。

* **レイアウトシステム:** デスクトップ環境では、左カラム（ルーム一覧：280px）、中央カラム（チャットエリア：flex-1）、右カラム（詳細・設定：320px）の3カラム構成をベースとします。
* **レスポンス動作:** 画面幅が狭いモバイルやタブレット環境では、左右のパネルを画面外（ドロワー）に格納し、ユーザーがチャットエリアに集中できるように制御します。
* **スペーシング:** すべてのコンポーネント配置およびインナークッションは、8pxを基準としたスケール（4px, 8px, 16px, 24px, 32px）を厳格に適用し、要素間に十分な静寂（余白）を確保します。

## Elevation & Depth

暗い画面の中での階層構造（深度）は、ドロップシャドウではなく、明度差を利用した「Tonal Layers（トナルレイヤー）」によって表現します。

* 画面の最奥（背景）を最も暗い `#0A0A0C` とし、その上に載るカードやメッセージバブル（`#131316`）、さらに手前に浮き出るポップオーバーやモーダル（`#18181C`）へと、段階的にサーフェスカラーの明度を上げることで直感的な視覚ヒエラルキーを形成します。
* レイヤー間の境界をより明確にするため、非常に繊細な境界線（`#1F1F23`）を補完的に使用します。

## Shapes

UI要素の形状には、親しみやすさとモダンなシャープさを両立する角丸を適用します。

* 基本となるボタン、カード、入力フィールド、メッセージバブルの角丸（`border-radius`）には、一律で 8px（`{rounded.md}`）を適用します。
* タグやバッジなどの小さな要素には 4px（`{rounded.sm}`）、完全な円景には `9999px` (`{rounded.full}`) を割り当てます。

## Components

### Buttons

* **プライマリボタン:** 背景色に `{colors.primary}`、文字色に `#FFFFFF` を使用します。角丸は `{rounded.md}` とし、人間工学的なタッチターゲットを担保するため、モバイル環境でも最小 `44px` 以上の高さを確保できるよう上下に `12px` 以上のパディングを設定します。

### Message Bubble

* チャットのメッセージバブルは、背景色に `{colors.surface}`、文字色に `{colors.on-surface}` を適用します。テキストスタイルには `{typography.body-md}` を割り当て、長文でも目が疲れない文字組を維持します。

## Do's and Don'ts

* **Do:** ユーザーがブラウザ設定でフォントサイズを拡大（200%以上など）しても、レイアウトが崩れず機能が維持されるよう、レスポンシブデザインを正しく実装してください[cite: 3]。
* **Do:** 認知障害や読み書き障害のあるユーザーの行追いをサポートするため、段落と段落の間には、行ボックスの高さの1.5倍以上（フォントサイズの2.25倍以上）の十分なマージンを確保してください[cite: 3]。
* **Do:** 長いテキストブロックの幅は、目で位置を把握しやすいよう全角40文字（半角80文字）程度を目安として設計してください[cite: 3]。
* **Don't:** フォントの変更やテキストの拡縮を妨げる原因となるため、ロゴなどの不可欠な例外を除き、テキストを画像（文字画像）にして配置しないでください[cite: 3]。
* **Don't:** 文章の長い範囲に斜体（イタリック）を適用しないでください。可読性が損なわれ、閲覧が極めて困難になります[cite: 3]。
