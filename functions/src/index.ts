import * as crypto from 'crypto';

import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

admin.initializeApp();

type CreateStudentAccountInput = {
  displayName: string;
  pin: string;
  studentId?: string;
};

type CreateStudentAccountResult = {
  studentUid: string;
  studentId: string;
};

type SignInStudentInput = {
  studentId: string;
  pin: string;
};

type SignInStudentResult = {
  token: string;
  studentUid: string;
  studentId: string;
};

type ListUsersForOwnerResult = {
  users: Array<{
    uid: string;
    role?: string;
    displayName?: string;
    email?: string;
    studentId?: string;
    classYear?: string;
    teacherEmail?: string;
    parentId?: string;
    teacherId?: string;
    linkedStudentUids?: string[];
    linkedParentUids?: string[];
  }>;
};

type ListUsersForOwnerInput = {
  role: 'student' | 'parent' | 'teacher' | 'owner';
};

type UserRoleCountsForOwnerResult = {
  total: number;
  students: number;
  parents: number;
  teachers: number;
  owners: number;
};

type DeleteWritingAttemptInput = {
  studentUid: string;
  attemptId: string;
};

type DeleteWritingAttemptResult = {
  deleted: boolean;
  deletedStorage: boolean;
  deletedFirestore: boolean;
};

type UnlinkStudentFromParentInput = {
  studentUid: string;
};

type UnlinkStudentFromParentResult = {
  unlinked: boolean;
};

type LinkStudentToParentUidInput = {
  studentUid: string;
};

type LinkStudentToParentUidResult = {
  linked: boolean;
};

const PIN_RE = /^\d{4,6}$/;
const STUDENT_ID_RE = /^[A-Z]{2}-[A-Z0-9]{5}$/;

function normalizeStudentId(s: string): string {
  return s.trim().toUpperCase();
}

function randomStudentId(): string {
  // Format: AA-1234B (matches /^[A-Z]{2}-[A-Z0-9]{5}$/)
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  const a = letters[Math.floor(Math.random() * letters.length)];
  const b = letters[Math.floor(Math.random() * letters.length)];

  let tail = '';
  for (let i = 0; i < 5; i++) tail += chars[Math.floor(Math.random() * chars.length)];

  return `${a}${b}-${tail}`;
}

async function findExistingStudentUidByStudentId(
  db: FirebaseFirestore.Firestore,
  studentId: string
): Promise<string | null> {
  const snap = await db
    .collection('users')
    .where('studentId', '==', studentId)
    .limit(1)
    .get();

  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data() as any;
  return (data?.uid as string | undefined) ?? doc.id;
}

async function cleanupOrphanStudentReservation(params: {
  db: FirebaseFirestore.Firestore;
  studentId: string;
  studentUid: string;
}): Promise<void> {
  const { db, studentId, studentUid } = params;

  // Best-effort cleanup. This situation can happen if someone manually deletes
  // users/{uid} but leaves studentIdIndex/studentCredentials/auth behind.
  try {
    await Promise.all([
      db.doc(`studentCredentials/${studentUid}`).delete().catch(() => undefined),
      db.doc(`users/${studentUid}`).delete().catch(() => undefined),
      db.doc(`studentIdIndex/${studentId}`).delete().catch(() => undefined),
    ]);
  } catch {
    // ignore
  }

  try {
    await admin.auth().deleteUser(studentUid);
  } catch {
    // ignore (user may not exist)
  }
}

