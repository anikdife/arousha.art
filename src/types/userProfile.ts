// src/types/userProfile.ts

export type UserRole = "owner" | "student" | "parent" | "teacher";
export type ClassYear = "3" | "5" | "7" | "9";

export type UserProfile = {
  uid: string;
  role: UserRole;
  displayName: string;
  email?: string;

  // Session tracking (used by owner users dashboard)
  lastSessionAt?: any;
  previousSessionAt?: any;

  // Student login identifier (optional)
  studentId?: string;
  
  // Student-specific fields
  classYear?: ClassYear;        // Only for students
  teacherEmail?: string;        // Only for students - teacher's email for linking
  parentId?: string;            // Only for students - linked parent UID (set when parent logs in)
  teacherId?: string;           // Only for students - linked teacher UID (set when teacher logs in)

  // Linking fields
  linkedStudentUids?: string[];
  linkedParentUids?: string[];
  
  createdAt: any;
  updatedAt: any;
};