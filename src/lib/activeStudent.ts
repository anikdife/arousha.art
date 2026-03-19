const KEY_UID = 'activeStudentUid';
const KEY_NAME = 'activeStudentName';

export function setActiveStudent(uid: string, name?: string) {
  try {
    if (uid) sessionStorage.setItem(KEY_UID, uid);
    if (name) sessionStorage.setItem(KEY_NAME, name);
  } catch {
    // ignore
  }
}

export function getActiveStudentUid(): string | null {
  try {
    return sessionStorage.getItem(KEY_UID);
  } catch {
    return null;
  }
}

export function getActiveStudentName(): string | null {
  try {
    return sessionStorage.getItem(KEY_NAME);
  } catch {
    return null;
  }
}

export function clearActiveStudent() {
  try {
    sessionStorage.removeItem(KEY_UID);
    sessionStorage.removeItem(KEY_NAME);
  } catch {
    // ignore
  }
}
