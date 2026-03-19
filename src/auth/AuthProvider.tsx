// src/auth/AuthProvider.tsx

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User, 
  onAuthStateChanged, 
  signInWithPopup,
  GoogleAuthProvider,
  signInWithCustomToken,
  signOut as firebaseSignOut
} from 'firebase/auth';
import { auth } from '../firebase/firebase';
import { UserProfile, UserRole } from '../types/userProfile';
import { getUserProfile, ensureUserProfileAfterLogin, establishConnectionsOnLogin, recordUserSession, setUserRole } from '../lib/userProfileService';
import { isProjectOwner } from '../lib/isProjectOwner';
import { signInStudentCallable } from '../lib/firebase/callables';

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: (roleIfFirstLogin?: UserRole) => Promise<void>;
  ensureUserProfileForCurrentUser: (roleIfFirstLogin: UserRole) => Promise<void>;
  refreshUserProfile: () => Promise<void>;
  signInWithStudentIdPin: (studentId: string, pin: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const signInWithGoogle = async (roleIfFirstLogin?: UserRole) => {
    console.log('signInWithGoogle called with role:', roleIfFirstLogin);
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    const user = result.user;

    try {
      // If a profile already exists, load it and proceed without requiring a role.
      const existing = await getUserProfile(user.uid);
      if (existing) {
        setUserProfile(existing);
        return;
      }

      // First-time login: only create the profile if a role was provided.
      if (roleIfFirstLogin) {
        const profile = await ensureUserProfileAfterLogin({
          uid: user.uid,
          email: user.email || undefined,
          displayName: user.displayName || undefined,
          role: roleIfFirstLogin,
        });

        console.log('Profile created:', profile);
        setUserProfile(profile);
        return;
      }

      // No existing profile and no role provided: leave userProfile null.
      // The UI will prompt the user to choose a role.
      setUserProfile(null);
    } catch (error) {
      console.error('Error ensuring user profile:', error);
      throw error;
    }
  };

  const ensureUserProfileForCurrentUser = async (roleIfFirstLogin: UserRole) => {
    const user = auth.currentUser;
    if (!user) {
      throw new Error('No authenticated user');
    }

    const profile = await ensureUserProfileAfterLogin({
      uid: user.uid,
      email: user.email || undefined,
      displayName: user.displayName || undefined,
      role: roleIfFirstLogin,
    });

    setUserProfile(profile);
  };

  const refreshUserProfile = async () => {
    const user = auth.currentUser;
    if (!user) {
      setUserProfile(null);
      return;
    }

    const profile = await getUserProfile(user.uid);
    setUserProfile(profile);
  };

  const signInWithStudentIdPin = async (studentId: string, pin: string) => {
    const res = await signInStudentCallable({ studentId, pin });
    await signInWithCustomToken(auth, res.token);
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      console.log('Auth state changed:', user ? `User: ${user.uid}` : 'No user');
      setCurrentUser(user);
      
      if (user) {
        // Load user profile from Firestore
        try {
          let profile = await getUserProfile(user.uid);
          console.log('Profile loaded from Firestore:', profile);

          // If this account is a project owner (same method used by OwnerRoute),
          // make sure their Firestore profile exists and is marked as role=owner.
          // This keeps Firebase Storage rules (adminReading/adminBanks writes) in sync.
          if (isProjectOwner(user, profile)) {
            if (!profile) {
              profile = await ensureUserProfileAfterLogin({
                uid: user.uid,
                email: user.email || undefined,
                displayName: user.displayName || undefined,
                role: 'owner',
              });
            } else if (profile.role !== 'owner') {
              await setUserRole(user.uid, 'owner');
              profile = (await getUserProfile(user.uid)) || profile;
            }
          }

          if (profile) {
            // Record simple session timestamps for parents so owners can view recent activity.
            // (Write is allowed only to the user's own profile by Firestore rules.)
            if (profile.role === 'parent') {
              try {
                await recordUserSession(user.uid);
              } catch (err) {
                console.error('Error recording user session:', err);
              }
            }

            // For existing parent/teacher users, check for new student connections
            if (profile.role === 'parent' || profile.role === 'teacher') {
              try {
                const legacyLinked = (profile as any)?.linkedStudentIds as unknown;
                const newLinked = (profile as any)?.linkedStudentUids as unknown;

                const hasLegacyLinked = Array.isArray(legacyLinked) && legacyLinked.length > 0;
                const hasNewLinked = Array.isArray(newLinked) && newLinked.length > 0;

                // Only attempt email-based connection discovery if we don't already
                // have linked students. (Email-based discovery requires broader
                // Firestore read permissions and can be disabled by rules.)
                if (!hasLegacyLinked && !hasNewLinked) {
                  await establishConnectionsOnLogin(profile);
                }

                // Reload profile to get any newly linked students
                const updatedProfile = await getUserProfile(user.uid);
                setUserProfile(updatedProfile || profile);
              } catch (err) {
                // Connection establishment may require broader Firestore permissions than
                // we grant in rules; keep the existing profile rather than forcing users
                // into the "Create Profile" flow.
                console.error('Error establishing connections on login:', err);
                setUserProfile(profile);
              }
            } else {
              setUserProfile(profile);
            }
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.error('Error loading user profile:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value: AuthContextType = {
    currentUser,
    userProfile,
    loading,
    signInWithGoogle,
    ensureUserProfileForCurrentUser,
    refreshUserProfile,
    signInWithStudentIdPin,
    signOut,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}