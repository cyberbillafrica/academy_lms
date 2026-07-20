export type UserRole = 'admin' | 'student';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  avatar_url?: string;
  created_at: string;
}

export interface Module {
  id: number;
  course_id: number;
  title: string;
  description?: string;
  week_number: number;
}

export interface Assessment {
  id: number;
  module_id: number;
  title: string;
  max_score: number;
}

export interface StudentScore {
  id: number;
  student_id: string;
  assessment_id: number;
  score: number;
  feedback?: string;
  created_at: string;
  assessment?: Assessment;
}

export interface AttendanceRecord {
  id: number;
  student_id: string;
  class_date: string;
  status: 'Present' | 'Absent' | 'Late';
}

export interface DashboardStats {
  totalStudents: number;
  avgAttendance: number;
  avgScore: number;
  totalModules: number;
}