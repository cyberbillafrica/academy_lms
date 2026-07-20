import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useStudentSubmissions, useResubmitSubmission, type SubmissionDetail } from "../hooks/useStudentSubmissions";
import toast from "react-hot-toast";

function isValidUrl(url: string) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export default function StudentSubmissionsPage() {
  const profile = useAuthStore((s) => s.profile);
  const navigate = useNavigate();

  const { data: submissions = [], isLoading } = useStudentSubmissions(profile?.id);
  const resubmitMutation = useResubmitSubmission();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");

  const handleResubmit = (submission: SubmissionDetail) => {
    if (!isValidUrl(editUrl.trim())) {
      toast.error("Please enter a valid URL");
      return;
    }
    resubmitMutation.mutate(
      { submissionId: submission.id, newUrl: editUrl.trim() },
      {
        onSuccess: () => {
          toast.success("Submission updated");
          setEditingId(null);
          setEditUrl("");
        },
        onError: (err: any) => toast.error(err.message),
      }
    );
  };

  if (!profile || profile.role !== "student") {
    navigate("/login", { replace: true });
    return null;
  }

  const avgGrade = submissions.filter(s => s.grade != null).reduce((acc, s) => acc + (s.grade ?? 0), 0) / (submissions.filter(s => s.grade != null).length || 1);

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans]">
      <header className="bg-gradient-to-r from-[#F47920] via-[#1E3A8A] to-[#2563EB] shadow-xl p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 className="text-white font-[Syne] font-bold text-2xl">My Submissions</h1>
          <button onClick={() => navigate("/dashboard")} className="text-white bg-black/20 px-4 py-2 rounded-lg text-sm">Back to Dashboard</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="w-10 h-10 border-4 border-[#3AAA35] border-t-transparent rounded-full animate-spin" /></div>
        ) : submissions.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No submissions yet.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow"><p className="text-sm text-gray-500">Total Submissions</p><p className="text-3xl font-bold">{submissions.length}</p></div>
              <div className="bg-white rounded-xl p-4 shadow"><p className="text-sm text-gray-500">Average Grade</p><p className="text-3xl font-bold">{avgGrade.toFixed(1)}%</p></div>
              <div className="bg-white rounded-xl p-4 shadow"><p className="text-sm text-gray-500">Graded</p><p className="text-3xl font-bold">{submissions.filter(s => s.grade != null).length}/{submissions.length}</p></div>
            </div>

            <div className="space-y-4">
              {submissions.map(sub => (
                <div key={sub.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div>
                      <span className="text-xs bg-[#1B2A6B]/10 text-[#1B2A6B] px-2 py-0.5 rounded">{sub.course_title} / {sub.module_title}</span>
                      <h3 className="font-bold mt-1">{sub.assessment_title}</h3>
                      <p className="text-xs text-gray-500 mt-1">Submitted: {new Date(sub.submitted_at).toLocaleDateString()}</p>
                    </div>
                    {sub.grade != null ? (
                      <span className="text-2xl font-black text-[#3AAA35]">{sub.grade}%</span>
                    ) : (
                      <span className="text-sm font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded">Pending</span>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <a href={sub.submission_text} target="_blank" rel="noreferrer" className="text-blue-600 underline font-mono truncate max-w-[300px]">{sub.submission_text}</a>
                  </div>

                  {sub.feedback && (
                    <div className="mt-2 bg-slate-50 rounded p-2 text-xs text-gray-700 italic">
                      Feedback: "{sub.feedback}"
                    </div>
                  )}

                  {/* Resubmit button only if not yet graded */}
                  {sub.grade === null && editingId !== sub.id && (
                    <button onClick={() => { setEditingId(sub.id); setEditUrl(sub.submission_text); }} className="mt-2 text-xs font-bold text-[#F47920] hover:underline">
                      Resubmit
                    </button>
                  )}

                  {editingId === sub.id && (
                    <div className="mt-3 flex gap-2 items-center">
                      <input
                        type="url"
                        value={editUrl}
                        onChange={(e) => setEditUrl(e.target.value)}
                        className="flex-1 text-xs border rounded px-3 py-1.5"
                        placeholder="New project URL"
                      />
                      <button onClick={() => handleResubmit(sub)} disabled={resubmitMutation.isLoading} className="bg-[#3AAA35] text-white text-xs font-bold px-3 py-1.5 rounded">
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-gray-500">Cancel</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}