function hashPin(pin: string, salt: Buffer): Buffer {
  // Scrypt is a solid default for PIN hashing.
  return crypto.scryptSync(pin, salt, 32);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hasLinkedStudent(callerProfile: any, studentUid: string): boolean {
  if (!callerProfile) return false;
  const linkedUids = Array.isArray(callerProfile.linkedStudentUids) ? callerProfile.linkedStudentUids : [];
  const linkedIds = Array.isArray(callerProfile.linkedStudentIds) ? callerProfile.linkedStudentIds : [];
  return linkedUids.includes(studentUid) || linkedIds.includes(studentUid);
}

async function getCallerProfileOrThrow(db: FirebaseFirestore.Firestore, callerUid: string): Promise<any> {
  const snap = await db.doc(`users/${callerUid}`).get();
  if (!snap.exists) throw new HttpsError('permission-denied', 'Not authorised');
  return snap.data() as any;
}

function isAssessorRole(role: unknown): role is 'owner' | 'parent' | 'teacher' {
  return role === 'owner' || role === 'parent' || role === 'teacher';
}

export const unlinkStudentFromParent = onCall(
  { region: 'us-central1', cors: true },
  async (request): Promise<UnlinkStudentFromParentResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const data = (request.data ?? {}) as Partial<UnlinkStudentFromParentInput>;
    const studentUid = String(data.studentUid ?? '').trim();
    if (!studentUid) throw new HttpsError('invalid-argument', 'studentUid is required');

    const db = admin.firestore();
    const callerProfile = await getCallerProfileOrThrow(db, callerUid);
    const callerRole = callerProfile?.role;

    // Only parents/owners can unlink, and only for students they are linked to.
    if (callerRole !== 'parent' && callerRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Not authorised');
    }
    if (!hasLinkedStudent(callerProfile, studentUid)) {
      throw new HttpsError('permission-denied', 'Not authorised');
    }

    const parentDocRef = db.doc(`users/${callerUid}`);
    const studentDocRef = db.doc(`users/${studentUid}`);

    await db.runTransaction(async (tx) => {
      const [parentSnap, studentSnap] = await Promise.all([tx.get(parentDocRef), tx.get(studentDocRef)]);
      if (!parentSnap.exists) throw new HttpsError('permission-denied', 'Not authorised');
      if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found');

      const studentData = studentSnap.data() as any;
      const parentId = typeof studentData?.parentId === 'string' ? studentData.parentId : undefined;

      tx.update(parentDocRef, {
        linkedStudentUids: admin.firestore.FieldValue.arrayRemove(studentUid),
        linkedStudentIds: admin.firestore.FieldValue.arrayRemove(studentUid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const studentUpdate: Record<string, unknown> = {
        linkedParentUids: admin.firestore.FieldValue.arrayRemove(callerUid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // If the primary parentId was this parent, clear it.
      if (parentId === callerUid) {
        studentUpdate.parentId = admin.firestore.FieldValue.delete();
      }

      tx.update(studentDocRef, studentUpdate);
    });

    return { unlinked: true };
  }
);

export const linkStudentToParentUid = onCall(
  { region: 'us-central1', cors: true },
  async (request): Promise<LinkStudentToParentUidResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const data = (request.data ?? {}) as Partial<LinkStudentToParentUidInput>;
    const studentUid = String(data.studentUid ?? '').trim();
    if (!studentUid) throw new HttpsError('invalid-argument', 'studentUid is required');
    if (studentUid === callerUid) throw new HttpsError('invalid-argument', 'studentUid is invalid');

    const db = admin.firestore();
    const callerProfile = await getCallerProfileOrThrow(db, callerUid);
    const callerRole = callerProfile?.role;

    // Only parents/owners can link.
    if (callerRole !== 'parent' && callerRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Not authorised');
    }

    const parentDocRef = db.doc(`users/${callerUid}`);
    const studentDocRef = db.doc(`users/${studentUid}`);

    await db.runTransaction(async (tx) => {
      const [parentSnap, studentSnap] = await Promise.all([tx.get(parentDocRef), tx.get(studentDocRef)]);
      if (!parentSnap.exists) throw new HttpsError('permission-denied', 'Not authorised');
      if (!studentSnap.exists) throw new HttpsError('not-found', 'Student not found');

      const studentData = studentSnap.data() as any;
      const role = typeof studentData?.role === 'string' ? studentData.role : undefined;
      if (role !== 'student') throw new HttpsError('invalid-argument', 'Target user is not a student');

      const existingPrimaryParent = typeof studentData?.parentId === 'string' ? studentData.parentId : undefined;

      tx.update(parentDocRef, {
        linkedStudentUids: admin.firestore.FieldValue.arrayUnion(studentUid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const studentUpdate: Record<string, unknown> = {
        linkedParentUids: admin.firestore.FieldValue.arrayUnion(callerUid),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Only set the primary parentId if it's currently unset.
      if (!existingPrimaryParent) {
        studentUpdate.parentId = callerUid;
      }

      tx.update(studentDocRef, studentUpdate);
    });

    return { linked: true };
  }
);

export const createStudentAccount = onCall({ region: 'us-central1' }, async (request): Promise<CreateStudentAccountResult> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const data = (request.data ?? {}) as Partial<CreateStudentAccountInput>;
  const displayName = String(data.displayName ?? '').trim();
  const pin = String(data.pin ?? '').trim();
  const studentIdOverride = typeof data.studentId === 'string' ? normalizeStudentId(data.studentId) : undefined;

  if (!displayName) throw new HttpsError('invalid-argument', 'displayName is required');
  if (!PIN_RE.test(pin)) throw new HttpsError('invalid-argument', 'pin must be 4–6 digits');
  if (studentIdOverride && !STUDENT_ID_RE.test(studentIdOverride)) {
    throw new HttpsError('invalid-argument', 'studentId is invalid');
  }

  const db = admin.firestore();

  // Authorize: only owners/parents can create students
  const callerProfileSnap = await db.doc(`users/${callerUid}`).get();
  const callerRole = (callerProfileSnap.data() as any)?.role;
  if (callerRole !== 'owner' && callerRole !== 'parent') {
    throw new HttpsError('permission-denied', 'Not authorised');
  }

  let studentId = studentIdOverride ?? randomStudentId();

  // Ensure uniqueness via an index doc.
  // studentIdIndex/{STUDENT_ID} -> { uid, createdAt }
  // Retry a few times if we randomly collide.
  for (let attempt = 0; attempt < 10; attempt++) {
    const indexRef = db.doc(`studentIdIndex/${studentId}`);
    const indexSnap = await indexRef.get();
    if (!indexSnap.exists) {
      // Back-compat: if older data exists in users/{uid}.studentId but the index
      // doc was never written, treat it as taken and backfill the index.
      const existingUid = await findExistingStudentUidByStudentId(db, studentId);
      if (!existingUid) break;

      await indexRef.set(
        {
          uid: existingUid,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      if (studentIdOverride) {
        throw new HttpsError('already-exists', 'studentId already exists');
      }
      studentId = randomStudentId();
      continue;
    }

    // If a caller explicitly requests a studentId, and the reservation exists but the
    // referenced student document has been deleted, treat it as an orphan and free it.
    if (studentIdOverride) {
      const reservedUid = (indexSnap.data() as any)?.uid as string | undefined;
      if (reservedUid) {
        const reservedUserSnap = await db.doc(`users/${reservedUid}`).get();
        if (!reservedUserSnap.exists) {
          await cleanupOrphanStudentReservation({ db, studentId, studentUid: reservedUid });
          break;
        }
      }

      throw new HttpsError('already-exists', 'studentId already exists');
    }

    studentId = randomStudentId();
  }

  const indexRef = db.doc(`studentIdIndex/${studentId}`);

  // Create Auth user (no email/password here; this is just an identity container)
  const authUser = await admin.auth().createUser({ displayName });

  const studentDocRef = db.doc(`users/${authUser.uid}`);
  const parentDocRef = db.doc(`users/${callerUid}`);
  const credRef = db.doc(`studentCredentials/${authUser.uid}`);

  const salt = crypto.randomBytes(16);
  const pinHash = hashPin(pin, salt);

  try {
    await db.runTransaction(async (tx) => {
      const idx = await tx.get(indexRef);
      if (idx.exists) {
        throw new HttpsError('already-exists', 'studentId already exists');
      }

      tx.set(indexRef, {
        uid: authUser.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(studentDocRef, {
        uid: authUser.uid,
        role: 'student',
        displayName,
        studentId,
        linkedParentUids: admin.firestore.FieldValue.arrayUnion(callerUid),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      tx.set(
        parentDocRef,
        {
          linkedStudentUids: admin.firestore.FieldValue.arrayUnion(authUser.uid),
        },
        { merge: true }
      );

      // IMPORTANT: do NOT store pin or hash on users/{uid}
      tx.set(credRef, {
        algo: 'scrypt',
        saltB64: salt.toString('base64'),
        hashB64: pinHash.toString('base64'),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });

    // Optional: attach claims for later authorization
    await admin.auth().setCustomUserClaims(authUser.uid, {
      role: 'student',
      studentId,
    });

    return { studentUid: authUser.uid, studentId };
  } catch (err) {
    // If anything fails after creating auth user, attempt cleanup.
    try {
      await admin.auth().deleteUser(authUser.uid);
    } catch {
      // ignore cleanup failures
    }

    if (err instanceof HttpsError) throw err;
    throw new HttpsError('internal', 'Failed to create student account');
  }
});

export const signInStudent = onCall({ region: 'us-central1' }, async (request): Promise<SignInStudentResult> => {
  const data = (request.data ?? {}) as Partial<SignInStudentInput>;
  const studentId = normalizeStudentId(String(data.studentId ?? ''));
  const pin = String(data.pin ?? '').trim();

  if (!STUDENT_ID_RE.test(studentId)) {
    throw new HttpsError('invalid-argument', 'Invalid student ID or PIN');
  }
  if (!PIN_RE.test(pin)) {
    throw new HttpsError('invalid-argument', 'Invalid student ID or PIN');
  }

  const db = admin.firestore();

  const indexSnap = await db.doc(`studentIdIndex/${studentId}`).get();
  const studentUid = (indexSnap.data() as any)?.uid as string | undefined;
  if (!studentUid) {
    throw new HttpsError('invalid-argument', 'Invalid student ID or PIN');
  }

  const credSnap = await db.doc(`studentCredentials/${studentUid}`).get();
  const cred = credSnap.data() as any;
  const saltB64 = cred?.saltB64 as string | undefined;
  const hashB64 = cred?.hashB64 as string | undefined;
  if (!saltB64 || !hashB64) {
    throw new HttpsError('invalid-argument', 'Invalid student ID or PIN');
  }

  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = hashPin(pin, salt);
  if (!safeEqual(actual, expected)) {
    throw new HttpsError('invalid-argument', 'Invalid student ID or PIN');
  }

  let token: string;
  try {
    token = await admin.auth().createCustomToken(studentUid, {
      role: 'student',
      studentId,
    });
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    if (msg.includes('iam.serviceAccounts.signBlob') || msg.includes('insufficient-permission')) {
      throw new HttpsError(
        'internal',
        "Student login isn't configured on the server yet (missing IAM permission to sign tokens). Ask an admin to grant 'Service Account Token Creator' to the Cloud Functions runtime service account."
      );
    }
    throw new HttpsError('internal', 'Failed to sign in student');
  }

  return { token, studentUid, studentId };
});

export const listUsersForOwner = onCall({ region: 'us-central1' }, async (request): Promise<ListUsersForOwnerResult> => {
  const callerUid = request.auth?.uid;
  if (!callerUid) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const db = admin.firestore();

  const callerProfileSnap = await db.doc(`users/${callerUid}`).get();
  const callerRole = (callerProfileSnap.data() as any)?.role;
  if (callerRole !== 'owner') {
    throw new HttpsError('permission-denied', 'Owner access required');
  }

  const snap = await db.collection('users').get();
  const users = snap.docs.map((d) => {
    const data = d.data() as any;
    const uid = (data?.uid as string | undefined) ?? d.id;

    return {
      uid,
      role: typeof data?.role === 'string' ? data.role : undefined,
      displayName: typeof data?.displayName === 'string' ? data.displayName : undefined,
      email: typeof data?.email === 'string' ? data.email : undefined,
      studentId: typeof data?.studentId === 'string' ? data.studentId : undefined,
      classYear: typeof data?.classYear === 'string' ? data.classYear : undefined,
      teacherEmail: typeof data?.teacherEmail === 'string' ? data.teacherEmail : undefined,
      parentId: typeof data?.parentId === 'string' ? data.parentId : undefined,
      teacherId: typeof data?.teacherId === 'string' ? data.teacherId : undefined,
      linkedStudentUids: Array.isArray(data?.linkedStudentUids) ? data.linkedStudentUids.filter((x: any) => typeof x === 'string') : undefined,
      linkedParentUids: Array.isArray(data?.linkedParentUids) ? data.linkedParentUids.filter((x: any) => typeof x === 'string') : undefined,
    };
  });

  return { users };
});

// Delete a student's unassessed Year 3 writing attempt (Firestore + Storage).
// Intended for parents/teachers (linked to student) and owners.
export const deleteWritingUnassessedAttemptY3 = onCall(
  { region: 'us-central1', cors: true },
  async (request): Promise<DeleteWritingAttemptResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) throw new HttpsError('unauthenticated', 'Must be signed in.');

    const data = (request.data ?? {}) as Partial<DeleteWritingAttemptInput>;
    const studentUid = String(data.studentUid ?? '').trim();
    const attemptId = String(data.attemptId ?? '').trim();
    if (!studentUid) throw new HttpsError('invalid-argument', 'studentUid is required');
    if (!attemptId) throw new HttpsError('invalid-argument', 'attemptId is required');

    const db = admin.firestore();
    const callerProfile = await getCallerProfileOrThrow(db, callerUid);
    const callerRole = callerProfile?.role;

    if (!isAssessorRole(callerRole)) {
      throw new HttpsError('permission-denied', 'Not authorised');
    }

    if (callerRole !== 'owner' && !hasLinkedStudent(callerProfile, studentUid)) {
      throw new HttpsError('permission-denied', 'Not authorised');
    }

    const attemptRef = db.doc(`writingY3/${studentUid}/attempts/${attemptId}`);
    const attemptSnap = await attemptRef.get();
    if (!attemptSnap.exists) {
      // Idempotent: treat missing as already deleted.
      return { deleted: true, deletedStorage: true, deletedFirestore: true };
    }

    const attempt = attemptSnap.data() as any;
    if (attempt?.assessed === true) {
      throw new HttpsError('failed-precondition', 'Cannot delete an assessed writing attempt');
    }

    const answerStoragePath = typeof attempt?.answerStoragePath === 'string' ? attempt.answerStoragePath : null;

    let deletedStorage = true;
    if (answerStoragePath) {
      try {
        await admin.storage().bucket().file(answerStoragePath).delete();
      } catch (err: any) {
        // Treat missing as already-deleted; fail on other errors to avoid partial deletion.
        if (err?.code === 404) {
          deletedStorage = true;
        } else {
          throw new HttpsError('internal', 'Failed to delete writing answer file');
        }
      }
    }

    let deletedFirestore = true;
    try {
      await attemptRef.delete();
    } catch {
      deletedFirestore = false;
    }

    if (!deletedFirestore) {
      throw new HttpsError('internal', 'Failed to delete writing attempt');
    }

    return { deleted: true, deletedStorage, deletedFirestore };
  }
);

export const listUsersForOwnerByRole = onCall(
  { region: 'us-central1' },
  async (request): Promise<ListUsersForOwnerResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const data = (request.data ?? {}) as Partial<ListUsersForOwnerInput>;
    const role = data.role;
    if (role !== 'student' && role !== 'parent' && role !== 'teacher' && role !== 'owner') {
      throw new HttpsError('invalid-argument', 'role is required');
    }

    const db = admin.firestore();

    const callerProfileSnap = await db.doc(`users/${callerUid}`).get();
    const callerRole = (callerProfileSnap.data() as any)?.role;
    if (callerRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Owner access required');
    }

    const snap = await db.collection('users').where('role', '==', role).get();
    const users = snap.docs.map((d) => {
      const doc = d.data() as any;
      const uid = (doc?.uid as string | undefined) ?? d.id;

      return {
        uid,
        role: typeof doc?.role === 'string' ? doc.role : undefined,
        displayName: typeof doc?.displayName === 'string' ? doc.displayName : undefined,
        email: typeof doc?.email === 'string' ? doc.email : undefined,
        studentId: typeof doc?.studentId === 'string' ? doc.studentId : undefined,
        classYear: typeof doc?.classYear === 'string' ? doc.classYear : undefined,
        teacherEmail: typeof doc?.teacherEmail === 'string' ? doc.teacherEmail : undefined,
        parentId: typeof doc?.parentId === 'string' ? doc.parentId : undefined,
        teacherId: typeof doc?.teacherId === 'string' ? doc.teacherId : undefined,
        linkedStudentUids: Array.isArray(doc?.linkedStudentUids)
          ? doc.linkedStudentUids.filter((x: any) => typeof x === 'string')
          : undefined,
        linkedParentUids: Array.isArray(doc?.linkedParentUids)
          ? doc.linkedParentUids.filter((x: any) => typeof x === 'string')
          : undefined,
      };
    });

    return { users };
  }
);

export const getUserRoleCountsForOwner = onCall(
  { region: 'us-central1' },
  async (request): Promise<UserRoleCountsForOwnerResult> => {
    const callerUid = request.auth?.uid;
    if (!callerUid) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const db = admin.firestore();

    const callerProfileSnap = await db.doc(`users/${callerUid}`).get();
    const callerRole = (callerProfileSnap.data() as any)?.role;
    if (callerRole !== 'owner') {
      throw new HttpsError('permission-denied', 'Owner access required');
    }

    async function countRole(role: 'student' | 'parent' | 'teacher' | 'owner'): Promise<number> {
      const q = db.collection('users').where('role', '==', role);
      // Prefer aggregation counts when available.
      const anyQ = q as any;
      if (typeof anyQ.count === 'function') {
        const agg = await anyQ.count().get();
        const data = agg?.data?.();
        const c = data?.count;
        if (typeof c === 'number') return c;
      }
      const snap = await q.get();
      return snap.size;
    }

    const [students, parents, teachers, owners] = await Promise.all([
      countRole('student'),
      countRole('parent'),
      countRole('teacher'),
      countRole('owner'),
    ]);

    return {
      total: students + parents + teachers + owners,
      students,
      parents,
      teachers,
      owners,
    };
  }
);
