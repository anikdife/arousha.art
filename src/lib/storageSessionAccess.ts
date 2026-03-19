import { UserProfile } from '../types/userProfile';

export function getActiveStudentUid(
  userProfile: UserProfile | null, 
  currentUserUid: string, 
  selectedStudentUid?: string
): string | null {
  if (!userProfile) return null;

  if (userProfile.role === 'student') {
    return currentUserUid;
  }

  // For simple auth flow, parents/teachers access their own sessions
  return currentUserUid;
}