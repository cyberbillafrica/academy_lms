import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { useAuthStore } from "../../store/authStore";
import toast from "react-hot-toast";

interface AssignedAssessment {
  id: string; // assessment_assignments.id
  assessment_id: string;
  assigned_at: string;
  assessments: {
    title: string;
    instructions: string | null;
    assessment_type: string;
    max_score: number;
    due_date: string | null;
    modules: {
      title: string;
      module_order: number;
    } | null;
  } | null;
  // Resolved on client side manually to circumvent database relation cache limitations
  submissions: {
    id: string;
    submission_text: string;
    grade: number | null;
    feedback: string | null;
    submitted_at: string;
  }[];
}

function isValidUrl(url: string) {
  try {
    new URL(url.trim());
    return true;
  } catch {
    return false;
  }
}

export default function AssessmentSubmissionDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedAssessment = searchParams.get("assessment");
  const assignmentRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [assignments, setAssignments] = useState<AssignedAssessment[]>([]);
  const [loading, setLoading] = useState(true);

  // Form link state records tied dynamically to assignment row IDs
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [inputUrls, setInputUrls] = useState<Record<string, string>>({});
  const [highlightedAssessment, setHighlightedAssessment] = useState<string | null>(null);

  const fetchStudentAssignedMatrix = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      // 1. Query structural assessments explicitly mapped to this student user
      const { data: assignedData, error: assignedErr } = await supabase
        .from("assessment_assignments")
        .select(`
          id,
          assessment_id,
          assigned_at,
          assessments (
            title,
            instructions,
            assessment_type,
            max_score,
            due_date,
            modules (title, module_order)
          )
        `)
        .eq("student_id", profile.id);

      if (assignedErr) throw assignedErr;

      // 2. Query independent flat submissions table for matches tied to this student user
      const { data: submissionsData, error: subErr } = await supabase
        .from("submissions")
        .select(`id, assessment_id, submission_text, grade, feedback, submitted_at`)
        .eq("student_id", profile.id);

      if (subErr) throw subErr;

      // 3. Perform programmatic cross-join mapping safely on the client container
      const combinedMatrix: AssignedAssessment[] = (assignedData as any[])?.map((item) => {
        const matchingSubs = submissionsData?.filter(s => s.assessment_id === item.assessment_id) || [];
        return {
          ...item,
          submissions: matchingSubs
        };
      }) || [];

      setAssignments(combinedMatrix);

      // Pre-populate controlled text strings using active submissions entries found
      const activeUrls: Record<string, string> = {};
      combinedMatrix.forEach((item) => {
        if (item.submissions && item.submissions.length > 0) {
          activeUrls[item.id] = item.submissions[0].submission_text;
        }
      });
      setInputUrls(activeUrls);
      if (selectedAssessment) {
  requestAnimationFrame(() => {
    const target = assignmentRefs.current[selectedAssessment];

    if (target) {
      target.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      setHighlightedAssessment(selectedAssessment);

      setTimeout(() => {
        setHighlightedAssessment(null);
      }, 4000);
    }
  });
}
    } catch (err: any) {
      toast.error(`Workspace loading error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile && profile.role !== "student") {
      navigate("/dashboard", { replace: true });
      return;
    }
    fetchStudentAssignedMatrix();
  }, [profile, navigate, fetchStudentAssignedMatrix]);

  const handleCommitSubmission = async (assignment: AssignedAssessment) => {
    const targetUrl = inputUrls[assignment.id]?.trim();
    if (!targetUrl || !isValidUrl(targetUrl)) {
      toast.error("Please insert a valid, accessible external workspace URL (e.g., GitHub, Drive).");
      return;
    }

    setSubmittingId(assignment.id);
    try {
      const existingSub = assignment.submissions?.[0];

      if (existingSub) {
        // Locked state enforcement check if evaluated by an instructor
        if (existingSub.grade !== null) {
          toast.error("This workspace evaluation has been finalized and locked by your instructor.");
          return;
        }

        // UPDATE target link path
        const { error } = await supabase
          .from("submissions")
          .update({
            submission_text: targetUrl,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", existingSub.id);

        if (error) throw error;
        toast.success("Submission updated successfully!");
      } else {
        // INSERT brand new row mapping entry
        const { error } = await supabase
          .from("submissions")
          .insert([
            {
              assessment_id: assignment.assessment_id,
              student_id: profile?.id,
              submission_text: targetUrl,
              submitted_at: new Date().toISOString(),
              grade: null,
              feedback: null,
            },
          ]);

        if (error) throw error;
       toast.success("Assignment submitted successfully!");  }

      // Refresh matrix dependencies
      await fetchStudentAssignedMatrix();
    } catch (err: any) {
      toast.error(`Submission link execution failed: ${err.message}`);
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#3AAA35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans]">
      {/* Structural Branding Bar header matched to theme */}
      <header className="bg-gradient-to-r from-[#1B2A6B] to-[#1E3A8A] shadow-lg p-5">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-white font-[Syne] font-bold text-2xl tracking-tight">Student Submission Terminal</h1>
            <p className="text-blue-100 text-xs mt-0.5 font-light">Submit external links to cloud workspaces, repositories, or documentation</p>
          </div>
         <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/student/workspace")}
              className="text-white bg-[#3AAA35] hover:bg-[#2f8f2a] px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition"
            >
              ← Workspace
            </button>

            <button
              onClick={() => navigate("/dashboard")}
              className="text-white bg-white/10 hover:bg-white/20 border border-white/20 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition"
            >
              Dashboard
            </button>
          </div>
           </div>
          </header>

      <main className="max-w-5xl mx-auto p-6">
        {assignments.length === 0 ? (
          <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl text-gray-500 font-medium shadow-sm">
            No evaluations or tasks are mapped to your account right now.
          </div>
        ) : (
          <div className="space-y-6">
            {assignments.map((item) => {
              const assessment = item.assessments;
              const submission = item.submissions?.[0];
              const isGraded = submission?.grade !== null;

              return (
                <div key={item.id} ref={(el) => { assignmentRefs.current[item.assessment_id] = el;
                  }}
                  className={`bg-white rounded-2xl border p-6 shadow-sm flex flex-col md:flex-row gap-6 justify-between items-start transition-all duration-500 ${
                    highlightedAssessment === item.assessment_id
                      ? "border-blue-500 ring-4 ring-blue-100 shadow-xl scale-[1.01]"
                      : "border-gray-100 hover:border-gray-200/80"
                  }`}
                  >  
                  {/* Left Parameter Stack: Deliverable Scope Parameters */}
                  <div className="space-y-3 flex-1 w-full">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-md border border-slate-200/40">
                        Wk {assessment?.modules?.module_order} / {assessment?.modules?.title || "General Module"}
                      </span>
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-md">
                        {assessment?.assessment_type}
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-gray-900 tracking-tight flex items-center gap-2"> {highlightedAssessment === item.assessment_id && (
                <span className="text-blue-600 animate-pulse">👉</span> )}
                    {assessment?.title} 
                    </h2>
                    
                    {assessment?.instructions && (
                      <div className="text-xs text-gray-600 bg-slate-50/70 border border-slate-100/80 rounded-xl p-3 whitespace-pre-wrap leading-relaxed font-light">
                        {assessment.instructions}
                      </div>
                    )}

                    <div className="flex gap-4 text-[11px] font-medium text-gray-400 font-mono">
                      <p>Weight Threshold: {assessment?.max_score} pts</p>
                      <p>•</p>
                     <p>
                    Deadline:{" "}
                    {assessment?.due_date ? (
                      (() => {
                        const today = new Date();
                        const due = new Date(assessment.due_date);
                        const days = Math.ceil(
                          (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                        );

                        if (days < 0)
                          return <span className="text-red-600 font-bold">Overdue</span>;

                        if (days === 0)
                          return <span className="text-orange-600 font-bold">Today</span>;

                        if (days === 1)
                          return <span className="text-yellow-600 font-bold">Tomorrow</span>;

                        return due.toLocaleDateString([], { dateStyle: "short" });
                      })()
                    ) : (
                      "No Deadline"
                    )}
                  </p>
                    </div>

                    {submission?.feedback && (
                      <div className="mt-2 bg-amber-50/60 border border-amber-100 text-amber-950 rounded-xl p-3.5 text-xs leading-relaxed italic">
                        <span className="font-bold block tracking-wide not-italic uppercase text-[10px] text-amber-800 mb-1 font-sans">Instructor Feedback Summary:</span>
                        "{submission.feedback}"
                      </div>
                    )}
                  </div>
                {/* Right Parameter Stack: Workspace Target Assignment Form */}
                <div className="w-full md:w-80 bg-slate-50 border border-slate-200/50 p-4 rounded-2xl flex flex-col gap-4 justify-between shrink-0">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                        Execution Block
                      </span>
                      {submission ? (
                        isGraded ? (
                          <span className="text-xs font-bold bg-green-100 text-green-700 border border-green-200 px-3 py-1 rounded-full">
                            ✅ {submission.grade}/{assessment?.max_score}
                          </span>
                        ) : (
                          <span className="text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
                            ⏳ Awaiting Review
                          </span>
                        )
                      ) : (
                        <span className="text-xs font-bold bg-gray-100 text-gray-500 border border-gray-200 px-3 py-1 rounded-full">
                          📄 Not Submitted
                        </span>
                      )}
                    </div>

                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">
                      Workspace Link Destination URL
                    </label>
                    <input
                      type="url"
                      disabled={isGraded || submittingId === item.id}
                      placeholder="e.g. https://github.com/... or cloud link"
                      className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-50 transition disabled:opacity-60 text-gray-800"
                      value={inputUrls[item.id] || ""}
                      onChange={(e) =>
                        setInputUrls((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                    />
                  </div>

                  <button
                    disabled={isGraded || submittingId === item.id}
                    onClick={() => handleCommitSubmission(item)}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider shadow-sm transition-all ${
                      isGraded
                        ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                        : submission
                        ? "bg-amber-600 hover:bg-amber-700 text-white"
                        : "bg-[#3AAA35] hover:bg-emerald-700 text-white"
                    }`}
                  >
                   {submittingId === item.id
                  ? "💾 Saving..."
                  : isGraded
                  ? "✅ Evaluation Finalized"
                  : submission
                  ? "✏️ Update Submission"
                  : "📄 Submit Assignment"}
                  </button>
                  
                  {submission && (
                    <p className="text-center text-[10px] text-gray-400 font-mono">
                      Synced:{" "}
                      {new Date(submission.submitted_at).toLocaleString([], {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  )}
                </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}