import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

export interface SubmissionDetail {
  id: string;
  assessment_id: string;
  submission_text: string;
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  // Joined fields
  assessment_title: string;
  module_title?: string;
  course_title?: string;
}

async function fetchStudentSubmissions(studentId: string): Promise<SubmissionDetail[]> {
  const { data, error } = await supabase
    .from("submissions")
    .select(`
      id, assessment_id, submission_text, grade, feedback, submitted_at,
      assessments!inner (
        title,
        modules!inner (
          title,
          courses!inner (
            title
          )
        )
      )
    `)
    .eq("student_id", studentId)
    .order("submitted_at", { ascending: false });

  if (error) throw error;

  

  // Flatten the nested structure
  return (data ?? []).map((row: any) => ({
    id: row.id,
    assessment_id: row.assessment_id,
    submission_text: row.submission_text,
    grade: row.grade,
    feedback: row.feedback,
    submitted_at: row.submitted_at,
    assessment_title: row.assessments.title,
    module_title: row.assessments.modules?.title,
    course_title: row.assessments.modules?.courses?.title,
  }));
}

export function useStudentSubmissions(studentId: string | undefined) {
  return useQuery<SubmissionDetail[]>({
    queryKey: ["student-submissions", studentId],
    queryFn: () => fetchStudentSubmissions(studentId!),
    enabled: !!studentId,
  });
}

// Mutation for updating a submission (resubmit)
export function useResubmitSubmission() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submissionId, newUrl }: { submissionId: string; newUrl: string }) => {
      const { error } = await supabase
        .from("submissions")
        .update({ submission_text: newUrl })
        .eq("id", submissionId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-submissions"] });
      queryClient.invalidateQueries({ queryKey: ["submissions"] });
    },
  });
}