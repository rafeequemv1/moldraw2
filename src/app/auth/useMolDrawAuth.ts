import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient';

export const DESIGNATION_OPTIONS = [
  'Student',
  'Researcher',
  'Scientist',
  'Faculty',
  'Artist',
  'Educator',
  'Pharma',
  'Other',
] as const;

export type AuthMode = 'signin' | 'signup' | 'reset' | 'update-password';

export type AuthForm = {
  email: string;
  password: string;
  designation: string;
  instituteName: string;
};

const emptyForm: AuthForm = {
  email: '',
  password: '',
  designation: '',
  instituteName: '',
};

function displayNameFromEmail(email: string): string {
  const local = email.split('@')[0]?.trim() || 'Chemist';
  return local.replace(/[._-]+/g, ' ');
}

function cookieValue(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

export function useMolDrawAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [profileName, setProfileName] = useState('');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [authForm, setAuthForm] = useState<AuthForm>(emptyForm);
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);

  const signedIn = Boolean(session?.user);
  const authDisplayName = useMemo(() => {
    if (profileName) return profileName;
    const email = session?.user?.email || '';
    const metaName = String(session?.user?.user_metadata?.name || '').trim();
    return metaName || displayNameFromEmail(email);
  }, [profileName, session]);

  const fetchUserProfile = useCallback(async (userId: string) => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('users')
      .select('name,email,designation,institute_name')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) return null;
    setProfileName(String(data.name || '').trim());
    return data;
  }, []);

  const saveUserProfile = useCallback(
    async (userId: string, form: { email: string; name: string; designation: string; instituteName: string }) => {
      if (!supabase) return;
      await supabase.from('users').upsert(
        {
          id: userId,
          name: form.name.trim() || displayNameFromEmail(form.email),
          email: form.email.trim(),
          designation: form.designation || 'Other',
          institute_name: form.instituteName.trim() || null,
        },
        { onConflict: 'id' },
      );
    },
    [],
  );

  useEffect(() => {
    if (!supabase) return undefined;
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      if (data.session?.user?.id) void fetchUserProfile(data.session.user.id);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (!mounted) return;
      setSession(next);
      if (next?.user?.id) {
        void fetchUserProfile(next.user.id);
      } else {
        setProfileName('');
      }
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('update-password');
        setAuthError('');
        setAuthNotice('Enter a new password for your MolDraw account.');
        setAuthForm(form => ({ ...form, password: '' }));
        setShowAuthModal(true);
      }
    });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('signin') && !params.get('signup')) return;
    setAuthMode(params.get('signup') ? 'signup' : 'signin');
    setAuthError('');
    setAuthNotice('Sign in to open My designs and saved local drawings.');
    setShowAuthModal(true);
  }, []);

  const openAuthModal = useCallback((mode: AuthMode = 'signin', notice = '') => {
    setAuthMode(mode);
    setAuthError('');
    setAuthNotice(notice);
    setShowAuthModal(true);
  }, []);

  const closeAuthModal = useCallback(() => setShowAuthModal(false), []);

  const updateAuthForm = useCallback((field: keyof AuthForm, value: string) => {
    setAuthForm(form => ({ ...form, [field]: value }));
  }, []);

  const handleSignOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const handleAuthSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      setAuthError('');
      setAuthNotice('');
      if (!isSupabaseConfigured || !supabase) {
        setAuthError('Supabase is not configured yet.');
        return;
      }

      const email = authForm.email.trim();
      const password = authForm.password;
      const name = displayNameFromEmail(email);
      const designation = DESIGNATION_OPTIONS.includes(
        authForm.designation as (typeof DESIGNATION_OPTIONS)[number],
      )
        ? authForm.designation
        : '';
      const instituteName = authForm.instituteName.trim();
      const piqoVisitorId = cookieValue('piqo_visitor');

      if (authMode === 'reset' && !email) {
        setAuthError('Enter your email first.');
        return;
      }
      if (authMode === 'update-password' && !password) {
        setAuthError('Enter your new password.');
        return;
      }
      if (!['reset', 'update-password'].includes(authMode) && (!email || !password)) {
        setAuthError('Please fill all required fields.');
        return;
      }
      if (authMode === 'signup' && !designation) {
        setAuthError('Choose your designation.');
        return;
      }
      if (authMode !== 'reset' && password.length < 6) {
        setAuthError('Password must be at least 6 characters.');
        return;
      }

      setIsAuthLoading(true);
      try {
        if (authMode === 'reset') {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
          });
          if (error) throw error;
          setAuthNotice('Password reset link sent. Check your email.');
          setAuthForm(form => ({ ...form, password: '' }));
        } else if (authMode === 'update-password') {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          setAuthNotice('Password updated. You are signed in.');
          setAuthMode('signin');
          setAuthForm(form => ({ ...form, password: '' }));
          setShowAuthModal(false);
        } else if (authMode === 'signup') {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                name,
                designation,
                institute_name: instituteName || null,
                ...(piqoVisitorId ? { piqo_visitor_id: piqoVisitorId } : {}),
              },
              emailRedirectTo: window.location.origin,
            },
          });
          if (error) throw error;
          if (data.session?.user) {
            await saveUserProfile(data.session.user.id, { email, name, designation, instituteName });
            await fetchUserProfile(data.session.user.id);
            setShowAuthModal(false);
          } else {
            setAuthNotice('Account created. Check your email to confirm, then sign in.');
            setAuthMode('signin');
            setAuthForm(form => ({ ...form, password: '' }));
          }
        } else {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (data.user) {
            const profile = await fetchUserProfile(data.user.id);
            if (!profile) {
              await saveUserProfile(data.user.id, {
                email: data.user.email || email,
                name: String(data.user.user_metadata?.name || name),
                designation: String(data.user.user_metadata?.designation || 'Other'),
                instituteName: String(data.user.user_metadata?.institute_name || ''),
              });
            }
            setShowAuthModal(false);
          }
        }
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Could not complete sign in.');
      } finally {
        setIsAuthLoading(false);
      }
    },
    [authForm, authMode, fetchUserProfile, saveUserProfile],
  );

  return {
    session,
    signedIn,
    authDisplayName,
    showAuthModal,
    authMode,
    setAuthMode,
    authForm,
    authError,
    authNotice,
    isAuthLoading,
    openAuthModal,
    closeAuthModal,
    updateAuthForm,
    handleAuthSubmit,
    handleSignOut,
    defaultFeatureEmail: session?.user?.email || '',
  };
}
