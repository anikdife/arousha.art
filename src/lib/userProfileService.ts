// src/lib/userProfileService.ts

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  arrayUnion,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs 
} from 'firebase/firestore';
import { db } from '../firebase/firebase';
import { UserProfile, UserRole, ClassYear } from '../types/userProfile';

export async function listAllUserProfiles(): Promise<UserProfile[]> {
  const usersRef = collection(db, 'users');
  const snapshot = await getDocs(usersRef);

  const out: UserProfile[] = [];
  for (const d of snapshot.docs) {
    const data = d.data() as any;
    const uid = (data?.uid as string | undefined) ?? d.id;
    out.push({ ...data, uid } as UserProfile);
  }

  return out;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const userDocRef = doc(db, 'users', uid);
  const userDoc = await getDoc(userDocRef);
  
  if (userDoc.exists()) {
    const data = userDoc.data() as any;

    // Some documents may not store uid in the payload; ensure it's always present.
    const normalized: any = { ...data, uid };

    // Back-compat: some older profiles used `linkedStudentIds` (and some data may use
    // capitalized keys in Firestore). These values were still student UIDs.
    const legacyLinked =
      (normalized as any).linkedStudentIds ?? (normalized as any).LinkedStudentIds;
    const currentLinked =
      (normalized as any).linkedStudentUids ?? (normalized as any).LinkedStudentUids;

    if ((!Array.isArray(currentLinked) || currentLinked.length === 0) && Array.isArray(legacyLinked)) {
      normalized.linkedStudentUids = legacyLinked;
    }

    return normalized as UserProfile;
  }
  
  return null;
}

export async function createUserProfile(profile: UserProfile): Promise<void> {
  const userDocRef = doc(db, 'users', profile.uid);
  await setDoc(userDocRef, profile);
}

export async function setUserRole(uid: string, role: UserRole): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  await updateDoc(userDocRef, {
    role,
    updatedAt: serverTimestamp(),
  });
}

export async function recordUserSession(uid: string): Promise<void> {
  const userDocRef = doc(db, 'users', uid);
  const snap = await getDoc(userDocRef);
  if (!snap.exists()) return;

  const data = snap.data() as any;
  const last = data?.lastSessionAt;

  await updateDoc(userDocRef, {
    previousSessionAt: last ?? null,
    lastSessionAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function ensureUserProfileAfterLogin(params: {
  uid: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
  classYear?: ClassYear;
  parentId?: string;
  teacherId?: string;
}): Promise<UserProfile> {
  const { uid, email, displayName, role, classYear, parentId, teacherId } = params;
  
  // Check if profile already exists
  const existingProfile = await getUserProfile(uid);
  if (existingProfile) {
    return existingProfile;
  }
  
  // Profile doesn't exist, role is required
  if (!role) {
    throw new Error('Role is required for first-time login');
  }
  
  const isParent = role === 'parent';

  const newProfile: UserProfile = {
    uid,
    role,
    // Parent schema requirements: displayName/email must always be present (empty string if unknown).
    displayName: isParent ? (displayName ?? '') : (displayName || email?.split('@')[0] || 'Anonymous User'),
    email: isParent ? (email ?? '') : email,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  
  // Add role-specific fields
  if (role === 'student') {
    if (!classYear) {
      throw new Error('Class year is required for students');
    }
    newProfile.classYear = classYear;
    if (parentId) newProfile.parentId = parentId;
    if (teacherId) newProfile.teacherId = teacherId;
  } else if (role === 'parent' || role === 'teacher') {
    // Parent schema requirement: ALWAYS an array for future-proof linking.
    newProfile.linkedStudentUids = [];
  }
  
  await createUserProfile(newProfile);
  
  // For parents/teachers, check if any students have linked their email
  if (newProfile.role === 'teacher') {
    await establishConnectionsOnLogin(newProfile);
    // Refetch the profile to get updated linkedStudentUids
    const updatedProfile = await getUserProfile(uid);
    return updatedProfile || newProfile;
  }
  
  return newProfile;
}

export async function linkStudentToEmail(
  studentUid: string,
  email: string,
  linkType: 'parent' | 'teacher'
): Promise<void> {
  if (linkType === 'parent') {
    throw new Error('Parent email linking is no longer supported. Link by parent UID instead.');
  }

  // Update student profile with email
  const studentDocRef = doc(db, 'users', studentUid);
  await updateDoc(studentDocRef, {
    teacherEmail: email.toLowerCase().trim(),
    updatedAt: serverTimestamp()
  });
}

export async function linkStudentToParentUid(studentUid: string, parentUid: string): Promise<void> {
  const normalizedParentUid = parentUid.trim();
  if (!normalizedParentUid) throw new Error('Parent UID is required');

  const studentDocRef = doc(db, 'users', studentUid);
  const parentDocRef = doc(db, 'users', normalizedParentUid);

  // Link both directions.
  await Promise.all([
    updateDoc(studentDocRef, {
      parentId: normalizedParentUid,
      linkedParentUids: arrayUnion(normalizedParentUid),
      updatedAt: serverTimestamp(),
    }),
    updateDoc(parentDocRef, {
      linkedStudentUids: arrayUnion(studentUid),
      updatedAt: serverTimestamp(),
    }),
  ]);
}

export async function establishConnectionsOnLogin(
  userProfile: UserProfile
): Promise<void> {
  const rawEmail = typeof userProfile.email === 'string' ? userProfile.email : '';
  if (!rawEmail) return;

  const userEmail = rawEmail.toLowerCase().trim();
  if (!userEmail) return;
  
  // Find students who have linked this email
  const usersRef = collection(db, 'users');
  let linkedStudents: string[] = [];
  
  if (userProfile.role === 'teacher') {
    const studentQuery = query(usersRef, where('teacherEmail', '==', userEmail));
    const studentDocs = await getDocs(studentQuery);
    
    for (const studentDoc of studentDocs.docs) {
      const studentData = studentDoc.data();
      const studentUid = (studentData as any)?.uid as string | undefined;
      if (!studentUid) continue;
      linkedStudents.push(studentUid);
      
      // Update student's teacherId to this user's UID
      await updateDoc(doc(db, 'users', studentUid), {
        teacherId: userProfile.uid,
        updatedAt: serverTimestamp()
      });
    }
  }
  
  // Update current user's profile with linked students
  if (linkedStudents.length > 0) {
    const userDocRef = doc(db, 'users', userProfile.uid);
    await updateDoc(userDocRef, {
      linkedStudentUids: linkedStudents,
      updatedAt: serverTimestamp()
    });
  }
}