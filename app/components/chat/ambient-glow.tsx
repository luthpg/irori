interface AmbientGlowProps {
  heatLevel: number;
}

/**
 * DESIGN.md 5.4: アンビエント・ライト (Ambient Glow)
 * 会話の熱量や滞在人数を「炭火の呼吸」のような淡いオレンジ微光として投影する。
 */
export function AmbientGlow({ heatLevel }: AmbientGlowProps) {
  const topOpacity = Math.max(0.03, Math.min(0.18, heatLevel * 0.16));
  const bottomOpacity = Math.max(0.02, Math.min(0.12, heatLevel * 0.1));

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden z-0 select-none"
      aria-hidden="true"
    >
      {/* 上部からの炭火アンビエント微光 */}
      <div
        className="absolute -top-24 left-1/2 -translate-x-1/2 w-[680px] h-[320px] rounded-full transition-opacity duration-1000"
        style={{
          background: `radial-gradient(ellipse at center, rgba(255, 87, 34, ${topOpacity}), transparent 70%)`,
        }}
      />

      {/* 右下部の熾火グラデーション */}
      <div
        className="absolute -bottom-20 right-10 w-[460px] h-[260px] rounded-full transition-opacity duration-1000"
        style={{
          background: `radial-gradient(ellipse at center, rgba(234, 88, 12, ${bottomOpacity}), transparent 72%)`,
        }}
      />

      {/* コンプ画像右側の薪・炭火シルエット透かし装飾 */}
      <svg
        viewBox="0 0 200 200"
        className="absolute right-8 top-1/3 w-44 h-44 text-white/[0.025]"
        fill="currentColor"
      >
        <title>炭火の透かし装飾</title>
        <path d="M100 30c0 0 42 35 42 75 0 24-19 42-42 42s-42-18-42-42c0-20 12-37 21-47 0 0-2 19 9 25-4-19 6-38 12-53z" />
        <rect
          x="35"
          y="148"
          width="130"
          height="14"
          rx="7"
          transform="rotate(-14 100 155)"
        />
        <rect
          x="35"
          y="148"
          width="130"
          height="14"
          rx="7"
          transform="rotate(14 100 155)"
        />
      </svg>
    </div>
  );
}
