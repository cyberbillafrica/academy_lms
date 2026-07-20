import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuthStore } from "../store/authStore";
import DOMPurify from "dompurify";

const sanitizeHTML = (html: string | null | undefined) =>
  DOMPurify.sanitize(html || "", {
    ADD_TAGS: ["iframe"],
    ADD_ATTR: [
      "allow",
      "allowfullscreen",
      "frameborder",
      "loading",
      "referrerpolicy",
      "style",
      "target",
      "rel",
    ],
  });
import StudentQuizEngine from "../components/student/StudentsQuizEngine";

interface ModuleDetail {
  id: string;
  course_id: string;
  title: string;
  module_order: number;
  quiz_enabled: boolean;
  quiz_questions: any;
  quiz_pass_score: number;
  lab_steps: string | null;
  assignment_text: string | null;
  capstone_task: string | null;
  live_class_notes: string | null;
  whatsapp_activity: string | null;
  courses?: { title: string } | null;
}

interface LessonRow {
  id: string;
  title: string;
  lesson_order: number;
}

export default function ModuleDetailPage() {
  const { moduleId } = useParams<{ moduleId: string }>();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);

  const [mod, setModule] = useState<ModuleDetail | null>(null);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [passedLessonIds, setPassedLessonIds] = useState<Set<string>>(new Set());
  const [moduleCompleted, setModuleCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finalQuizOpen, setFinalQuizOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!moduleId || !profile?.id) return;
    setLoading(true);
    try {
      const { data: moduleRow } = await supabase
        .from("modules")
        .select(`
          id, course_id, title, module_order,
          quiz_enabled, quiz_questions, quiz_pass_score,
          lab_steps, assignment_text, capstone_task, live_class_notes, whatsapp_activity,
          courses ( title )
        `)
        .eq("id", moduleId)
        .maybeSingle();
      setModule((moduleRow as any) ?? null);

      const { data: lessonRows } = await supabase
        .from("lessons")
        .select("id,title,lesson_order,content")
        .eq("module_id", moduleId)
        .order("lesson_order", { ascending: true });
      setLessons(lessonRows || []);

      const lessonIds = (lessonRows || []).map((l) => l.id);
      if (lessonIds.length > 0) {
        const { data: lp } = await supabase
          .from("lesson_progress")
          .select("lesson_id, passed")
          .eq("student_id", profile.id)
          .eq("passed", true)
          .in("lesson_id", lessonIds);
        setPassedLessonIds(new Set((lp || []).map((r) => r.lesson_id)));
      } else {
        setPassedLessonIds(new Set());
      }

      const { data: mp } = await supabase
        .from("module_progress")
        .select("completed")
        .eq("student_id", profile.id)
        .eq("module_id", moduleId)
        .maybeSingle();
      setModuleCompleted(mp?.completed === true);
    } catch (err) {
      console.error("Error loading module detail:", err);
    } finally {
      setLoading(false);
    }
  }, [moduleId, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const allLessonsPassed = lessons.length > 0 && lessons.every((l) => passedLessonIds.has(l.id));
  const isLessonUnlocked = (index: number) => index === 0 || passedLessonIds.has(lessons[index - 1].id);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 rounded-full border-4 border-[#3AAA35] border-t-[#F47920] animate-spin" />
      </div>
    );
  }

  if (!mod) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Module not found.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans,sans-serif]">
      <div className="bg-gradient-to-r from-[#1B2A6B] via-[#1E3A8A] to-[#2563EB] px-6 py-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate(`/courses/${mod.course_id}/modules`)}
            className="text-white/80 hover:text-white text-sm font-semibold mb-4 inline-flex items-center gap-1"
          >
            ← Back to {mod.courses?.title || "Course"} Weeks
          </button>
          <p className="text-[#3AAA35] text-xs font-bold uppercase tracking-[0.3em] mb-1">Week {mod.module_order}</p>
          <h1 className="font-[Syne,sans-serif] text-3xl font-extrabold text-white">{mod.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {mod.live_class_notes && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-[#1B2A6B] mb-2">🎥 Live Class</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{mod.live_class_notes}</p>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-[#1B2A6B] mb-4">
            📖 Lessons ({passedLessonIds.size}/{lessons.length} completed)
          </h2>
          {lessons.length === 0 ? (
            <p className="text-sm text-gray-400">No lessons published yet.</p>
          ) : (
            <div className="space-y-2">
              {lessons.map((lesson, idx) => {
                const unlocked = isLessonUnlocked(idx);
                const passed = passedLessonIds.has(lesson.id);
                return (
                  <button
                    key={lesson.id}
                    disabled={!unlocked}
                    onClick={() => navigate(`/modules/${mod.id}/lessons/${lesson.id}`)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border text-left transition ${
                      unlocked
                        ? "border-gray-200 hover:border-[#3AAA35] hover:bg-green-50/40"
                        : "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                          passed ? "bg-green-500 text-white" : unlocked ? "bg-[#1B2A6B] text-white" : "bg-gray-300 text-gray-500"
                        }`}
                      >
                        {passed ? "✓" : lesson.lesson_order}
                      </span>
                      <span className="text-sm font-semibold text-gray-800">{lesson.title}</span>
                    </div>
                    <span className="text-xs font-bold text-gray-400">
                      {passed ? "Completed" : unlocked ? "Start →" : "🔒 Locked"}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {mod.lab_steps && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-[#1B2A6B] mb-2">🧪 Hands-on Lab</h2>
            <div
              className="text-sm text-gray-700 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHTML(mod.lab_steps) }}
            />
          </section>
        )}

        {mod.assignment_text && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-[#1B2A6B] mb-2">📝 Assignment</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{mod.assignment_text}</p>
          </section>
        )}

        {mod.whatsapp_activity && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-[#1B2A6B] mb-2">💬 WhatsApp Activity</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{mod.whatsapp_activity}</p>
          </section>
        )}

        {mod.capstone_task && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-bold text-[#1B2A6B] mb-2">🏆 Capstone Task</h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{mod.capstone_task}</p>
          </section>
        )}

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-[#1B2A6B] mb-2">🎯 Final Weekly Quiz</h2>
          {moduleCompleted ? (
            <p className="text-sm font-semibold text-green-600">✓ You've already passed this week's final quiz.</p>
          ) : !mod.quiz_enabled || !mod.quiz_questions?.length ? (
            <p className="text-sm text-gray-400">No final quiz published for this week yet.</p>
          ) : !allLessonsPassed ? (
            <p className="text-sm text-amber-600">⚡ Complete all lessons above (100% each) to unlock this quiz.</p>
          ) : (
            <button
              onClick={() => setFinalQuizOpen(true)}
              className="bg-[#F47920] hover:bg-[#d66515] text-white font-semibold px-6 py-2.5 rounded-lg transition"
            >
              Take Final Quiz ({mod.quiz_pass_score}% to pass)
            </button>
          )}
        </section>
      </div>

      {finalQuizOpen && profile && mod.quiz_questions?.length > 0 && (
        <StudentQuizEngine
          isOpen={finalQuizOpen}
          onClose={() => setFinalQuizOpen(false)}
          moduleId={mod.id}
          moduleTitle={mod.title}
          questions={mod.quiz_questions}
          passScore={mod.quiz_pass_score}
          studentId={profile.id}
          onComplete={() => {
            loadData();
          }}
        />
      )}
    </div>
  );
}