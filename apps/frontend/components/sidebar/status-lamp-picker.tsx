'use client';

import { useAppContext } from '@/hooks/useAppContext';
import { client } from '@/lib/api';

export function StatusLampPicker({ onClose }: { onClose: () => void }) {
  const { user, token, refreshUser } = useAppContext();

  if (!user) return null;

  const handleStatusChange = async (statusLamp: 'free' | 'busy' | 'away') => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      const res = await client.api.v1.users.status.$patch(
        { json: { statusLamp } },
        { headers }
      );
      if (res.ok) {
        await refreshUser();
      }
    } catch (err) {
      console.error('Failed to update status lamp:', err);
    } finally {
      onClose();
    }
  };

  return (
    <div className="w-36 bg-[#18181C] border border-[#1F1F23] rounded-md shadow-xl py-1 flex flex-col z-50 text-sm select-none">
      <button
        type="button"
        onClick={() => handleStatusChange('free')}
        className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#F5F5F7] hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-[#4CAF50]" />
        <span>ひま (緑)</span>
      </button>

      <button
        type="button"
        onClick={() => handleStatusChange('busy')}
        className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#F5F5F7] hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-[#FF3B30]" />
        <span>作業中 (赤)</span>
      </button>

      <button
        type="button"
        onClick={() => handleStatusChange('away')}
        className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-[#F5F5F7] hover:bg-[#1F1F23] transition-colors border-0 cursor-pointer"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-[#FFCC00]" />
        <span>離席 (黄)</span>
      </button>
    </div>
  );
}
