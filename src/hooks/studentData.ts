import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

// ── Types (can be imported from a shared types file) ──
export interface CourseAssignment {
  id: string;
  course_id: string;
  courses?: { id: string; title: string; description: string | null };
}

export interface ModuleProgressItem {
  id: string;
  module_id: string;
  module?: { id: string; title: string; module_order: number };
  completed: boolean;
  completed_at: string | null;
}

export interface AssessmentItem {
  id: string;
  title: string;
  instructions: string | null;
  due_date: string | null;
  assessment_type?: string;
  max_score?: number;
  modules?: { title: string } | null;
  user_submission?: {
    id: string;
    submission_text: string;
    grade: number | null;
    feedback: string | null;
  } | null;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  subject: string | null;
  body: string;
  is_read: boolean;
  sender_name: string | null;
  sender_role: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target_scope: string;
  created_at: string;
}

// ── Query Hooks ──

/** Fetch the student's assigned courses */
export function useStudentCourses(studentId: string | undefined) {
  return useQuery<CourseAssignment[]>({
    queryKey: ["student-courses", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .from("student_course_assignments")
        .select(`id, course_id, courses(id, title, description)`)
        .eq("student_id", studentId);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!studentId,
  });
}

/** Fetch all modules for the given course IDs */
export function useModulesForCourses(courseIds: string[]) {
  return useQuery({
    queryKey: ["modules", courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return [];
      const { data, error } = await supabase
        .from("modules")
        .select("id, title, module_order, course_id")
        .in("course_id", courseIds)
        .order("module_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: courseIds.length > 0,
  });
}

/** Fetch module progress for the student */
export function useModuleProgress(studentId: string | undefined) {
  return useQuery({
    queryKey: ["module-progress", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      
      const { data, error } = await supabase
        .from("module_progress")
        .select(`
          module_id,
          completed,
          progress_percentage,
          completed_at,
          module:modules (
            module_order,
            title
          )
        `)
        .eq("student_id", studentId)
        .order("module_order", { referencedTable: "modules", ascending: true });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
  });
}

export function useAssessments(courseIds: string[], studentId?: string) {
  return useQuery({
    queryKey: ["assessments", courseIds, studentId],
    queryFn: async () => {
      if (!studentId) return [];

      // Source 1: Course‑based assessments (via modules)
      let courseAssessments: any[] = [];
      if (courseIds.length > 0) {
        const { data: modules } = await supabase
          .from("modules")
          .select("id")
          .in("course_id", courseIds);
        const moduleIds = modules?.map((m) => m.id) ?? [];
        if (moduleIds.length > 0) {
          const { data, error } = await supabase
            .from("assessments")
             .select("id, title, instructions, due_date, assessment_type, max_score, module_id, modules(id, title, module_order)")
             .in("module_id", moduleIds)
            .order("due_date", { ascending: true });
          if (error) throw error;
         courseAssessments=(data??[]).map((a:any)=>({
              ...a,
              module:{
              id:a.modules?.id,
              title:a.modules?.title,
              module_order:a.modules?.module_order
              }
              }));
   }
      }

      // Source 2: Direct assignments from assessment_assignments
      const { data: directLinks, error: linkErr } = await supabase
        .from("assessment_assignments")
        .select("assessment_id")
        .eq("student_id", studentId);

      if (linkErr) throw linkErr;

      let directAssessments: any[] = [];
      if (directLinks && directLinks.length > 0) {
        const assessmentIds = directLinks.map((l) => l.assessment_id);
        const { data, error } = await supabase
          .from("assessments")
          .select("id, title, instructions, due_date, assessment_type, max_score, module_id, modules(id, title, module_order)")
          .in("id", assessmentIds)
          .order("due_date", { ascending: true });
        if (error) throw error;
       directAssessments=(data??[]).map((a:any)=>({
          ...a,
          module:{
          id:a.modules?.id,
          title:a.modules?.title,
          module_order:a.modules?.module_order
          }
          }));      }

      // Merge and deduplicate
      const mergedMap = new Map<string, any>();
      [...courseAssessments, ...directAssessments].forEach((a) => {
        mergedMap.set(a.id, a);
      });

      return Array.from(mergedMap.values());
    },
    enabled: !!studentId,
  });
}

/** Fetch submissions for the student */
export function useSubmissions(studentId: string | undefined) {
  return useQuery({
    queryKey: ["submissions", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .from("submissions")
        .select("id, assessment_id, submission_text, grade, feedback, submitted_at")
        .eq("student_id", studentId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
  });
}

/** Fetch attendance for the student */
export function useAttendance(studentId: string | undefined) {
  return useQuery({
    queryKey: ["attendance", studentId],
    queryFn: async () => {
      if (!studentId) return { present: 0, total: 0, percentage: 100 };
      const { data, error } = await supabase
        .from("attendance")
        .select("status")
        .eq("student_id", studentId);
      if (error) throw error;
      if (!data || data.length === 0) return { present: 0, total: 0, percentage: 100 };
      const present = data.filter((r) => r.status === "present" || r.status === "late").length;
      return { present, total: data.length, percentage: Math.round((present / data.length) * 100) };
    },
    enabled: !!studentId,
  });
}

/** Fetch direct messages for the student */
export function useDirectMessages(studentId: string | undefined) {
  return useQuery<DirectMessage[]>({
    queryKey: ["direct-messages", studentId],
    queryFn: async () => {
      if (!studentId) return [];
      const { data, error } = await supabase
        .from("direct_messages")
        .select("id, sender_id, recipient_id, subject, body, is_read, sender_name, sender_role, created_at")
        .or(`recipient_id.eq.${studentId},sender_id.eq.${studentId}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
    enabled: !!studentId,
  });
}

/** Fetch announcements */
export function useAnnouncements() {
  return useQuery<Announcement[]>({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("id, title, body, target_scope, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ── Mutation Hooks ──

export function useSubmitAssessment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assessmentId,
      studentId,
      submissionText,
    }: {
      assessmentId: string;
      studentId: string;
      submissionText: string;
    }) => {
      const { error } = await supabase.from("submissions").insert({
        assessment_id: assessmentId,
        student_id: studentId,
        submission_text: submissionText,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}

export function useSendMessageReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      senderId,
      recipientId,
      subject,
      body,
    }: {
      senderId: string;
      recipientId: string;
      subject: string;
      body: string;
    }) => {
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: senderId,
        recipient_id: recipientId,
        subject,
        body,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["direct-messages"] });
    },
  });
}

export function useMarkMessagesRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (messageIds: string[]) => {
      const { error } = await supabase
        .from("direct_messages")
        .update({ is_read: true })
        .in("id", messageIds);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["direct-messages"] });
    },
  });
}

export interface WorkspaceSubmission {
  id: string;
  assessment_id: string;
  submission_text: string;
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  assessment_title: string;
  assessment_type: string | null;
  due_date: string |null;
  max_score: number | null;
  module_title: string | null;
  course_title: string | null;
}

export function useWorkspaceSubmissions(studentId: string | undefined) {
  return useQuery<WorkspaceSubmission[]>({
    queryKey: ["workspace-submissions", studentId],
    queryFn: async () => {
      if (!studentId) return [];

      const { data, error } = await supabase
        .from("submissions")
        .select(`
          id,
          assessment_id,
          submission_text,
          grade,
          feedback,
          submitted_at,
          assessments!inner(
            title,
            assessment_type,
            due_date,
            max_score,
            modules(
              title,
              courses(
                title
              )
            )
          )
        `)
        .eq("student_id", studentId)
        .order("submitted_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        assessment_id: row.assessment_id,
        submission_text: row.submission_text,
        grade: row.grade,
        feedback: row.feedback,
        submitted_at: row.submitted_at,
        assessment_title: row.assessments.title,
        assessment_type: row.assessments.assessment_type,
        due_date: row.assessments.due_date,
        max_score: row.assessments.max_score,
        module_title: row.assessments.modules?.title ?? null,
        course_title: row.assessments.modules?.courses?.title ?? null,
      }));
    },
    enabled: !!studentId,
  });
}