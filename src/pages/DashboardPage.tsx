/// ====================================================================
// DashboardPage.tsx (Refactored with React Query, Component Extraction)
// =====================================================================
import { useEffect, useState, lazy, Suspense, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import CollapsibleCard from "../components/CollapsibleCard";
import AvatarUploader from "../components/AvatarUploader";
import SubmissionsSummaryCard from "../components/SubmissionsSummaryCard";
import ContinueLearningCard from "../components/student/workspace/ContinueLearningCard";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import toast from "react-hot-toast";

const AdminDashboard = lazy(() => import("./AdminDashboard"));
const InstructorDashboard = lazy(() => import("../components/InstructorDashboard"));

// Import our centralized hooks
import {
  useStudentCourses,
  useModulesForCourses,
  useModuleProgress,
  useAssessments,
  useSubmissions,
  useAttendance,
  useDirectMessages,
  useAnnouncements,
  useSubmitAssessment,
  useSendMessageReply,
  useMarkMessagesRead,
  type AssessmentItem,
  type DirectMessage,
} from "../hooks/studentData";

// ── Helpers ────────────────────────────────────
function getRelativeDeadline(dateString: string | null): { text: string; isUrgent: boolean } {
  if (!dateString) return { text: "No due date set", isUrgent: false };
  const now = new Date();
  const dueDate = new Date(dateString);
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return { text: `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? "s" : ""}`, isUrgent: true };
  if (diffDays === 0) return { text: "Due Today", isUrgent: true };
  if (diffDays === 1) return { text: "Due Tomorrow", isUrgent: true };
  return { text: `Due in ${diffDays} days`, isUrgent: diffDays <= 3 };
}

function isValidSubmissionUrl(url: string): boolean {
  let input = url.trim();
  if (!input) return false;
  // Automatically add https:// if no protocol is present
  if (!/^https?:\/\//i.test(input)) {
    input = 'https://' + input;
  }
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

// ── Subcomponents ──────────────────────────────
function LogoutButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-red-700 active:scale-95 transition-all">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
      Logout
    </button>
  );
}

