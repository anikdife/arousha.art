// src/pages/auth/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthProvider';
import { getUserProfile } from '../../lib/userProfileService';
import { isProjectOwner } from '../../lib/isProjectOwner';
import type { UserRole } from '../../types/userProfile';

export const LoginPage: React.FC = () => {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingUser, setExistingUser] = useState<boolean | null>(null);
  const [showRolePrompt, setShowRolePrompt] = useState(false);
  const [roleLoading, setRoleLoading] = useState(false);

  const [studentId, setStudentId] = useState('');
  const [pin, setPin] = useState('');

  const {
    currentUser,
    userProfile,
    loading: authLoading,
    signInWithGoogle,
    ensureUserProfileForCurrentUser,
    signInWithStudentIdPin,
    signOut,
  } = useAuth();
  const navigate = useNavigate();

  // After login, route owners to /owner and everyone else to /dashboard
  useEffect(() => {
    if (!currentUser || authLoading) return;

    // If the account is signed-in but doesn't have a Firestore profile yet,
    // keep the user on this page until they choose a role.
    if (!userProfile && existingUser !== true) return;

    const target = isProjectOwner(currentUser, userProfile) ? '/owner' : '/dashboard';
    navigate(target, { replace: true });
  }, [currentUser, userProfile, existingUser, authLoading, navigate]);

  // Check if user profile exists when auth state changes
  useEffect(() => {
    const checkExistingUser = async () => {
      if (currentUser) {
        const profile = await getUserProfile(currentUser.uid);
        setExistingUser(!!profile);

        if (!profile) {
          setShowRolePrompt(true);
        }
      } else {
        setExistingUser(null);
        setShowRolePrompt(false);
      }
    };
    
    checkExistingUser();
  }, [currentUser]);

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      // Sign in with Google first. If this is a first-time login and no Firestore
      // profile exists yet, we'll prompt for parent/teacher and create it.
      await signInWithGoogle();
      setShowRolePrompt(false);
    } catch (error: any) {
      if (String(error?.message ?? '').includes('Role is required')) {
        setShowRolePrompt(true);
      } else {
        setError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRole = async (role: UserRole) => {
    setError('');
    setRoleLoading(true);
    try {
      await ensureUserProfileForCurrentUser(role);
      setShowRolePrompt(false);
    } catch (error: any) {
      setError(error?.message ?? 'Failed to create account');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleStudentSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      const normalizedId = studentId.trim().toUpperCase();
      const normalizedPin = pin.trim();

      if (!/^[A-Z]{2}-[A-Z0-9]{5}$/.test(normalizedId)) {
        setError('Student ID must match format like AR-ABCDE.');
        return;
      }

      if (!/^\d{4,6}$/.test(normalizedPin)) {
        setError('PIN must be 4 to 6 digits.');
        return;
      }

      await signInWithStudentIdPin(normalizedId, normalizedPin);
    } catch (error: any) {
      setError(error?.message ?? 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  // Only hide the page once we're ready to redirect. For first-time Google sign-ins,
  // we need to keep this page mounted so the role prompt can be shown.
  if (currentUser && (userProfile || existingUser === true)) {
    return null; // Will redirect via useEffect
  }

  const authProviders = [
    {
      key: 'google',
      label: 'Google',
      onClick: handleGoogleSignIn,
      enabled: true,
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M12 10.2v3.6h5.1c-.3 1.7-2 3.5-5.1 3.5A5.8 5.8 0 1 1 12 6.2c1.5 0 2.5.6 3.1 1.2l2.1-2.1C16 4.1 14.2 3.2 12 3.2A8.8 8.8 0 1 0 12 20.8c5.1 0 8.5-3.6 8.5-8.6 0-.6-.1-1-.2-1.5H12z"
          />
        </svg>
      ),
    },
    {
      key: 'facebook',
      label: 'Facebook',
      onClick: () => {},
      enabled: false,
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M13.5 22v-8h2.7l.4-3h-3.1V9.1c0-.9.2-1.5 1.5-1.5H16.8V5c-.3 0-1.4-.1-2.7-.1-2.6 0-4.4 1.6-4.4 4.6V11H7v3h2.7v8h3.8z"
          />
        </svg>
      ),
    },
    {
      key: 'apple',
      label: 'Apple',
      onClick: () => {},
      enabled: false,
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M16.6 13.1c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.7.8-3.4.8-.7 0-1.8-.8-3-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 6.9 1.1 9.2.7 1.1 1.6 2.4 2.8 2.3 1.1 0 1.5-.7 2.9-.7s1.7.7 2.9.7c1.2 0 2-1.1 2.7-2.2.9-1.3 1.2-2.5 1.2-2.6-.1 0-2.1-.8-2.1-3.3z"
          />
          <path
            fill="currentColor"
            d="M14.7 6.1c.6-.7 1-1.7.9-2.7-.9.1-2 .6-2.6 1.3-.6.7-1.1 1.7-.9 2.7 1 .1 2-.5 2.6-1.3z"
          />
        </svg>
      ),
    },
    {
      key: 'microsoft',
      label: 'Microsoft',
      onClick: () => {},
      enabled: false,
      icon: (
        <svg className="w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z" />
        </svg>
      ),
    },
  ] as const;

  const providerRadius = 84;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            Sign in to NAPLAN Practice
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Access your practice sessions and track progress
          </p>
        </div>

        <div className="bg-white shadow-lg rounded-lg">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left half: auth provider icons around center */}
            <div className="p-6 md:p-8">
              <div className="text-sm font-medium text-gray-700">Sign in with</div>

              <div className="mt-4 relative h-60 w-full">
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="h-12 w-12 rounded-full bg-gray-100 border border-gray-200" />
                </div>

                {authProviders.map((p, index) => {
                  const n = authProviders.length;
                  const angle = n <= 1 ? 0 : (index / n) * Math.PI * 2 - Math.PI / 2;
                  const x = Math.round(providerRadius * Math.cos(angle));
                  const y = Math.round(providerRadius * Math.sin(angle));
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={p.onClick}
                      disabled={loading || !p.enabled}
                      title={p.enabled ? `Continue with ${p.label}` : `${p.label} (coming soon)`}
                      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-14 w-14 rounded-full border border-gray-300 bg-white shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700"
                      style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
                    >
                      <span className="sr-only">{p.label}</span>
                      <span className="flex items-center justify-center">{p.icon}</span>
                    </button>
                  );
                })}
              </div>

              <div className="pt-2 text-xs text-gray-500 text-center">
                New here? We&apos;ll create your account on first sign-in
              </div>

              <div className="mt-4 text-center">
                <div className="text-base font-semibold text-gray-800">Don&apos;t have a student ID?</div>
                <div className="mt-1 text-xs text-gray-500">
                  Parents and teachers can create student IDs from their dashboard
                </div>
              </div>
            </div>

            {/* Right half: student login fields */}
            <div className="p-6 md:p-8">
              <div className="text-sm font-medium text-gray-700">Student sign in</div>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Student ID</label>
                  <input
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    disabled={loading}
                    placeholder="AR-ABCDE"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">PIN</label>
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    disabled={loading}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    type="password"
                    placeholder="4 to 6 digits"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  onClick={handleStudentSignIn}
                  disabled={loading}
                  className="w-full flex justify-center items-center px-4 py-3 border border-blue-600 rounded-lg shadow-sm bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>

                <div className="pt-2 text-xs text-gray-500 text-center">
                  Ask your parent or teacher if you don&apos;t have an ID yet
                </div>
              </div>
            </div>
          </div>

          {error && (
            <div className="px-6 md:px-8 pb-6">
              <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">{error}</div>
            </div>
          )}
        </div>
      </div>

      {showRolePrompt && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200 p-6">
            <div className="text-lg font-semibold text-gray-900">Choose account type</div>
            <div className="mt-2 text-sm text-gray-600">
              We couldn&apos;t find an existing account for this Google sign-in. Please choose who you are.
            </div>

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleSelectRole('parent')}
                disabled={roleLoading}
                className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Parent
              </button>
              <button
                type="button"
                onClick={() => handleSelectRole('teacher')}
                disabled={roleLoading}
                className="w-full px-4 py-3 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Teacher
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={async () => {
                  setShowRolePrompt(false);
                  await signOut();
                }}
                disabled={roleLoading}
                className="text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              {roleLoading && <div className="text-sm text-gray-500">Creating account…</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};