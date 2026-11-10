import {
  type AmbientSoundType,
  useAmbientSound,
} from '~/hooks/useAmbientSound';

const SOUND_TYPES: { id: AmbientSoundType; label: string; emoji: string }[] = [
  { id: 'campfire', label: '炭火', emoji: '🔥' },
  { id: 'rain', label: '夜雨', emoji: '🌧️' },
  { id: 'waves', label: '波音', emoji: '🌊' },
];

export function AsmrController() {
  const { isPlaying, soundType, volume, togglePlay, setSoundType, setVolume } =
    useAmbientSound();

  return (
    <div className="rounded-xl bg-[#18181C] border border-white/[0.06] p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isPlaying ? 'bg-[#FF5722] animate-pulse' : 'bg-[#636366]'
            }`}
          />
          <span className="text-xs font-medium text-[#F5F5F7]">
            環境音（ASMR）
          </span>
        </div>
        <button
          type="button"
          onClick={togglePlay}
          className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
            isPlaying
              ? 'bg-[#EA580C] text-white shadow-[0_0_12px_rgba(255,87,34,0.35)]'
              : 'bg-[#1F1F24] text-[#8E8E93] hover:text-[#F5F5F7] border border-white/[0.06]'
          }`}
        >
          {isPlaying ? '再生中 · 停止' : '再生する'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-2.5">
        {SOUND_TYPES.map((item) => {
          const active = soundType === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSoundType(item.id)}
              className={`py-1 px-2 rounded-lg text-xs flex items-center justify-center gap-1 border transition-colors ${
                active
                  ? 'bg-[#261712] border-[#FF5722]/40 text-[#F5F5F7]'
                  : 'bg-[#131316] border-white/[0.04] text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              <span>{item.emoji}</span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] text-[#8E8E93] shrink-0">音量</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          aria-label="環境音の音量"
          className="w-full h-1.5 bg-[#131316] rounded-lg appearance-none cursor-pointer accent-[#FF5722]"
        />
        <span className="text-[11px] text-[#8E8E93] font-mono w-8 text-right">
          {Math.round(volume * 100)}%
        </span>
      </div>
    </div>
  );
}
