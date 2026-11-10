import { useCallback, useEffect, useRef, useState } from 'react';

export type AmbientSoundType = 'campfire' | 'rain' | 'waves';

interface UseAmbientSoundReturn {
  isPlaying: boolean;
  soundType: AmbientSoundType;
  volume: number;
  togglePlay: () => void;
  setSoundType: (type: AmbientSoundType) => void;
  setVolume: (vol: number) => void;
}

/**
 * FR-ATM-02: Web Audio API 環境音（ASMR）サウンドスケープ・シンセサイザー
 * 外部音声ファイルに依存せず、ブラウザ標準の Web Audio API で
 * 炭がパチパチと爆ぜる焚き火音・静かな雨音・夜の波音をリアルタイム生成する。
 */
export function useAmbientSound(): UseAmbientSoundReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const [soundType, setSoundType] = useState<AmbientSoundType>('campfire');
  const [volume, setVolume] = useState(0.35);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const crackleTimerRef = useRef<number | null>(null);

  const stopAudio = useCallback(() => {
    if (crackleTimerRef.current != null) {
      window.clearInterval(crackleTimerRef.current);
      crackleTimerRef.current = null;
    }
    if (audioCtxRef.current != null) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      masterGainRef.current = null;
    }
  }, []);

  const startAudio = useCallback(
    (type: AmbientSoundType, currentVol: number) => {
      stopAudio();
      if (typeof window === 'undefined') return;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.value = currentVol * 0.25;
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // 2秒ループのブラウンノイズ風バッファ生成
      const bufferSize = ctx.sampleRate * 2;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 2.5;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      if (type === 'campfire') {
        filter.type = 'lowpass';
        filter.frequency.value = 280;
      } else if (type === 'rain') {
        filter.type = 'bandpass';
        filter.frequency.value = 950;
        filter.Q.value = 0.7;
      } else {
        filter.type = 'lowpass';
        filter.frequency.value = 420;
      }

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start(0);

      // 焚き火のパチパチ爆ぜる音 or 波のうねり演出
      if (type === 'campfire') {
        crackleTimerRef.current = window.setInterval(() => {
          if (audioCtxRef.current == null || masterGainRef.current == null) {
            return;
          }
          if (Math.random() > 0.45) {
            const osc = ctx.createOscillator();
            const popGain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(
              1400 + Math.random() * 1800,
              ctx.currentTime,
            );
            popGain.gain.setValueAtTime(
              0.08 * (0.5 + Math.random() * 0.5),
              ctx.currentTime,
            );
            popGain.gain.exponentialRampToValueAtTime(
              0.001,
              ctx.currentTime + 0.025,
            );
            osc.connect(popGain);
            popGain.connect(masterGain);
            osc.start();
            osc.stop(ctx.currentTime + 0.03);
          }
        }, 260);
      } else if (type === 'waves') {
        let phase = 0;
        crackleTimerRef.current = window.setInterval(() => {
          phase += 0.15;
          filter.frequency.setValueAtTime(
            260 + Math.sin(phase) * 180,
            ctx.currentTime,
          );
        }, 120);
      }
    },
    [stopAudio],
  );

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      const next = !prev;
      if (next) {
        startAudio(soundType, volume);
      } else {
        stopAudio();
      }
      return next;
    });
  }, [soundType, startAudio, stopAudio, volume]);

  const handleSetSoundType = useCallback(
    (type: AmbientSoundType) => {
      setSoundType(type);
      if (isPlaying) {
        startAudio(type, volume);
      }
    },
    [isPlaying, startAudio, volume],
  );

  const handleSetVolume = useCallback((vol: number) => {
    setVolume(vol);
    if (masterGainRef.current != null && audioCtxRef.current != null) {
      masterGainRef.current.gain.setValueAtTime(
        vol * 0.25,
        audioCtxRef.current.currentTime,
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, [stopAudio]);

  return {
    isPlaying,
    soundType,
    volume,
    togglePlay,
    setSoundType: handleSetSoundType,
    setVolume: handleSetVolume,
  };
}
