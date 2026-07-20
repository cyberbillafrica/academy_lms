import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import QuizEngine from "../pages/QuizEngine";

export default function StudentQuizPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const navigate = useNavigate();

  // Fetch the assessment to get its title, type, etc.
  const { data: assessment, isLoading } = useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select(`id, title, assessment_type, max_score, due_date, module_id, time_limit_minutes, modules!inner(course_id)`)
        .eq("id", assessmentId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  if (isLoading) {
  return (
    
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-3">
        <img 
          src="/newlogo.svg"        // Change to your logo path
          alt="Loading..."
          className="w-20 h-20 animate-spin-slow" 
        />
        <p className="text-gray-500 text-sm font-medium">Loading...</p>
      </div>
    </div>
  );
}

  {/*if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#3AAA35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  } */}

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Assessment not found.</p>
      </div>
    );
  }

  return (
    <QuizEngine
      assessmentId={assessment.id}
      moduleId={assessment.module_id}           // present for module quizzes
      title={assessment.title}
      type={assessment.assessment_type as "Quiz" | "Exam"}
      dueDate={assessment.due_date}
      maxScore={assessment.max_score}
      timeLimitMinutes={assessment.time_limit_minutes}
      onComplete={() => navigate("/dashboard")}
    />
  );
}