function StatCard({ label, value, icon, accent, delay = "0ms" }: { label: string; value: string | number; icon: React.ReactNode; accent: string; delay?: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-sm p-6 flex flex-col gap-3 animate-fadein" style={{ animationDelay: delay }}>
      <div className={`absolute top-0 left-0 right-0 h-1 ${accent}`} />
      <div className="flex items-start justify-between"><p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p><span className="text-2xl">{icon}</span></div>
      <p className="text-4xl font-black text-[#1B2A6B] tracking-tight">{value}</p>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload?.length) {
    return <div className="bg-[#1B2A6B] text-white text-xs rounded-lg px-3 py-2 shadow-xl"><p className="font-bold mb-0.5">{label}</p><p className="text-[#F47920]">Score: <span className="font-bold">{payload[0].value}%</span></p></div>;
  }
  return null;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);
  const authLoading = useAuthStore((s) => s.loading);
  const logout = useAuthStore((s) => s.logout);
  const role = profile?.role;

  // ── Data Hooks (auto-fetch, cached) ──
  const { data: courses = [] } = useStudentCourses(profile?.id);
  const courseIds = courses.map((c) => c.course_id).filter(Boolean);
  const { data: modules = [] } = useModulesForCourses(courseIds);
  const { data: moduleProgress = [] } = useModuleProgress(profile?.id);
  const { data: assessmentsRaw = [] } = useAssessments(courseIds, profile?.id);
  const { data: submissions = [] } = useSubmissions(profile?.id);
  const { data: attendanceStats } = useAttendance(profile?.id);
  const { data: messages = [] } = useDirectMessages(profile?.id);
  const { data: announcements = [] } = useAnnouncements();

  // ── Mutations ──
  const submitAssessment = useSubmitAssessment();
  const sendReply = useSendMessageReply();
  const markRead = useMarkMessagesRead();

  // ── Derived data ──
  const completedIds = new Set(moduleProgress.map((p) => p.module_id));

  const moduleProgressList = modules.map((m) => {
    const progressRecord = moduleProgress.find((p) => p.module_id === m.id);
    return {
      id: `${profile?.id}_${m.id}`,
      module_id: m.id,
      module: m,
      completed: completedIds.has(m.id),
      progress_percentage: progressRecord?.progress_percentage ?? 0,
      completed_at: progressRecord?.completed_at ?? null,
    };
  });

  const moduleCompletedCount = moduleProgressList.filter((m) => m.completed).length;
  const totalModules = modules.length;
  const modulePercentDisplay = totalModules ? Math.round((moduleCompletedCount / totalModules) * 100) : 0;

  const assessments: AssessmentItem[] = assessmentsRaw.map((asm) => {
    const sub = submissions.find((s) => s.assessment_id === asm.id);
    return {
      ...asm,
      user_submission: sub ? {
        id: sub.id,
        submission_text: sub.submission_text,
        grade: sub.grade,
        feedback: sub.feedback,
      } : null,
    };
  });

  const attendancePercentage = attendanceStats?.percentage ?? 100;

  const avgScore = assessments
    .filter((a) => a.user_submission?.grade != null)
    .reduce((acc, a) => acc + (a.user_submission!.grade ?? 0), 0) /
    (assessments.filter((a) => a.user_submission?.grade != null).length || 1);

  // ── Module progression locking ──
  // Build a map: courseId → list of { id, order } sorted by module_order
  const sortedCourseModules = useMemo(() => {
    const map = new Map<string, { id: string; order: number }[]>();
    modules.forEach((m: any) => {
      if (!map.has(m.course_id)) map.set(m.course_id, []);
      map.get(m.course_id)!.push({ id: m.id, order: m.module_order });
    });
    map.forEach(entries => entries.sort((a, b) => a.order - b.order));
    return map;
  }, [modules]);

  // IDs of modules the student has completed (passed the quiz)
  const passedModuleIds = useMemo(
    () => new Set(moduleProgressList.filter(m => m.completed).map(m => m.module_id)),
    [moduleProgressList]
  );

  // Helper: true if this module quiz should be locked
  const isModuleQuizLocked = (assessment: any): boolean => {
    if (assessment.assessment_type !== "Quiz" || !assessment.module_id) return false;
    const module = modules.find((m: any) => m.id === assessment.module_id);
    if (!module) return false;
    const entries = sortedCourseModules.get(module.course_id);
    if (!entries) return false;
    const idx = entries.findIndex(e => e.id === module.id);
    if (idx <= 0) return false; // first module always unlocked
    const prevModuleId = entries[idx - 1].id;
    return !passedModuleIds.has(prevModuleId);
  };

  // Helper: true if a course exam is available (all modules of that course completed)
  const isExamAvailable = (assessment: any): boolean => {
    if (assessment.assessment_type !== "Exam") return true;
    if (!assessment.course_id) return true; // if no course_id, show it (fallback)
    const entries = sortedCourseModules.get(assessment.course_id);
    if (!entries) return true;
    return entries.every(e => passedModuleIds.has(e.id));
  };

  // ── Derived: Resume Active Lesson ──
  const handleResumeActiveLesson = () => {
    if (courses.length === 0) {
      toast.error("You are not currently enrolled in any active course tracks.");
      return;
    }
    const primaryCourseId = courses[0].course_id;
    const targetModules = [...modules]
      .filter((m) => m.course_id === primaryCourseId)
      .sort((a, b) => (a.module_order ?? 0) - (b.module_order ?? 0));
    if (targetModules.length === 0) {
      navigate(`/courses/${primaryCourseId}/modules`);
      return;
    }
    const incompleteModule = targetModules.find((m) => !completedIds.has(m.id));
    const destinationModule = incompleteModule || targetModules[targetModules.length - 1];
    navigate(`/courses/${primaryCourseId}/modules`);
  };

  // ── UI State ──
  const [submissionUrls, setSubmissionUrls] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [assessmentFilter, setAssessmentFilter] = useState("all");

  const filteredAssessments = assessments.filter(asm =>
    assessmentFilter === "all" ? true : asm.assessment_type === assessmentFilter
  );

  const submissionCompletion = assessments.length > 0
    ? Math.round((assessments.filter((a) => a.user_submission).length / assessments.length) * 100)
    : 0;

  const chartData = submissions
    .filter((s) => s.grade !== null)
    .sort((a, b) => new Date(a.submitted_at || "").getTime() - new Date(b.submitted_at || "").getTime())
    .map((s, idx) => ({ week: `Task ${idx + 1}`, score: Number(s.grade) }));

  const unreadCount = messages.filter((m) => !m.is_read && m.recipient_id === profile?.id).length;

  // ── Handlers ──
  const handleMarkInboxAsRead = () => {
    const unreadIds = messages.filter((m) => !m.is_read && m.recipient_id === profile?.id).map((m) => m.id);
    if (unreadIds.length > 0) markRead.mutate(unreadIds);
  };

  const handleSubmitAssessment = (assessmentId: string) => {
    const url = submissionUrls[assessmentId]?.trim();
    if (!isValidSubmissionUrl(url ?? "")) {
      toast.error("Invalid URL. Please enter a valid project link.");
      return;
    }
    if (!profile) return;
    submitAssessment.mutate(
      { assessmentId, studentId: profile.id, submissionText: url! },
      { onSuccess: () => toast.success("Assignment submitted!"), onError: (err: any) => toast.error(err.message) }
    );
  };

  const handleReply = (msg: DirectMessage) => {
    const draft = replyDrafts[msg.id]?.trim();
    if (!draft || !profile) return;
    sendReply.mutate(
      { senderId: profile.id, recipientId: msg.sender_id, subject: msg.subject ? `Re: ${msg.subject}` : "Re:", body: draft },
      { onSuccess: () => { setReplyDrafts((prev) => ({ ...prev, [msg.id]: "" })); toast.success("Reply sent!"); }, onError: (err: any) => toast.error(err.message) }
    );
  };

  // ── Auth guard ──
  useEffect(() => {
    if (authLoading) return;
    if (!profile) navigate("/login", { replace: true });
  }, [authLoading, profile, navigate]);

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-[#0D1B4B]"><div className="h-12 w-12 rounded-full border-4 border-[#3AAA35] border-t-[#F47920] animate-spin" /></div>;
  }

  if (role === "admin") return <Suspense fallback={null}><AdminDashboard /></Suspense>;
  if (role === "instructor") return <Suspense fallback={null}><InstructorDashboard /></Suspense>;

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes fadein { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fadein { animation: fadein 0.5s ease both; }
        .cb-bg { background: linear-gradient(135deg, #0D1B4B 0%, #1B2A6B 60%, #0f3460 100%); }
      `}</style>

      <div className="min-h-screen bg-gray-50 font-[DM_Sans,sans-serif]">
        {/* Header */}
        <header className="bg-gradient-to-r from-[#3AAA35] via-[#1E3A8A] to-[#2563EB] shadow-xl">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/newlogo.png" alt="" className="hidden sm:block h-12 w-12 object-contain bg-white/10 p-1 rounded-xl" />
              <div><p className="text-white font-bold text-xl font-[Syne]">CyberBill <span className="text-[#F47920]">Africa</span></p>
              <p className="text-blue-200 text-[10px] tracking-[0.25em] uppercase font-semibold italic">Building Africa's Digital Future</p>
            </div>
            </div>
            <div className="flex items-center -mt-1 -mb-1">
            <div className="flex flex-col items-center gap-2">
              <AvatarUploader />
              <LogoutButton onClick={async () => {await logout(); navigate("/login");  }} />
            </div>
          </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-6 py-5 space-y-8">
          {/* Welcome banner */}
          <div className="animate-fadein rounded-2xl overflow-hidden shadow-lg cb-bg p-6 flex items-center justify-between">
            <div>
              <p className="text-[#3AAA35] text-xs font-semibold uppercase tracking-widest mb-1">Student Learning Portal</p>
              <h3 className="font-[Syne] text-2xl font-extrabold text-white">Welcome back, <span className="text-[#F47920]">{profile?.full_name?.split(" ")[0]}</span></h3>
              <p className="text-blue-200 text-sm">{profile?.email}</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <StatCard label="Attendance" value={`${attendancePercentage}%`} icon="📅" accent="bg-[#1B2A6B]" />
            <StatCard label="Avg Score" value={avgScore > 0 ? `${Math.round(avgScore)}%` : "—"} icon="🎯" accent="bg-[#3AAA35]" />
            <StatCard label="Progress" value={`${modulePercentDisplay}%`} icon="📚" accent="bg-[#F47920]" />
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-[#3AAA35] flex items-center justify-center mb-4 font-bold text-lg group-hover:bg-emerald-100 transition">
                  🚀
                </div>
                <h3 className="text-base font-bold text-gray-900 font-[Syne]">Project Workspace</h3>
                <p className="text-xs text-gray-500 mt-1 font-[DM_Sans] font-light">
                  Manage active project criteria, link cloud repositories, and submit deliverables directly to instructors.
                </p>
              </div>
              <button
                onClick={() => navigate("/student/assignments")}
                className="mt-5 w-full bg-[#3AAA35] hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-xl transition shadow-sm"
              >
                Open Submissions Terminal →
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between hover:shadow-md transition group">
              <div>
                <div className="w-12 h-12 rounded-xl bg-blue-50 text-[#1E3A8A] flex items-center justify-center mb-4 font-bold text-lg group-hover:bg-blue-100 transition">
                  📖
                </div>
                <h3 className="text-base font-bold text-gray-900 font-[Syne]">Jump to Class</h3>
                <p className="text-xs text-gray-500 mt-1 font-[DM_Sans] font-light">
                  Instantly resume your active curriculum stream. Automatically fast-forwards to your current unlocked module or lesson milestones.
                </p>
              </div>
              <button
                onClick={handleResumeActiveLesson}
                className="mt-5 w-full bg-[#1E3A8A] hover:bg-blue-900 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-xl transition shadow-sm"
              >
                Resume Learning Terminal →
              </button>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
              <div>
                <div className="w-12 h-12 rounded-xl bg-orange-50 text-[#F47920] flex items-center justify-center mb-4 font-bold text-lg">
                  💬
                </div>
                <h3 className="text-base font-bold text-gray-900 font-[Syne]">Cohort Global Chat</h3>
                <p className="text-xs text-gray-500 mt-1 font-[DM_Sans] font-light">
                  Engage with active cohort peers, discuss lab environments, and coordinate technical architecture teams.
                </p>
              </div>
              <button
                onClick={() => navigate("/chat")}
                className="mt-5 w-full bg-[#F47920] hover:bg-orange-600 text-white text-xs font-bold uppercase tracking-wider py-2.5 rounded-xl transition shadow-sm"
              >
                Launch Chatroom
              </button>
            </div>
          </div>
          <ContinueLearningCard />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">

              {/* Courses */}
              <CollapsibleCard title="📚 My Active Courses" defaultOpen={true}>
                {courses.length === 0 ? <p className="text-xs text-gray-400 p-4">No courses assigned.</p> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
                    {courses.map((c) => (
                      <div key={c.id} className="bg-slate-50 rounded-xl border p-4 flex flex-col justify-between">
                        <div><h4 className="font-bold text-[#1B2A6B] text-sm">{c.courses?.title}</h4>
                        <p className="text-xs text-gray-500 line-clamp-3">{c.courses?.description || "No description"}</p></div>
                        <button onClick={() => navigate(`/courses/${c.course_id}/modules`)} className="mt-3 bg-[#3AAA35] text-white text-xs font-bold py-2 rounded-lg">Open Course</button>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleCard>

              {/* ── Active Task Workspace (includes locking) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-4">
                 
                </div>

                {/* Right Column: Workspace Analytics */}
                <div className="lg:col-span-1">
                </div>
              </div>

              {/* ── Separate "Your Tasks" collapsible (also with locking) ── */}
              <CollapsibleCard
                title={`📝 Your Tasks (${filteredAssessments.length})`}
                defaultOpen={true}
              >
                <div className="flex items-center justify-end mb-2 px-1">
                  <select
                    value={assessmentFilter}
                    onChange={(e) => setAssessmentFilter(e.target.value)}
                    className="border text-xs rounded-lg px-3 py-1.5 bg-white text-gray-700 outline-none focus:ring-2 focus:ring-[#F47920]"
                  >
                    <option value="all">📋 All Types</option>
                    <option value="Assignment">📄 Assignments</option>
                    <option value="Project">📁 Projects</option>
                    <option value="Quiz">🧠 Quizzes</option>
                    <option value="Exam">📝 Exams</option>
                  </select>
                </div>

                <div className="space-y-4 p-1">
                  {filteredAssessments.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      No tasks mapped to your registry yet.
                    </p>
                  ) : (
                    filteredAssessments.map((asm) => {
                      const deadline = getRelativeDeadline(asm.due_date);
                      return (
                        <div key={asm.id} className="border p-4 rounded-xl shadow-sm">
                          <span className="text-[9px] bg-[#1B2A6B]/5 text-[#1B2A6B] px-2 py-0.5 rounded">
                            {asm.modules?.title || "General"}
                          </span>
                          <div className="flex items-center gap-2 mt-1">
                            <h4 className="font-bold text-sm">{asm.title}</h4>
                            <span
                              className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border tracking-wide ${
                                asm.assessment_type === "Assignment"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : asm.assessment_type === "Project"
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : asm.assessment_type === "Quiz"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : asm.assessment_type === "Exam"
                                  ? "bg-rose-50 text-rose-700 border-rose-200"
                                  : "bg-gray-50 text-gray-600 border-gray-200"
                              }`}
                            >
                              {asm.assessment_type}
                            </span>
                          </div>
                          {asm.instructions && (
                            <p className="text-xs text-gray-500 mt-1 bg-slate-50 p-2 rounded">
                              {asm.instructions}
                            </p>
                          )}
                          <div className="flex justify-between items-center mt-2">
                            {asm.due_date && (
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                  deadline.isUrgent
                                    ? "bg-red-50 text-red-600"
                                    : "bg-slate-100 text-gray-600"
                                }`}
                              >
                                ⏰ {deadline.text}
                              </span>
                            )}
                          </div>

                          {asm.user_submission ? (
                            <div className="mt-2 bg-slate-50 rounded p-3 text-xs">
                              <p className="text-gray-500">
                                Submitted:{" "}
                                <a
                                  href={asm.user_submission.submission_text}
                                  target="_blank"
                                  className="text-blue-600 underline"
                                >
                                  {asm.user_submission.submission_text}
                                </a>
                              </p>
                              {asm.user_submission.grade != null && (
                                <p className="mt-1 font-bold text-emerald-700">
                                  Score: {asm.user_submission.grade}/100
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex gap-2 mt-3">
                              {asm.assessment_type === "Quiz" || asm.assessment_type === "Exam" ? (
                                (() => {
                                  const locked = isModuleQuizLocked(asm);
                                  const examVisible = isExamAvailable(asm);
                                  if (asm.assessment_type === "Exam" && !examVisible) {
                                    return (
                                      <div className="w-full text-xs text-gray-400 font-bold py-2">
                                        🔒 Exam will unlock after all weeks are completed
                                      </div>
                                    );
                                  }
                                  if (locked) {
                                    return (
                                      <div className="w-full text-xs text-amber-600 font-bold py-2">
                                        🔒 Complete previous week's quiz first
                                      </div>
                                    );
                                  }
                                  return (
                                    <button
                                      onClick={() => navigate(`/student/assessment/${asm.id}/quiz`)}
                                      className="w-full bg-[#F47920] text-white font-bold text-xs uppercase py-2 rounded-lg hover:opacity-90 transition"
                                    >
                                      🚀 Launch {asm.assessment_type}
                                    </button>
                                  );
                                })()
                              ) : (
                                <>
                                  <input
                                    type="url"
                                    placeholder="Your Work URL"
                                    value={submissionUrls[asm.id] || ""}
                                    onChange={(e) =>
                                      setSubmissionUrls((prev) => ({
                                        ...prev,
                                        [asm.id]: e.target.value,
                                      }))
                                    }
                                    className="flex-1 text-xs text-gray-700 border rounded px-3 py-2"
                                  />
                                  <button
                                    onClick={() => handleSubmitAssessment(asm.id)}
                                    disabled={submitAssessment.isLoading}
                                    className="bg-[#3AAA35] text-white text-xs font-bold px-4 py-2 rounded"
                                  >
                                    Turn In
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CollapsibleCard>

              {/* Module Progress (detailed) */}
              <CollapsibleCard title="📊 Module Progress" defaultOpen={false}>
                <div className="space-y-2 p-1">
                  {moduleProgressList.length === 0 ? (
                    <p className="text-xs text-gray-400 p-4 text-center">No modules started yet.</p>
                  ) : (
                    moduleProgressList.map((mod) => {
                      const progressPercent = mod.completed ? 100 : (mod.progress_percentage ?? 0);
                      return (
                        <div key={mod.module_id} className="border rounded-xl p-3 text-xs bg-white">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-bold text-[#1B2A6B]">
                              Wk {mod.module?.module_order}: {mod.module?.title}
                            </span>
                            {mod.completed && (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2.5 py-0.5 rounded">
                                ✓ Completed
                              </span>
                            )}
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1">
                            <div
                              className={`h-1.5 rounded-full transition-all duration-300 ${
                                mod.completed ? "bg-green-500" : "bg-amber-400"
                              }`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-[10px] mt-1.5 text-gray-500 font-mono">
                            <span>Progress</span>
                            <span className="font-semibold">{progressPercent}%</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CollapsibleCard>

              {/* Chart */}
              <CollapsibleCard title="📊 Your Performance" defaultOpen={false}>
                {chartData.length === 0 ? <p className="text-xs text-gray-400 p-4">No graded submissions yet.</p> : (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
                      <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="score" stroke="#1B2A6B" strokeWidth={3} dot={{ fill: "#F47920" }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CollapsibleCard>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Inbox */}
              <CollapsibleCard title={`✉️ Your Inbox (${unreadCount} New)`} defaultOpen={true} onToggle={(isOpen) => { if(isOpen) handleMarkInboxAsRead(); }}>
                <div className="space-y-4 max-h-[450px] overflow-y-auto pr-1 p-1">
                  {messages.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">Communication inbox is empty.</p>
                  ) : (
                    messages.map((msg) => {
                      const fromMe = msg.sender_id === profile?.id;
                      return (
                        <div key={msg.id} className={`border rounded-xl p-3 space-y-2 shadow-sm ${msg.is_read ? "bg-white border-gray-100" : "bg-blue-50/40 border-blue-100/70 relative ring-1 ring-blue-100"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-[#1B2A6B] text-xs">{fromMe ? "You" : (msg.sender_name || "Staff Registry")}</span>
                              {!fromMe && msg.sender_role && (
                                <span className="text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#F47920]/10 text-[#F47920]">
                                  {msg.sender_role}
                                </span>
                              )}
                            </div>
                            <span className="text-[9px] text-gray-400">{new Date(msg.created_at).toLocaleDateString()}</span>
                          </div>
                          {msg.subject && <p className="text-[11px] font-bold text-slate-600 border-b border-gray-100/60 pb-0.5">{msg.subject}</p>}
                          <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-normal">{msg.body}</p>

                          {!fromMe && (
                            <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100/60">
                              <input type="text" placeholder="Type your reply..." value={replyDrafts[msg.id] || ""} onChange={(e) => setReplyDrafts(prev => ({ ...prev, [msg.id]: e.target.value }))} className="flex-1 text-[11px] bg-slate-50 border border-gray-200 text-gray-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3AAA35]" />
                              <button
                                onClick={() => handleReply(msg)}
                                className="bg-[#1B2A6B] hover:bg-[#152154] text-white font-bold text-[10px] px-3 py-1.5 rounded-lg transition-all uppercase tracking-wide"
                              >
                                Reply
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </CollapsibleCard>

              {/* Announcements */}
              <CollapsibleCard title="📢 Announcements" defaultOpen={true}>
                <div className="space-y-2 p-1">
                  {announcements.map((a) => (
                    <div key={a.id} className="border-l-4 border-[#3AAA35] bg-white p-3 rounded-r-xl">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <h5 className="font-bold text-[#1B2A6B] text-xs">{a.title}</h5>
                        <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase tracking-wider">{a.target_scope}</span>
                      </div>
                      <p className="text-xs text-gray-600 font-normal leading-relaxed whitespace-pre-wrap mt-1">{a.body}</p>
                      <p className="text-[9px] text-gray-400 font-mono text-right pt-1">{new Date(a.created_at).toLocaleDateString()}</p>
                    </div>
                  ))}
                </div>
              </CollapsibleCard>

              
              <SubmissionsSummaryCard />
            </div>
          </div>
        </main>
      </div>
    </>
  );
}