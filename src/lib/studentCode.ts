export function generateStudentCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'STU-';
  
  // Use crypto.getRandomValues if available, fallback to Math.random
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(6);
    crypto.getRandomValues(array);
    for (let i = 0; i < 6; i++) {
      result += chars[array[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 6; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  
  return result;
}

export function validateStudentCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  
  // Must start with "STU-" followed by 6 alphanumeric characters
  const pattern = /^STU-[A-Z0-9]{6}$/;
  return pattern.test(code);
}