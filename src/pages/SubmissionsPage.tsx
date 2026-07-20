import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

interface Submission {
  id: string;
  student_id: string;
  submission_text: string;
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
  profiles?: {
    full_name: string;
    email: string;
  } | null;
}

export default function SubmissionsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const assessmentId = searchParams.get("assessmentId");

  const [assessmentDetails, setAssessmentDetails] = useState<{ title: string; max_score: number } | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Evaluation editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inputPercentage, setInputPercentage] = useState("");
  const [inputFeedback, setInputFeedback] = useState("");
  const [savingGrade, setSavingGrade] = useState(false);

  const fetchSubmissionsData = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      // 1. Fetch metadata context
      const { data: assm, error: aErr } = await supabase
        .from("assessments")
        .select("title, max_score")
        .eq("id", assessmentId)
        .single();
      if (aErr) throw aErr;
      setAssessmentDetails(assm);

      // 2. Fetch submissions joined with student profile info
      const { data: subs, error: sErr } = await supabase
        .from("submissions")
        .select(`
          id, student_id, submission_text, grade, feedback, submitted_at,
          profiles:student_id ( full_name, email )
        `)
        .eq("assessment_id", assessmentId)
        .order("submitted_at", { ascending: false });
      if (sErr) throw sErr;

      setSubmissions((subs as any) || []);
    } catch (err: any) {
      setError(err.message || "Failed tracking evaluation matrix entries.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    fetchSubmissionsData();
  }, [fetchSubmissionsData]);

  const openGradeEditor = (sub: Submission) => {
    setEditingId(sub.id);
    // Grade is already stored as a percentage, matching student requirements
    setInputPercentage(sub.grade !== null ? sub.grade.toString() : "");
    setInputFeedback(sub.feedback ?? "");
  };

  const handleSaveGrade = async (subId: string) => {
    const pctNum = parseFloat(inputPercentage);
    if (isNaN(pctNum) || pctNum < 0 || pctNum > 100) {
      toast.error("Please enter a valid percentage grade between 0% and 100%");
      return;
    }

    setSavingGrade(true);
    try {
      const { error } = await supabase
        .from("submissions")
        .update({
          grade: pctNum,
          feedback: inputFeedback.trim() || null,
        })
        .eq("id", subId);

      if (error) throw error;

      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === subId ? { ...s, grade: pctNum, feedback: inputFeedback.trim() || null } : s
        )
      );
      toast.success("Grade data committed smoothly!");
      setEditingId(null);
    } catch (err: any) {
      toast.error(`Metrics assignment failed: ${err.message}`);
    } finally {
      setSavingGrade(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#3AAA35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-600 bg-red-50 rounded-xl m-6">{error}</div>;

  // Global aggregate metrics helper
  const totalSubmissions = submissions.length;
  const gradedCount = submissions.filter((s) => s.grade !== null).length;

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans]">
      <header className="bg-gradient-to-r from-[#1E3A8A] to-[#2563EB] shadow-xl p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-white font-[Syne] font-bold text-2xl">Evaluations Dashboard</h1>
            <p className="text-blue-100 text-xs mt-0.5">Target: {assessmentDetails?.title}</p>
          </div>
          <button
            onClick={() => navigate("/assessments")}
            className="text-white bg-white/20 px-4 py-2 rounded-lg text-sm hover:bg-white/30 transition"
          >
            Back to Assessments
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {/* Core Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Total Incoming Links</p>
            <p className="text-3xl font-bold">{totalSubmissions}</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <p className="text-sm text-gray-500">Evaluated Backlog</p>
            <p className="text-3xl font-bold">
              {gradedCount} / {totalSubmissions} Completed
            </p>
          </div>
        </div>

        {submissions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 bg-white rounded-xl border p-8">
            No student deliverables have been received for this evaluation path yet.
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((sub) => {
              const studentName = sub.profiles?.full_name || "Unknown Student";
              const studentEmail = sub.profiles?.email || sub.student_id;
              
              // Helper to show real weighting score for the admin alongside the requested percentage format
              const equivalentPoints = sub.grade !== null && assessmentDetails
                ? ((sub.grade / 100) * assessmentDetails.max_score).toFixed(1)
                : null;

              return (
                <div key={sub.id} className="bg-white rounded-xl border border-gray-100 p-5 shadow-sm space-y-4">
                  <div className="flex flex-wrap justify-between items-start gap-2 border-b border-gray-50 pb-3">
                    <div>
                      <h3 className="font-bold text-gray-900 text-base">{studentName}</h3>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">{studentEmail}</p>
                      <p className="text-[11px] text-gray-400 mt-2">
                        Submitted: {new Date(sub.submitted_at).toLocaleString()}
                      </p>
                    </div>

                    <div>
                      {sub.grade !== null ? (
                        <div className="text-right">
                          <span className="text-2xl font-black text-[#3AAA35]">{sub.grade}%</span>
                          {equivalentPoints && (
                            <p className="text-[11px] font-mono text-gray-400">
                              ({equivalentPoints} / {assessmentDetails?.max_score} pts)
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg">
                          Pending Grading
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Render the deliverable text cleanly as an external live hyperlink target */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-green-600 mb-1">
                      Student Project Deliverable URL
                    </h4>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                      <a
                        href={sub.submission_text}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 font-mono text-xs underline hover:text-blue-800 break-all max-w-[85%]"
                      >
                        {sub.submission_text}
                      </a>
                      <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded uppercase tracking-wide">
                        External Link ↗
                      </span>
                    </div>
                  </div>

                  {editingId === sub.id ? (
                    <div className="bg-slate-50/70 border border-gray-200 rounded-xl p-4 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                        <label className="text-xs font-bold text-gray-700 uppercase">
                          Score Percentage (%):
                        </label>
                        <div className="sm:col-span-3 text-gray-800 flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            className="w-32 border border-gray-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 bg-white"
                            value={inputPercentage}
                            placeholder="e.g. 95"
                            onChange={(e) => setInputPercentage(e.target.value)}
                          />
                          {inputPercentage && assessmentDetails && (
                            <span className="text-xs text-gray-400 font-mono">
                              ≈ {((parseFloat(inputPercentage) || 0) / 100 * assessmentDetails.max_score).toFixed(1)} / {assessmentDetails.max_score} points
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-start">
                        <label className="text-xs font-bold text-gray-700 uppercase mt-1.5">
                          Feedback Narrative:
                        </label>
                        <textarea
                          rows={2}
                          className="sm:col-span-3 w-full text-gray-800 border border-gray-300 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-blue-500 bg-white"
                          value={inputFeedback}
                          placeholder="Provide supportive feedback or revision requests..."
                          onChange={(e) => setInputFeedback(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-semibold bg-white text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={savingGrade}
                          onClick={() => handleSaveGrade(sub.id)}
                          className="px-4 py-1.5 bg-[#3AAA35] text-white rounded-lg text-xs font-bold uppercase tracking-wide hover:bg-emerald-700 transition"
                        >
                          {savingGrade ? "Saving..." : "Save Evaluation"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap justify-between items-center bg-slate-50/50 px-4 py-3 rounded-xl border border-slate-100 gap-2">
                      <div className="text-xs text-gray-600 max-w-[80%]">
                        <span className="font-bold text-gray-700">Instructor Feedback:</span>{" "}
                        {sub.feedback ? (
                          <span className="italic text-gray-800">"{sub.feedback}"</span>
                        ) : (
                          <span className="text-gray-400 font-light">No commentary documented yet.</span>
                        )}
                      </div>
                      <button
                        onClick={() => openGradeEditor(sub)}
                        className="text-[#F47920] hover:underline text-xs font-bold uppercase tracking-wider"
                      >
                        {sub.grade !== null ? "Change Grade" : "Evaluate Project"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}