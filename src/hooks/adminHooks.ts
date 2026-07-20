import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// ── Types ──
export interface EnrollmentCode {
  id: number; code: string; used: boolean; used_by: string | null; created_at: string;
}
export interface ProfileItem {
  id: string; full_name: string | null; email: string | null; role: string;
  specialization_track: string | null; active: boolean; phone_number: string | null;
  avatar_url?: string | null; created_at: string | null;
}
export interface CourseItem {
  id: string; title: string; is_global: boolean; instructor_id: string | null;
}
export interface Enrollment {
  id: string; student_id: string; course_id: string;
}

// ── Fetch functions ──
async function fetchMetrics() {
  const { data } = await supabase.from("enrollment_codes").select("used");
  if (!data) return { total: 0, used: 0, pending: 0 };
  const used = data.filter(c => c.used).length;
  return { total: data.length, used, pending: data.length - used };
}

async function fetchCodes(searchTerm: string, page: number) {
  const PAGE_SIZE = 5;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase.from("enrollment_codes").select("*", { count: "exact" });
  if (searchTerm.trim()) {
    const clean = searchTerm.trim().replace(/[%,()]/g, "\\$&");
    query = query.or(`code.ilike.%${clean}%,used_by.ilike.%${clean}%`);
  }
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, to);
  return { codes: (data as EnrollmentCode[]) ?? [], count: count ?? 0 };
}

async function fetchProfiles() {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, specialization_track, active, phone_number, avatar_url, created_at")
    .in("role", ["instructor", "student"])
    .order("full_name", { ascending: true });
  return (data as ProfileItem[]) ?? [];
}

async function fetchCourses() {
  const { data } = await supabase
    .from("courses")
    .select("id, title, is_global, course_instructors ( instructor_id )")
    .order("created_at", { ascending: false });
  return ((data ?? []) as any[]).map(c => ({
    id: c.id, title: c.title, is_global: c.is_global,
    instructor_id: c.course_instructors?.[0]?.instructor_id ?? null,
  }));
}

async function fetchEnrollments() {
  const { data } = await supabase.from("student_course_assignments").select("id, student_id, course_id");
  return (data as Enrollment[]) ?? [];
}

// ── Hooks ──
export function useMetrics() {
  return useQuery({ queryKey: ["metrics"], queryFn: fetchMetrics, staleTime: 10_000 });
}

export function useEnrollmentCodes(search: string, page: number) {
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["codes", search, page],
    queryFn: () => fetchCodes(search, page),
    staleTime: 5_000,
  });
  return {
    codes: data?.codes ?? [],
    totalFilteredCount: data?.count ?? 0,
    totalPages: Math.max(1, Math.ceil((data?.count ?? 0) / 5)),
    isLoading,
    isFetching,
  };
}

export function useProfiles() {
  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ["profiles"], queryFn: fetchProfiles, staleTime: 10_000,
  });
  return {
    profiles: data,
    instructors: data.filter(p => p.role === "instructor"),
    students: data.filter(p => p.role === "student"),
    isLoading, isFetching,
  };
}

export function useCourses() {
  return useQuery({ queryKey: ["courses"], queryFn: fetchCourses, staleTime: 10_000 });
}

export function useEnrollments() {
  return useQuery({ queryKey: ["enrollments"], queryFn: fetchEnrollments, staleTime: 10_000 });
}