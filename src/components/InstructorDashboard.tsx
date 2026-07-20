import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuthStore } from "../store/authStore";
import MessagesPanel from "./MessagesPanel";

type AttStatus = "present" | "absent" | "late";

type IconProps = { size?: number; className?: string };

function Users({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function CheckCircle({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function BookOpen({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

interface StudentRow {
  id: string;
  full_name: string | null;
  specialization_track: string | null;
}

interface PendingSubmission {
  id: string;
  student_id: string;
  submission_text: string | null;
  submission_link: string | null;
  submitted_at: string;
  grade: number | null;
  feedback_text: string | null;
  assessments?: { title: string; max_score: number } | null;
}

export default function InstructorDashboard() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const logout = useAuthStore((s) => s.logout);

  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  const [students, setStudents] = useState<StudentRow[]>([]);
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [stats, setStats] = useState({ totalStudents: 0, attendanceRate: 0, pendingSubmissions: 0 });

  // Attendance states
  const [attDate, setAttDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [attDrafts, setAttDrafts] = useState<Record<string, AttStatus>>({});
  const [savingAtt, setSavingAtt] = useState(false);
  const [attMsg, setAttMsg] = useState("");
  const [attMsgType, setAttMsgType] = useState<"success" | "error" | "">("");

  // Inline Evaluation Drawer panel state
  const [selectedSub, setSelectedSub] = useState<PendingSubmission | null>(null);
  const [gradeInput, setGradeInput] = useState("");
  const [feedbackInput, setFeedbackInput] = useState("");
  const [submittingGrade, setSubmittingGrade] = useState(false);

  const fetchInstructorData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: scaRows } = await supabase
        .from("student_course_assignments")
        .select("student_id");

      const myStudentIds = Array.from(
        new Set((scaRows ?? []).map((r) => r.student_id as string))
      );

      let roster: StudentRow[] = [];
      if (myStudentIds.length > 0) {
        const { data: studentRows } = await supabase
          .from("profiles")
          .select("id, full_name, specialization_track")
          .in("id", myStudentIds)
          .eq("role", "student")
          .order("full_name");
        roster = (studentRows as StudentRow[]) ?? [];
      }
      setStudents(roster);

      let subs: PendingSubmission[] = [];
      if (myStudentIds.length > 0) {
        const { data: subRows } = await supabase
          .from("submissions")
          .select(`
            id, student_id, submission_text, submission_link, submitted_at, grade, feedback_text,
            assessments ( title, max_score )
          `)
          .in("student_id", myStudentIds)
          .order("submitted_at", { ascending: false });
        
        subs = (subRows as any as PendingSubmission[]) ?? [];
      }
      setSubmissions(subs);
      const pending = subs.filter((s) => s.grade === null).length;

      let attendanceRate = 0;
      if (myStudentIds.length > 0) {
        const { data: attRows } = await supabase
          .from("attendance")
          .select("status")
          .in("student_id", myStudentIds);

        if (attRows && attRows.length > 0) {
          const present = attRows.filter((r) => r.status === "present" || r.status === "late").length;
          attendanceRate = Math.round((present / attRows.length) * 100);
        }
      }

      setStats({
        totalStudents: roster.length,
        attendanceRate,
        pendingSubmissions: pending,
      });
    } catch (error) {
      console.error("Error loading instructor insights:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync historical records whenever the target evaluation date changes
  const syncHistoricalAttendance = useCallback(async () => {
    if (students.length === 0 || !attDate) return;
    try {
      const studentIds = students.map((s) => s.id);
      const { data: existingRecords } = await supabase
        .from("attendance")
        .select("student_id, status")
        .eq("attendance_date", attDate)
        .in("student_id", studentIds);

      const freshDrafts: Record<string, AttStatus> = {};
      // Populate matches or backfill defaults
      students.forEach((s) => {
        const matchingRecord = existingRecords?.find((r) => r.student_id === s.id);
        freshDrafts[s.id] = matchingRecord ? (matchingRecord.status as AttStatus) : "present";
      });
      setAttDrafts(freshDrafts);
    } catch (err) {
      console.error("Failed loading target context history metrics:", err);
    }
  }, [students, attDate]);

  useEffect(() => {
    fetchInstructorData();
  }, [fetchInstructorData]);

  useEffect(() => {
    syncHistoricalAttendance();
  }, [syncHistoricalAttendance]);

  const nameFor = (studentId: string) =>
    students.find((s) => s.id === studentId)?.full_name || "Unknown student";

  const pendingList = submissions.filter((s) => s.grade === null);

  const statusFor = (studentId: string): AttStatus => attDrafts[studentId] ?? "present";

  const setStatusFor = (studentId: string, status: AttStatus) =>
    setAttDrafts((prev) => ({ ...prev, [studentId]: status }));

  const saveAttendance = async () => {
    setAttMsg("");
    setAttMsgType("");

    if (!profile?.id) {
      setAttMsg("Unable to verify your identity. Please refresh and try again.");
      setAttMsgType("error");
      return;
    }
    if (!attDate) {
      setAttMsg("Please choose a date.");
      setAttMsgType("error");
      return;
    }

    setSavingAtt(true);
    try {
      const rows = students.map((s) => ({
        student_id: s.id,
        attendance_date: attDate,
        status: statusFor(s.id),
        marked_by: profile.id,
      }));

      const { error } = await supabase
        .from("attendance")
        .upsert(rows, { onConflict: "student_id,attendance_date" });

      if (error) throw error;

      setAttMsg(`Attendance saved for ${rows.length} student(s) on ${attDate}.`);
      setAttMsgType("success");
      await fetchInstructorData();
    } catch (err: any) {
      setAttMsg(err.message || "Could not save attendance.");
      setAttMsgType("error");
    } finally {
      setSavingAtt(false);
    }
  };

  const handleOpenEvaluation = (sub: PendingSubmission) => {
    setSelectedSub(sub);
    setGradeInput(sub.grade !== null ? sub.grade.toString() : "");
    setFeedbackInput(sub.feedback_text ?? "");
  };

  const submitEvaluationGrade = async () => {
    if (!selectedSub) return;
    const cleanGrade = parseFloat(gradeInput);
    const maxPossible = selectedSub.assessments?.max_score ?? 100;

    if (isNaN(cleanGrade) || cleanGrade < 0 || cleanGrade > maxPossible) {
      alert(`Please assign a score between 0 and ${maxPossible}.`);
      return;
    }

    setSubmittingGrade(true);
    try {
      const { error } = await supabase
        .from("submissions")
        .update({
          grade: cleanGrade,
          feedback_text: feedbackInput.trim() || null,
        })
        .eq("id", selectedSub.id);

      if (error) throw error;

      setSelectedSub(null);
      await fetchInstructorData();
    } catch (err: any) {
      alert(err.message || "Error submitting evaluation criteria thresholds.");
    } finally {
      setSubmittingGrade(false);
    }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await supabase.auth.signOut();
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      console.error("Logout error:", err);
      logout();
      navigate("/login", { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-200">Loading Instructor Workspace...</div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 bg-slate-950 text-slate-100 min-h-screen">
      {/* Gradient Header */}
      <div className="bg-gradient-to-r from-[#1B2A6B] via-[#3AAA35] to-[#F47920] rounded-3xl p-8 text-white shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Instructor Console</h1>
            <p className="text-white/90 mt-2 text-lg">
              Manage your cohorts, track attendance, and evaluate submissions securely.
            </p>
          </div>

          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 active:scale-95 transition-all"
            aria-label="Log out"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {loggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
      </div>

      {/* Quick Actions Shortcuts */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => navigate("/courses")} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors">+ Manage Courses</button>
        <button onClick={() => navigate("/modules")} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition-colors">+ Manage Modules</button>
        <button onClick={() => navigate("/assessments")} className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-colors">+ Manage Assessments</button>
        <button onClick={() => navigate("/chat")} className="px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors">General Chat</button>
      </div>

      {/* Metric Pillar Row Blocks */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl flex items-center space-x-4">
          <div className="p-3 bg-blue-500/10 text-blue-400 rounded-lg"><Users size={24} /></div>
          <div>
            <p className="text-sm text-slate-400 font-medium">Active Roster</p>
            <p className="text-2xl font-bold text-white">{stats.totalStudents} Students</p>
          </div>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl flex items-center space-x-4">
          <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-lg"><CheckCircle size={24} /></div>
          <div>
            <p className="text-sm text-slate-400 font-medium">Avg Attendance</p>
            <p className="text-2xl font-bold text-white">{stats.attendanceRate}%</p>
          </div>
        </div>

        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl flex items-center space-x-4">
          <div className="p-3 bg-amber-500/10 text-amber-400 rounded-lg"><BookOpen size={24} /></div>
          <div>
            <p className="text-sm text-slate-400 font-medium">Pending Reviews</p>
            <p className="text-2xl font-bold text-white">{stats.pendingSubmissions} Submissions</p>
          </div>
        </div>
      </div>

      {/* Core Dual Architecture Layout panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Student Roster Profile Panel */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <h2 className="text-xl font-semibold text-white mb-4">My Students</h2>
          {students.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-center text-slate-500 text-sm">No students assigned yet.</div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-3">
                  <span className="text-sm font-medium text-slate-200">{s.full_name || "Unnamed"}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">{s.specialization_track || "Core Path"}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Dynamic Interactive Submissions Queue */}
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl relative">
          <h2 className="text-xl font-semibold text-white mb-4">Submissions Evaluation Queue</h2>
          {pendingList.length === 0 ? (
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-center text-slate-500 text-sm">No pending items.</div>
          ) : (
            <ul className="space-y-3">
              {pendingList.map((sub) => (
                <li key={sub.id} onClick={() => handleOpenEvaluation(sub)} className="p-4 bg-slate-950 hover:bg-slate-850 cursor-pointer border border-slate-800 rounded-lg transition-all">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-100">{nameFor(sub.student_id)}</span>
                    <span className="text-xs text-slate-500">{new Date(sub.submitted_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{sub.assessments?.title || "Assessment"}</p>
                </li>
              ))}
            </ul>
          )}

          {/* Interactive Inline Drawer Pop-up */}
          {selectedSub && (
            <div className="absolute inset-0 bg-slate-950/95 border border-slate-800 p-6 rounded-xl flex flex-col space-y-4 overflow-y-auto">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h3 className="font-bold text-white">Evaluate Submission</h3>
                <button onClick={() => setSelectedSub(null)} className="text-xs text-slate-400 hover:text-white uppercase tracking-wider">Close</button>
              </div>
              <div className="text-xs space-y-1 bg-slate-900 p-3 rounded border border-slate-800/80">
                <p><span className="text-slate-400 font-medium">Student:</span> {nameFor(selectedSub.student_id)}</p>
                <p><span className="text-slate-400 font-medium">Task:</span> {selectedSub.assessments?.title}</p>
                <p><span className="text-slate-400 font-medium">Max Limit:</span> {selectedSub.assessments?.max_score} pts</p>
              </div>
              
              {selectedSub.submission_link && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Deliverable Link</label>
                  <a href={selectedSub.submission_link} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline break-all block bg-slate-900 p-2 rounded border border-slate-800">{selectedSub.submission_link}</a>
                </div>
              )}
              {selectedSub.submission_text && (
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Text Notes Submission</label>
                  <div className="text-xs text-slate-300 bg-slate-900 p-3 rounded border border-slate-800 max-h-32 overflow-y-auto whitespace-pre-wrap">{selectedSub.submission_text}</div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3 items-end">
                <div className="col-span-1">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Score</label>
                  <input type="number" value={gradeInput} onChange={(e) => setGradeInput(e.target.value)} placeholder="0" className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-500" />
                </div>
                <div className="col-span-2">
                  <button onClick={submitEvaluationGrade} disabled={submittingGrade} className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2 rounded transition-colors">{submittingGrade ? "Saving..." : "Commit Evaluation Grade"}</button>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-1">Feedback Notes</label>
                <textarea rows={2} value={feedbackInput} onChange={(e) => setFeedbackInput(e.target.value)} placeholder="Provide evaluation or grading advice notes..." className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-xs text-white outline-none focus:border-cyan-500" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Attendance Workspace with Historical Sync */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-semibold text-white">Mark Attendance</h2>
          <div className="flex items-center gap-3">
            <label className="text-sm text-slate-400">Date</label>
            <input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button onClick={saveAttendance} disabled={savingAtt || students.length === 0} className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors">{savingAtt ? "Saving…" : "Save Attendance"}</button>
          </div>
        </div>

        {attMsg && <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${attMsgType === "success" ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"}`}>{attMsg}</div>}

        {students.length === 0 ? (
          <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 text-center text-slate-500 text-sm">No students assigned yet.</div>
        ) : (
          <ul className="divide-y divide-slate-800">
            {students.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3">
                <span className="text-sm font-medium text-slate-200">{s.full_name || "Unnamed"}</span>
                <div className="flex gap-1.5">
                  {(["present", "late", "absent"] as AttStatus[]).map((st) => {
                    const active = statusFor(s.id) === st;
                    const activeColor = st === "present" ? "bg-emerald-600 text-white" : st === "late" ? "bg-amber-600 text-white" : "bg-red-600 text-white";
                    return (
                      <button key={st} onClick={() => setStatusFor(s.id, st)} className={`px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors ${active ? activeColor : "bg-slate-800 text-slate-400 hover:bg-slate-700"}`}>{st}</button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <MessagesPanel variant="dark" />
    </div>
  );
}