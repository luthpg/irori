import type { StatusLamp } from '~/lib/schemas';

export function IroriFlameLogo({
  className = 'w-8 h-8',
  glowing = true,
}: {
  className?: string;
  glowing?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} ${glowing ? 'drop-shadow-[0_0_8px_rgba(255,87,34,0.45)]' : ''}`}
      aria-hidden="true"
    >
      {/* 炎の外側 */}
      <path
        d="M20.5 4C20.5 4 29 11.2 29 19.5C29 24.4 25.2 28 20 28C14.8 28 11 24.4 11 19.5C11 15.6 13.4 12.2 15.2 10.2C15.2 10.2 14.8 14 17 15.2C16.2 11.4 18.2 7.2 20.5 4Z"
        fill="url(#iroriFlameGrad)"
      />
      {/* 炎の芯 */}
      <path
        d="M20.2 13.5C20.2 13.5 24.5 17.2 24.5 21.2C24.5 23.8 22.5 26 20 26C17.5 26 15.5 23.8 15.5 21.2C15.5 18.5 18 16 20.2 13.5Z"
        fill="#FDBA74"
      />
      {/* 交差する薪 */}
      <path
        d="M9 31.5L31 27.5"
        stroke="#EA580C"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M9 27.5L31 31.5"
        stroke="#FF5722"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M12 35.5H28"
        stroke="#9A3412"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <defs>
        <linearGradient
          id="iroriFlameGrad"
          x1="20"
          y1="4"
          x2="20"
          y2="28"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF7A45" />
          <stop offset="0.6" stopColor="#FF5722" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function StatusDot({
  status,
  size = 'md',
}: {
  status: StatusLamp;
  size?: 'sm' | 'md' | 'lg';
}) {
  const colorMap: Record<StatusLamp, string> = {
    free: 'bg-[#22C55E]',
    busy: 'bg-[#EF4444]',
    away: 'bg-[#F59E0B]',
  };
  const labelMap: Record<StatusLamp, string> = {
    free: 'ひま / オンライン',
    busy: '集中・作業中（通知自動抑制）',
    away: '離席・おやすみ',
  };
  const sizeClass =
    size === 'sm'
      ? 'w-2.5 h-2.5 border-[1.5px]'
      : size === 'lg'
        ? 'w-3.5 h-3.5 border-2'
        : 'w-3 h-3 border-2';

  return (
    <span
      title={labelMap[status]}
      className={`inline-block rounded-full border-[#131316] ${sizeClass} ${colorMap[status]}`}
    />
  );
}

