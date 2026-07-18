import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';

export function useFirebase() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;
    let authSubscriptionFired = false;
    let redirectCheckDone = false;

    const checkCompletion = () => {
      console.info('useFirebase: checkCompletion:', {
        authSubscriptionFired,
        redirectCheckDone,
        isMounted,
        currentUser: auth.currentUser?.uid,
      });
      if (authSubscriptionFired && redirectCheckDone) {
        if (isMounted) {
          console.info('useFirebase: setting loading to false');
          setLoading(false);
        }
      }
    };

    console.info('useFirebase: Calling getRedirectResult');
    getRedirectResult(auth)
      .then((result) => {
        if (isMounted) {
          console.info(
            'useFirebase: getRedirectResult resolved with:',
            result ? result.user.uid : null
          );
          redirectCheckDone = true;
          checkCompletion();
        }
      })
      .catch((err) => {
        console.error('useFirebase: Redirect Sign-In Error:', err);
        if (isMounted) {
          setError(err as Error);
          redirectCheckDone = true;
          checkCompletion();
        }
      });

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!isMounted) return;
      console.info(
        'useFirebase: onAuthStateChanged fired, user:',
        currentUser?.uid
      );
      setUser(currentUser);
      if (currentUser) {
        try {
          const idToken = await currentUser.getIdToken();
          setToken(idToken);
          // バックエンド側とのセッション共通化のため Cookie に userId をセット
          // biome-ignore lint/suspicious/noDocumentCookie: Cookie needs to be written synchronously to match SSR authentication expectations
          document.cookie = `userId=${currentUser.uid}; path=/; max-age=86400; SameSite=Strict`;
        } catch (err) {
          console.error('Failed to get Firebase ID token:', err);
          setToken(null);
        }
      } else {
        setToken(null);
        // ログアウト時は Cookie からセッション情報を消去
        // biome-ignore lint/suspicious/noDocumentCookie: Cookie needs to be cleared synchronously
        document.cookie = 'userId=; path=/; max-age=0; SameSite=Strict';
      }
      authSubscriptionFired = true;
      checkCompletion();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const loginWithGoogle = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      if (
        typeof window !== 'undefined' &&
        window.location.protocol !== 'https:' &&
        window.location.hostname === 'localhost'
      ) {
        console.info(
          'useFirebase: Fallback to signInWithPopup on http://localhost'
        );
        const result = await signInWithPopup(auth, provider);
        const idToken = await result.user.getIdToken();
        setToken(idToken);
        // biome-ignore lint/suspicious/noDocumentCookie: Cookie needs to be written synchronously to match SSR authentication expectations
        document.cookie = `userId=${result.user.uid}; path=/; max-age=86400; SameSite=Strict`;
        setUser(result.user);
        setLoading(false);
      } else {
        await signInWithRedirect(auth, provider);
      }
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setToken(null);
      setUser(null);
    } catch (err) {
      console.error('Sign-Out Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    user,
    token,
    loading,
    error,
    loginWithGoogle,
    logout,
  };
}
