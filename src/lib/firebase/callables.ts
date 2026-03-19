import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase/firebase';

export type CreateStudentAccountCallableInput = {
  displayName: string;
  pin: string;
  studentId?: string;
};

export type CreateStudentAccountCallableResult = {
  studentUid: string;
  studentId: string;
};

export type SignInStudentCallableInput = {
  studentId: string;
  pin: string;
};

export type SignInStudentCallableResult = {
  token: string;
  studentUid: string;
  studentId: string;
};

export type ListUsersForOwnerCallableResult = {
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

export type ListUsersForOwnerByRoleCallableInput = {
  role: 'student' | 'parent' | 'teacher' | 'owner';
};

export type UserRoleCountsForOwnerCallableResult = {
  total: number;
  students: number;
  parents: number;
  teachers: number;
  owners: number;
};

export type UnlinkStudentFromParentCallableInput = {
  studentUid: string;
};

export type UnlinkStudentFromParentCallableResult = {
  unlinked: boolean;
};

export type LinkStudentToParentUidCallableInput = {
  studentUid: string;
};

export type LinkStudentToParentUidCallableResult = {
  linked: boolean;
};

function asUserMessage(err: unknown): string {
  const code = String((err as any)?.code ?? '').toLowerCase();
  const msg = String((err as any)?.message ?? 'Request failed');

  // Common Firebase Functions error shapes:
  // - "functions/invalid-argument"
  // - "functions/permission-denied"
  // - "FirebaseError: ..."
  if (code.includes('permission-denied') || msg.includes('permission-denied')) return 'Not authorised.';
  if (code.includes('invalid-argument') || msg.includes('invalid-argument')) {
    return 'Please check the form values and try again.';
  }
  if (code.includes('unauthenticated') || msg.includes('unauthenticated')) return 'Please sign in and try again.';
  if (code.includes('already-exists') || msg.includes('already-exists')) return 'That Student ID is already in use.';

  return msg;
}

export async function createStudentAccountCallable(
  input: CreateStudentAccountCallableInput
): Promise<CreateStudentAccountCallableResult> {
  try {
    const fn = httpsCallable<CreateStudentAccountCallableInput, CreateStudentAccountCallableResult>(
      functions,
      'createStudentAccount'
    );
    const res = await fn(input);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}

export async function signInStudentCallable(
  input: SignInStudentCallableInput
): Promise<SignInStudentCallableResult> {
  try {
    const fn = httpsCallable<SignInStudentCallableInput, SignInStudentCallableResult>(
      functions,
      'signInStudent'
    );
    const res = await fn(input);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}

export async function listUsersForOwnerCallable(): Promise<ListUsersForOwnerCallableResult> {
  try {
    const fn = httpsCallable<undefined, ListUsersForOwnerCallableResult>(functions, 'listUsersForOwner');
    const res = await fn(undefined);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}

export async function listUsersForOwnerByRoleCallable(
  input: ListUsersForOwnerByRoleCallableInput
): Promise<ListUsersForOwnerCallableResult> {
  try {
    const fn = httpsCallable<ListUsersForOwnerByRoleCallableInput, ListUsersForOwnerCallableResult>(
      functions,
      'listUsersForOwnerByRole'
    );
    const res = await fn(input);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}

export async function getUserRoleCountsForOwnerCallable(): Promise<UserRoleCountsForOwnerCallableResult> {
  try {
    const fn = httpsCallable<undefined, UserRoleCountsForOwnerCallableResult>(functions, 'getUserRoleCountsForOwner');
    const res = await fn(undefined);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}

export async function unlinkStudentFromParentCallable(
  input: UnlinkStudentFromParentCallableInput
): Promise<UnlinkStudentFromParentCallableResult> {
  try {
    const fn = httpsCallable<UnlinkStudentFromParentCallableInput, UnlinkStudentFromParentCallableResult>(
      functions,
      'unlinkStudentFromParent'
    );
    const res = await fn(input);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}

export async function linkStudentToParentUidCallable(
  input: LinkStudentToParentUidCallableInput
): Promise<LinkStudentToParentUidCallableResult> {
  try {
    const fn = httpsCallable<LinkStudentToParentUidCallableInput, LinkStudentToParentUidCallableResult>(
      functions,
      'linkStudentToParentUid'
    );
    const res = await fn(input);
    return res.data;
  } catch (err) {
    throw new Error(asUserMessage(err));
  }
}