export function MemberAvatar({
  avatarType,
  statusLamp,
  size = 'md',
  isAnonymous = false,
  showStatus = true,
}: {
  avatarType: 'kenta' | 'sayuri' | 'hima' | 'sakyo' | 'anon';
  statusLamp?: StatusLamp;
  size?: 'sm' | 'md' | 'lg';
  isAnonymous?: boolean;
  showStatus?: boolean;
}) {
  const effectiveType = isAnonymous ? 'anon' : avatarType;

  const sizeClasses =
    size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-11 h-11' : 'w-10 h-10';

  return (
    <div className={`relative inline-flex shrink-0 ${sizeClasses}`}>
      {effectiveType === 'anon' ? (
        <div className="w-full h-full rounded-full bg-[#2A2A30] border border-white/10 flex items-center justify-center overflow-hidden">
          <svg
            viewBox="0 0 36 36"
            className="w-7/12 h-7/12 text-[#A1A1AA]"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 11c0-1.1.9-2 2-2h24c1.1 0 2 .9 2 2v5c0 8.8-6.3 16-14 16S4 24.8 4 16v-5zm6.5 4.5c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3-1.1 3-2.5-1.3-2.5-3-2.5zm15 0c-1.7 0-3 1.1-3 2.5s1.3 2.5 3 2.5 3-1.1 3-2.5-1.3-2.5-3-2.5zM13 24c1.2 1.8 3 2.8 5 2.8s3.8-1 5-2.8H13z" />
          </svg>
        </div>
      ) : effectiveType === 'kenta' || effectiveType === 'hima' ? (
        <div
          className={`w-full h-full rounded-full border border-white/15 flex items-center justify-center overflow-hidden ${
            effectiveType === 'kenta' ? 'bg-[#7CC2F5]' : 'bg-[#67B7DC]'
          }`}
        >
          <svg viewBox="0 0 40 40" className="w-full h-full" aria-hidden="true">
            {/* 服 */}
            <path
              d="M8 40C8 32.5 13 29 20 29C27 29 32 32.5 32 40"
              fill="#1D4ED8"
            />
            {/* 顔 */}
            <circle cx="20" cy="19" r="8.5" fill="#FDE6D8" />
            {/* 髪 */}
            <path
              d="M11 17C11 11.5 15 8.5 20 8.5C25 8.5 29 11.5 29 17C27 14.5 24 13.5 20 13.5C16 13.5 13 14.5 11 17Z"
              fill="#27272A"
            />
            {/* 目・口 */}
            <circle cx="17" cy="19.5" r="1" fill="#18181B" />
            <circle cx="23" cy="19.5" r="1" fill="#18181B" />
            <path
              d="M17.5 23C18.5 24 21.5 24 22.5 23"
              stroke="#18181B"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      ) : (
        <div
          className={`w-full h-full rounded-full border border-white/15 flex items-center justify-center overflow-hidden ${
            effectiveType === 'sayuri' ? 'bg-[#BCE3C8]' : 'bg-[#D8F3DC]'
          }`}
        >
          <svg viewBox="0 0 40 40" className="w-full h-full" aria-hidden="true">
            {/* 後ろ髪 */}
            <path
              d="M10 18C10 11 14.5 7.5 20 7.5C25.5 7.5 30 11 30 18V28H10V18Z"
              fill="#573B26"
            />
            {/* 服 */}
            <path
              d="M8 40C8 33 13 29.5 20 29.5C27 29.5 32 33 32 40"
              fill="#F43F5E"
            />
            {/* 顔 */}
            <circle cx="20" cy="19.5" r="8" fill="#FDE6D8" />
            {/* 前髪 */}
            <path
              d="M11.5 17.5C12.5 12 16 9.5 20 9.5C24 9.5 27.5 12 28.5 17.5C25.5 15 22 14 19 14C15.5 14 13 15.5 11.5 17.5Z"
              fill="#573B26"
            />
            {/* 目・口 */}
            <circle cx="17" cy="20" r="1" fill="#18181B" />
            <circle cx="23" cy="20" r="1" fill="#18181B" />
            <path
              d="M18 23.2C19 24.1 21 24.1 22 23.2"
              stroke="#18181B"
              strokeWidth="1.2"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      )}

      {showStatus && statusLamp && (
        <span
          className={`absolute ${
            size === 'sm' ? '-top-0.5 -right-0.5' : 'bottom-0 right-0'
          }`}
        >
          <StatusDot status={statusLamp} size={size === 'sm' ? 'sm' : 'md'} />
        </span>
      )}
    </div>
  );
}

export function CampfireThumbnailSvg() {
  return (
    <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-[#090A0F] border border-white/10 shrink-0 select-none">
      <svg
        viewBox="0 0 120 120"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <radialGradient id="nightGlow" cx="50%" cy="68%" r="55%">
            <stop offset="0%" stopColor="#FF5722" stopOpacity="0.65" />
            <stop offset="45%" stopColor="#EA580C" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#090A0F" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* 夜空と山並み */}
        <rect width="120" height="120" fill="#0B0D13" />
        <circle cx="24" cy="22" r="1" fill="#F5F5F7" opacity="0.5" />
        <circle cx="92" cy="18" r="1.2" fill="#F5F5F7" opacity="0.4" />
        <circle cx="70" cy="30" r="0.8" fill="#F5F5F7" opacity="0.4" />
        {/* テントのシルエット */}
        <polygon points="8,88 28,58 46,88" fill="#1E1B18" />
        <polygon points="22,88 28,68 35,88" fill="#7C2D12" opacity="0.7" />
        {/* 焚き火のアンバーグロー */}
        <circle cx="66" cy="76" r="46" fill="url(#nightGlow)" />
        {/* 地面 */}
        <rect x="0" y="86" width="120" height="34" fill="#0F0D0C" />
        {/* 薪 */}
        <path
          d="M46 94L86 84M48 84L84 94"
          stroke="#431407"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {/* 炎 */}
        <path
          d="M66 42C66 42 82 56 80 72C79 81 73 86 66 86C59 86 53 81 52 72C50 58 66 42 66 42Z"
          fill="#EA580C"
        />
        <path
          d="M66 52C66 52 76 62 75 73C74 79 70 84 66 84C62 84 58 79 57 73C56 62 66 52 66 52Z"
          fill="#FF5722"
        />
        <path
          d="M66 62C66 62 72 68 71 75C70 80 68 83 66 83C64 83 62 80 61 75C60 68 66 62 66 62Z"
          fill="#FDE047"
        />
        {/* 火の粉 */}
        <circle cx="60" cy="36" r="1.5" fill="#FDBA74" />
        <circle cx="73" cy="32" r="1.2" fill="#FF5722" />
        <circle cx="67" cy="25" r="1" fill="#FDE047" />
      </svg>
    </div>
  );
}
