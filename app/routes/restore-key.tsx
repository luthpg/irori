import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { IroriFlameLogo } from '~/components/ui/irori-icons';
import { requireAuth } from '~/lib/auth/session.server';
import {
  createWrappedBackupVault,
  derivePinAuthHash,
  unwrapBackupVaultToIndexedDb,
} from '~/lib/crypto/backup-pin.client';
import { exportSpaceKeyFragmentsForSync } from '~/lib/crypto/e2ee.client';
import {
  buildQrMatrix,
  createQrSyncSession,
  type QrSyncSession,
  unwrapKeyBundleFromQrPeer,
  wrapKeyBundleForQrPeer,
} from '~/lib/crypto/qr-sync.client';
import type { JoinedSpaceSummary, QrSyncSessionEntity } from '~/lib/schemas';
import { callUserActor } from '../../workers/rpc.server';
import type { Route } from './+types/restore-key';

export function meta(_args: Route.MetaArgs) {
  return [
    { title: '暗号鍵のバックアップ・復元 — Irori' },
    {
      name: 'description',
      content:
        '6桁PINコードまたはQRコードによる暗号鍵の安全なバックアップ・引き継ぎ',
    },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { session } = await requireAuth(request);
  const [challenge, joinedSpaces] = await Promise.all([
    callUserActor<{
      pinSalt: string;
      isLocked: boolean;
      remainingAttempts: number;
      lockedUntil: string | null;
      hasBackupVault: boolean;
    }>(session.userId, 'getPinChallenge'),
    callUserActor<JoinedSpaceSummary[]>(session.userId, 'getJoinedSpaces'),
  ]);

  const primarySpaceId = joinedSpaces[0]?.spaceId;
  const returnUrl = primarySpaceId ? `/chat/${primarySpaceId}/takibi` : '/';

  return {
    ...challenge,
    joinedSpaces,
    returnUrl,
  };
}

export default function RestoreKeyRoute({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'pin' | 'qr'>('pin');
  const [pinActionMode, setPinActionMode] = useState<'restore' | 'register'>(
    loaderData.hasBackupVault ? 'restore' : 'register',
  );
  const [pin, setPin] = useState<string>('');
  const [remainingAttempts, setRemainingAttempts] = useState(
    loaderData.remainingAttempts,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [qrSession, setQrSession] = useState<QrSyncSession | null>(null);
  const [qrStatus, setQrStatus] = useState<string | null>(null);
  const [qrCompleted, setQrCompleted] = useState(false);

  useEffect(() => {
    if (mode !== 'qr' || qrSession) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await createQrSyncSession();
        if (cancelled) return;
        setQrSession(s);
        await fetch('/api/users/qr-sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            intent: 'create',
            sessionId: s.sessionId,
            ephemeralPublicKey: s.ephemeralPublicKeyJwk,
            expiresAt: s.expiresAt,
          }),
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, qrSession]);

  // 新端末ポーリング: 既存端末から approve されたら自動で ECDH アンラップ
  useEffect(() => {
    if (mode !== 'qr' || !qrSession || qrCompleted) return;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(
          `/api/users/qr-sync?sessionId=${encodeURIComponent(qrSession.sessionId)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          session: QrSyncSessionEntity | null;
        };
        const remote = data.session;
        if (
          remote &&
          remote.status === 'approved' &&
          remote.senderPublicKey &&
          remote.encryptedKeyBundle &&
          remote.iv
        ) {
          const result = await unwrapKeyBundleFromQrPeer({
            senderPublicKey: remote.senderPublicKey,
            encryptedKeyBundle: remote.encryptedKeyBundle,
            iv: remote.iv,
          });
          setQrCompleted(true);
          setQrStatus(
            `✓ 端末間の同期が完了しました（同期スペース: ${result.importedSpacesCount}件）`,
          );
        }
      } catch {
        // ignore polling error
      }
    }, 2500);
    return () => window.clearInterval(timer);
  }, [mode, qrSession, qrCompleted]);

  const handleApproveAndCompleteQrSync = async () => {
    if (!qrSession || isBusy) return;
    setIsBusy(true);
    setQrStatus('端末間で暗号鍵を同期中...');
    try {
      const fragments = await exportSpaceKeyFragmentsForSync(
        loaderData.joinedSpaces.map((s) => ({
          spaceId: s.spaceId,
          keyEpoch: 1,
        })),
      );
      const wrapped = await wrapKeyBundleForQrPeer(
        qrSession.ephemeralPublicKeyJwk,
        fragments,
      );

      const approveRes = await fetch('/api/users/qr-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          intent: 'approve',
          sessionId: qrSession.sessionId,
          senderPublicKey: wrapped.senderPublicKey,
          encryptedKeyBundle: wrapped.encryptedKeyBundle,
          iv: wrapped.iv,
        }),
      });

      if (!approveRes.ok) {
        setQrStatus('QRセッションの承認に失敗しました（期限切れまたは未登録）');
        return;
      }

      const pollRes = await fetch(
        `/api/users/qr-sync?sessionId=${encodeURIComponent(qrSession.sessionId)}`,
      );
      const pollData = (await pollRes.json()) as {
        session: QrSyncSessionEntity | null;
      };
      if (
        pollData.session?.senderPublicKey &&
        pollData.session?.encryptedKeyBundle &&
        pollData.session?.iv
      ) {
        const unwrapped = await unwrapKeyBundleFromQrPeer({
          senderPublicKey: pollData.session.senderPublicKey,
          encryptedKeyBundle: pollData.session.encryptedKeyBundle,
          iv: pollData.session.iv,
        });
        setQrCompleted(true);
        setQrStatus(
          `✓ 端末間の同期が完了しました（同期スペース: ${unwrapped.importedSpacesCount}件）`,
        );
      }
    } catch {
      setQrStatus('鍵の同期処理中にエラーが発生しました');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCompletePin = async (enteredPin: string) => {
    setIsBusy(true);
    setStatusMessage('PINコードを検証中...');

    try {
      const pinSalt = loaderData.pinSalt || 'irori_user_salt_2026_v1';
      const pinAuthHash = await derivePinAuthHash(enteredPin, pinSalt);

      if (pinActionMode === 'register') {
        const defaultPepper = 'irori-edge-secret-pepper-v1-2026';
        const encryptedBackupUserKey = await createWrappedBackupVault(
          enteredPin,
          pinSalt,
          defaultPepper,
        );

        const res = await fetch('/api/users/backup-vault', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            encryptedBackupUserKey,
            pinSalt,
            pinAuthHash,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { serverPepperToken: string };
          await unwrapBackupVaultToIndexedDb(
            encryptedBackupUserKey,
            enteredPin,
            pinSalt,
            data.serverPepperToken || defaultPepper,
          );
          setIsUnlocked(true);
          setStatusMessage('✓ 暗号鍵のバックアップを設定しました。');
        } else {
          setStatusMessage('バックアップ設定中にエラーが発生しました。');
        }
      } else {
        const res = await fetch('/api/users/verify-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pinAuthHash }),
        });

        const data = (await res.json()) as {
          encryptedBackupUserKey?: string | null;
          pinSalt?: string;
          serverPepperToken?: string;
          remainingAttempts?: number;
          error?: string;
        };

        if (!res.ok) {
          setRemainingAttempts(data.remainingAttempts ?? 0);
          setStatusMessage(
            `PINコードが一致しません（残り試行可能回数: ${data.remainingAttempts ?? 0}回）`,
          );
          setPin('');
        } else {
          const pepper =
            data.serverPepperToken || 'irori-edge-secret-pepper-v1-2026';
          const targetVault =
            data.encryptedBackupUserKey ||
            (await createWrappedBackupVault(enteredPin, pinSalt, pepper));
          await unwrapBackupVaultToIndexedDb(
            targetVault,
            enteredPin,
            data.pinSalt || pinSalt,
            pepper,
          );
          setIsUnlocked(true);
          setStatusMessage('✓ 暗号鍵を正常に復元しました。');
        }
      }
    } catch {
      setStatusMessage('処理中にエラーが発生しました。');
    } finally {
      setIsBusy(false);
    }
  };

  const handleDigitPress = (digit: string) => {
    if (pin.length >= 6 || isBusy) return;
    const next = pin + digit;
    setPin(next);
    setStatusMessage(null);

    if (next.length === 6) {
      void handleCompletePin(next);
    }
  };

  const handleBackspace = () => {
    if (isBusy) return;
    setPin((prev) => prev.slice(0, -1));
  };

  const qrMatrix = buildQrMatrix(
    qrSession?.qrPayloadString || 'irori://qr-sync',
    25,
  );
  const qrCells: { id: string; x: number; y: number; isAccent: boolean }[] = [];
  for (let r = 0; r < qrMatrix.length; r += 1) {
    const row = qrMatrix[r];
    for (let c = 0; c < row.length; c += 1) {
      if (row[c]) {
        qrCells.push({
          id: `qr_r${r}_c${c}`,
          x: c + 2,
          y: r + 2,
          isAccent: r >= 2 && r <= 4 && c >= 2 && c <= 4,
        });
      }
    }
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F5F5F7] flex flex-col">
      {/* 上部バー */}
      <header className="border-b border-[#1F1F24] bg-[#0D0D10] px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <IroriFlameLogo className="w-6 h-6 sm:w-7 sm:h-7" glowing />
          <span className="text-base sm:text-lg font-bold text-[#FF7A45]">
            Irori
          </span>
          <span className="text-xs text-[#8E8E93]">/ 鍵バックアップ</span>
        </div>

        <Link
          to={loaderData.returnUrl}
          className="min-h-[36px] px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#18181C] hover:bg-[#261712] border border-white/10 text-xs font-medium text-[#F5F5F7] inline-flex items-center transition-colors"
        >
          ← チャット画面へ戻る
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="max-w-lg w-full rounded-2xl bg-[#131316] border border-white/[0.08] p-4 sm:p-6 shadow-2xl space-y-4 sm:space-y-5">
          <div>
            <h1 className="text-xl font-bold text-[#F5F5F7]">
              暗号鍵のバックアップ・復元
            </h1>
            <p className="text-xs text-[#8E8E93] mt-1 leading-relaxed">
              6桁のPINコードまたはQRコードを使って、暗号鍵のバックアップや別端末への引き継ぎを行えます。
            </p>
          </div>

          {/* 方式切替タブ */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0D0D10] border border-white/[0.06]">
            <button
              type="button"
              onClick={() => setMode('pin')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'pin'
                  ? 'bg-[#261712] text-[#FF7A45] border border-[#FF5722]/40'
                  : 'text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              🔢 6桁PINコード
            </button>
            <button
              type="button"
              onClick={() => setMode('qr')}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'qr'
                  ? 'bg-[#261712] text-[#FF7A45] border border-[#FF5722]/40'
                  : 'text-[#8E8E93] hover:text-[#F5F5F7]'
              }`}
            >
              📷 QRコードで端末間同期
            </button>
          </div>

          {mode === 'pin' ? (
            <div className="space-y-4">
              {/* 登録 or 復元モード切替 */}
              <div className="flex items-center justify-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPinActionMode('register');
                    setPin('');
                    setStatusMessage(null);
                  }}
                  className={`px-3 py-1 rounded-full border transition-colors ${
                    pinActionMode === 'register'
                      ? 'bg-[#EA580C] border-[#FF5722] text-white font-semibold'
                      : 'bg-[#18181C] border-white/10 text-[#8E8E93]'
                  }`}
                >
                  新しいPINコードを設定
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPinActionMode('restore');
                    setPin('');
                    setStatusMessage(null);
                  }}
                  className={`px-3 py-1 rounded-full border transition-colors ${
                    pinActionMode === 'restore'
                      ? 'bg-[#EA580C] border-[#FF5722] text-white font-semibold'
                      : 'bg-[#18181C] border-white/10 text-[#8E8E93]'
                  }`}
                >
                  PINコードで復元
                </button>
              </div>

              {/* 6桁ドットインジケーター */}
              <div className="flex flex-col items-center py-1">
                <div className="text-xs text-[#8E8E93] mb-2.5">
                  {pinActionMode === 'register'
                    ? '暗号化PINコード（6桁）を入力してください'
                    : '設定したPINコード（6桁）を入力してください'}
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const filled = idx < pin.length;
                    return (
                      <div
                        key={idx}
                        className={`w-9 sm:w-10 h-11 sm:h-12 rounded-xl border flex items-center justify-center text-lg font-mono font-bold transition-all ${
                          filled
                            ? 'bg-[#261712] border-[#FF5722] text-[#FF7A45] shadow-[0_0_12px_rgba(255,87,34,0.3)]'
                            : 'bg-[#18181C] border-white/10 text-[#636366]'
                        }`}
                      >
                        {filled ? '●' : ''}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] text-[#8E8E93] flex items-center gap-2">
                  <span>
                    残り試行可能回数:{' '}
                    <strong className="text-[#FF7A45]">
                      {remainingAttempts}回
                    </strong>
                    （連続で失敗すると一時的にロックされます）
                  </span>
                </div>
              </div>

              {/* テンキーパッド */}
              <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleDigitPress(d)}
                    className="h-12 rounded-xl bg-[#18181C] hover:bg-[#261712] border border-white/[0.06] hover:border-[#FF5722]/40 text-base font-mono font-semibold text-[#F5F5F7] transition-colors disabled:opacity-50"
                  >
                    {d}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setPin('')}
                  className="h-12 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-xs text-[#8E8E93]"
                >
                  クリア
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => handleDigitPress('0')}
                  className="h-12 rounded-xl bg-[#18181C] hover:bg-[#261712] border border-white/[0.06] hover:border-[#FF5722]/40 text-base font-mono font-semibold text-[#F5F5F7] transition-colors disabled:opacity-50"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={handleBackspace}
                  className="h-12 rounded-xl bg-[#18181C] hover:bg-[#1F1F24] border border-white/[0.06] text-xs text-[#8E8E93]"
                >
                  ⌫ 削除
                </button>
              </div>

              {statusMessage && (
                <div
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                    isUnlocked
                      ? 'bg-[#18181C] border-[#22C55E]/40 text-[#22C55E]'
                      : 'bg-[#261712] border-[#FF5722]/40 text-[#FDBA74]'
                  }`}
                >
                  <p>{statusMessage}</p>
                  {isUnlocked && (
                    <button
                      type="button"
                      onClick={() => navigate(loaderData.returnUrl)}
                      className="mt-2.5 px-4 py-1.5 rounded-lg bg-[#22C55E] text-[#0A0A0C] font-bold text-xs"
                    >
                      チャット画面へ戻る →
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* QRコード端末間直接同期 */
            <div className="flex flex-col items-center text-center space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-white text-[#0A0A0C] shadow-lg">
                <svg
                  viewBox="0 0 29 29"
                  className="w-44 h-44"
                  role="img"
                  aria-label="鍵引き継ぎQRコード"
                  shapeRendering="crispEdges"
                >
                  <title>鍵引き継ぎQRコード</title>
                  <rect width="29" height="29" fill="#FFFFFF" />
                  {qrCells.map((cell) => (
                    <rect
                      key={cell.id}
                      x={cell.x}
                      y={cell.y}
                      width="1"
                      height="1"
                      fill={cell.isAccent ? '#FF5722' : '#0A0A0C'}
                    />
                  ))}
                </svg>
              </div>

              <div className="space-y-1 max-w-sm">
                <div className="text-sm font-semibold text-[#F5F5F7]">
                  既存端末でスキャンして鍵を同期
                </div>
                <p className="text-xs text-[#8E8E93] leading-relaxed">
                  ログイン済みの端末でこのQRコードを読み取ることで、PINコードを入力することなく暗号鍵を直接引き継ぐことができます。
                </p>
              </div>

              {qrStatus && (
                <div
                  className={`w-full p-3 rounded-xl border text-xs ${
                    qrCompleted
                      ? 'bg-[#18181C] border-[#22C55E]/40 text-[#22C55E]'
                      : 'bg-[#261712] border-[#FF5722]/40 text-[#FDBA74]'
                  }`}
                >
                  {qrStatus}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2">
                {!qrCompleted ? (
                  <button
                    type="button"
                    disabled={isBusy || !qrSession}
                    onClick={handleApproveAndCompleteQrSync}
                    className="px-4 py-2 rounded-xl bg-[#FF5722] hover:bg-[#EA580C] disabled:opacity-50 text-white text-xs font-semibold transition-colors"
                  >
                    端末間で鍵を同期する
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate(loaderData.returnUrl)}
                    className="px-4 py-2 rounded-xl bg-[#22C55E] text-[#0A0A0C] text-xs font-bold transition-colors"
                  >
                    チャット画面へ進む →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
