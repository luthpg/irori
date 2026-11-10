import { useState } from 'react';
import { StatusDot } from '~/components/ui/irori-icons';
import type { StatusLamp } from '~/lib/schemas';

interface StatusLampPickerProps {
  currentStatus: StatusLamp;
  ephemeralMemo: string;
  onStatusChange: (status: StatusLamp) => void;
  onMemoChange: (memo: string) => void;
}

const STATUS_OPTIONS: {
  value: StatusLamp;
  label: string;
  sublabel: string;
}[] = [
  {
    value: 'free',
    label: 'オンライン',
    sublabel: 'メッセージを受信します',
  },
  {
    value: 'busy',
    label: '取り込み中',
    sublabel: '通知を一時的に抑制します',
  },
  {
    value: 'away',
    label: '離席中',
    sublabel: '通知をミュートします',
  },
];

export function StatusLampPicker({
  currentStatus,
  ephemeralMemo,
  onStatusChange,
  onMemoChange,
}: StatusLampPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftMemo, setDraftMemo] = useState(ephemeralMemo);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-11 h-11 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] flex items-center justify-center transition-colors relative group"
        title={`ステータス: ${currentStatus} (${ephemeralMemo || 'メモ未設定'})`}
      >
        <span className="text-xs font-medium text-[#F5F5F7]">状態</span>
        <span className="absolute -top-1 -right-1">
          <StatusDot status={currentStatus} size="md" />
        </span>
      </button>

      {isOpen && (
        <div className="absolute left-14 bottom-0 z-50 w-72 rounded-xl bg-[#1F1F24] border border-white/10 p-3.5 shadow-2xl">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-xs font-semibold text-[#F5F5F7]">
              ステータス設定
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-xs text-[#8E8E93] hover:text-[#F5F5F7] px-1.5 py-0.5"
            >
              閉じる
            </button>
          </div>

          <div className="space-y-1.5 mb-3">
            {STATUS_OPTIONS.map((opt) => {
              const isSelected = currentStatus === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onStatusChange(opt.value);
                  }}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors flex items-start gap-2.5 ${
                    isSelected
                      ? 'bg-[#261712] border-[#FF5722]/40 text-[#F5F5F7]'
                      : 'bg-[#18181C] border-white/[0.04] text-[#8E8E93] hover:text-[#F5F5F7]'
                  }`}
                >
                  <span className="mt-1">
                    <StatusDot status={opt.value} size="md" />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-medium text-[#F5F5F7]">
                      {opt.label}
                    </span>
                    <span className="block text-[11px] text-[#8E8E93] leading-snug mt-0.5">
                      {opt.sublabel}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="pt-2.5 border-t border-white/[0.08]">
            <label
              htmlFor="ephemeral-status-input"
              className="block text-[11px] text-[#8E8E93] mb-1.5"
            >
              ステータスメモ（1時間で消去）
            </label>
            <div className="flex gap-1.5">
              <input
                id="ephemeral-status-input"
                type="text"
                value={draftMemo}
                onChange={(e) => setDraftMemo(e.target.value)}
                placeholder="例: コーヒー淹れてきます☕"
                className="flex-1 min-w-0 bg-[#131316] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F7] placeholder:text-[#636366]"
              />
              <button
                type="button"
                onClick={() => {
                  onMemoChange(draftMemo);
                  setIsOpen(false);
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[#EA580C] hover:bg-[#FF5722] text-white text-xs font-medium shrink-0 transition-colors"
              >
                更新
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
