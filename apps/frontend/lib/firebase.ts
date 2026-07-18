import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { env } from '@/env';

const firebaseConfig = JSON.parse(env.NEXT_PUBLIC_FIREBASE_CONFIG);

if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
  firebaseConfig.authDomain = window.location.host;
}

// 既に初期化済みの場合は既存のAppインスタンスを利用、無ければ新規に初期化
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
