import { useNavigate } from "react-router-dom";
import { useStudentSubmissions } from "../hooks/useStudentSubmissions";
import { useAuthStore } from "../store/authStore";
import CollapsibleCard from "./CollapsibleCard";

export default function SubmissionsSummaryCard() {
  const profile = useAuthStore((s) => s.profile);
  const { data: submissions = [], isLoading } = useStudentSubmissions(profile?.id);
  const navigate = useNavigate();

  const total = submissions.length;
  const avg = total > 0
    ? submissions.filter(s => s.grade != null).reduce((acc, s) => acc + (s.grade ?? 0), 0) / total
    : 0;

  return (
    <CollapsibleCard title="📁 My Portfolio" defaultOpen={true}>
      {isLoading ? (
        <div className="flex justify-center py-4"><div className="h-5 w-5 border-2 border-gray-300 border-t-[#3AAA35] rounded-full animate-spin" /></div>
      ) : (
        <div className="space-y-3 p-1">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-2xl font-black text-[#1B2A6B]">{total}</p>
              <p className="text-[10px] uppercase font-bold text-gray-400">Total Submitted</p>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-2xl font-black text-[#F47920]">{avg.toFixed(1)}%</p>
              <p className="text-[10px] uppercase font-bold text-gray-400">Average Grade</p>
            </div>
          </div>
          <button
            onClick={() => navigate("/student/submissions")}
            className="w-full bg-[#1B2A6B] text-white text-xs font-bold uppercase tracking-wider py-2 rounded-lg hover:bg-[#152154] transition"
          >
            Open Your Archive
          </button>
        </div>
      )}
    </CollapsibleCard>
  );
}