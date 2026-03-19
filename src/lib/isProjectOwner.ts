import type { User } from 'firebase/auth';
import type { UserProfile } from '../types/userProfile';

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isProjectOwner(user: User | null | undefined, userProfile?: UserProfile | null): boolean {
  if (!user) return false;

  // Optional: if you later add `role: 'owner'` to your Firestore user profile.
  if ((userProfile as any)?.role === 'owner') return true;

  const ownerUids = new Set(parseCsvEnv(process.env.REACT_APP_OWNER_UIDS));
  const ownerEmails = new Set(parseCsvEnv(process.env.REACT_APP_OWNER_EMAILS).map((e) => e.toLowerCase()));

  // Fallback owner allow-list so local/dev works without env vars.
  // You can still override/extend this via REACT_APP_OWNER_EMAILS / REACT_APP_OWNER_UIDS.
  ownerEmails.add('anik.dife@gmail.com');

  if (ownerUids.has(user.uid)) return true;

  const email = (user.email ?? userProfile?.email ?? '').toLowerCase();
  if (email && ownerEmails.has(email)) return true;

  return false;
}
