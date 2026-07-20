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
import CollapsibleCard from '../components/CollapsibleCard';

interface LessonDetail {
  id: string;
  module_id: string;
  title: string;
  content: string | null;
  lesson_order: number;
  quiz_questions: { question: string; options: string[]; correct: number }[] | null;
  quiz_pass_score: number;
}

interface SiblingLesson {
  id: string;
  lesson_order: number;
}

export default function LessonViewerPage() {
  const { moduleId, lessonId } = useParams<{ moduleId: string; lessonId: string }>();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);

  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [siblingLessons, setSiblingLessons] = useState<SiblingLesson[]>([]);
  const [passedLessonIds, setPassedLessonIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [quizPassed, setQuizPassed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!moduleId || !lessonId || !profile?.id) return;
    setLoading(true);
    try {
      const { data: lessonRow } = await supabase
        .from("lessons")
        .select("id, module_id, title, content, lesson_order, quiz_questions, quiz_pass_score")
        .eq("id", lessonId)
        .maybeSingle();
      setLesson((lessonRow as any) ?? null);

      const { data: allLessons } = await supabase
        .from("lessons")
        .select("id, lesson_order")
        .eq("module_id", moduleId)
        .order("lesson_order", { ascending: true });
      setSiblingLessons(allLessons || []);

      const lessonIds = (allLessons || []).map((l) => l.id);
      if (lessonIds.length > 0) {
        const { data: lp } = await supabase
          .from("lesson_progress")
          .select("lesson_id, passed, attempts")
          .eq("student_id", profile.id)
          .in("lesson_id", lessonIds);
        setPassedLessonIds(new Set((lp || []).filter((r) => r.passed).map((r) => r.lesson_id)));

        const own = (lp || []).find((r) => r.lesson_id === lessonId);
        setQuizPassed(own?.passed || false);
        setAttempts(own?.attempts || 0);
      }

      setAnswers({});
      setSubmitted(false);
      setScore(null);
    } catch (err) {
      console.error("Error loading lesson:", err);
    } finally {
      setLoading(false);
    }
  }, [moduleId, lessonId, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const currentIndex = siblingLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? siblingLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex >= 0 && currentIndex < siblingLessons.length - 1 ? siblingLessons[currentIndex + 1] : null;

  const isLocked = currentIndex > 0 && !!prevLesson && !passedLessonIds.has(prevLesson.id) && !quizPassed;

  const handleSubmitQuiz = async () => {
    if (!lesson?.quiz_questions || !profile?.id) return;
    const total = lesson.quiz_questions.length;
    if (Object.keys(answers).length < total) return;

    let correct = 0;
    lesson.quiz_questions.forEach((q, idx) => {
      if (answers[idx] === q.correct) correct++;
    });
    const pct = Math.round((correct / total) * 100);
    const passed = pct >= (lesson.quiz_pass_score || 100);

    setScore(pct);
    setSubmitted(true);
    setQuizPassed(passed);
    setSaving(true);

    try {
      const { error } = await supabase.from("lesson_progress").upsert(
        {
          student_id: profile.id,
          lesson_id: lesson.id,
          passed,
          best_score: pct,
          attempts: attempts + 1,
          completed_at: passed ? new Date().toISOString() : null,
        },
        { onConflict: "student_id,lesson_id" }
      );
      if (error) throw error;
      setAttempts((a) => a + 1);
      if (passed) {
        setPassedLessonIds((prev) => new Set(prev).add(lesson.id));
      }
    } catch (err) {
      console.error("Error saving lesson progress:", err);
    } finally {
      setSaving(false);
    }
  };

  const retryQuiz = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 rounded-full border-4 border-[#3AAA35] border-t-[#F47920] animate-spin" />
      </div>
    );
  }

  if (!lesson) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Lesson not found.</div>;
  }

  if (isLocked) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-6">
        <div className="text-5xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">This lesson is locked</h1>
        <p className="text-sm text-gray-500 mb-6 max-w-sm">
          Complete and pass the previous lesson's knowledge check (100%) to unlock "{lesson.title}."
        </p>
        <button
          onClick={() => navigate(`/modules/${moduleId}`)}
          className="bg-[#1B2A6B] hover:bg-[#152154] text-white font-semibold px-6 py-2.5 rounded-lg transition"
        >
          ← Back to Module
        </button>
      </div>
    );
  }

  const totalQuestions = lesson.quiz_questions?.length || 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans,sans-serif]">
      <div className="bg-gradient-to-r from-[#1B2A6B] via-[#1E3A8A] to-[#2563EB] px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(`/modules/${moduleId}`)}
            className="text-white/80 hover:text-white text-sm font-semibold mb-3 inline-flex items-center gap-1"
          >
            ← Back to Module
          </button>
          <p className="text-[#3AAA35] text-xs font-bold uppercase tracking-[0.3em] mb-1">
            Lesson {lesson.lesson_order} of {siblingLessons.length}
          </p>
          <h1 className="font-[Syne,sans-serif] text-2xl font-extrabold text-white">{lesson.title}</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          {lesson.content ? (
            <div
              className="prose prose-sm max-w-none text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeHTML(lesson.content) }}
            />
          ) : (
            <p className="text-gray-400 text-sm">No content published for this lesson yet.</p>
          )}
        </section>

        {totalQuestions > 0 && (
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
            <h2 className="font-bold text-[#1B2A6B] mb-1">🧠 Test Your Knowledge</h2>
            <p className="text-xs text-gray-400 mb-5">
              You must Score {lesson.quiz_pass_score}% on these {totalQuestions} questions to unlock the next lesson.
            </p>

            {quizPassed && !submitted ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-700 font-semibold">
                ✓ You've already passed this lesson's knowledge check.
              </div>
            ) : !submitted ? (
              <div className="space-y-5">
                {lesson.quiz_questions!.map((q, idx) => (
                  <div key={idx} className="border rounded-xl p-4 bg-gray-50/50">
                    <p className="font-semibold text-gray-800 mb-3">
                      {idx + 1}. {q.question}
                    </p>
                    <div className="space-y-2 pl-3">
                      {q.options.map((opt, optIdx) => (
                        <label
                          key={optIdx}
                          className={`flex items-center gap-3 cursor-pointer p-2.5 rounded-lg transition ${
                            answers[idx] === optIdx ? "bg-[#3AAA35]/10 border border-[#3AAA35]/30" : "hover:bg-gray-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`q_${idx}`}
                            checked={answers[idx] === optIdx}
                            onChange={() => setAnswers((prev) => ({ ...prev, [idx]: optIdx }))}
                            className="w-4 h-4 text-[#3AAA35]"
                          />
                          <span className="text-sm text-gray-700">
                            {String.fromCharCode(65 + optIdx)}. {opt}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                <button
                  onClick={handleSubmitQuiz}
                  disabled={answeredCount < totalQuestions || saving}
                  className="w-full bg-[#1B2A6B] hover:bg-[#152154] disabled:bg-gray-300 text-white font-semibold py-3 rounded-xl transition"
                >
                  {saving ? "Submitting..." : `Submit Answers (${answeredCount}/${totalQuestions})`}
                </button>
              </div>
            ) : (
              <div className="text-center py-4">
                <div className={`text-5xl mb-3 ${quizPassed ? "text-green-500" : "text-red-500"}`}>
                  {quizPassed ? "🎉" : "📚"}
                </div>
                <p className={`text-lg font-bold mb-1 ${quizPassed ? "text-green-600" : "text-red-600"}`}>
                  {quizPassed ? "Congratulations, Lesson Passed!" : "Not Yet There — Try Again"}
                </p>
                <p className="text-sm text-gray-500 mb-4">You scored {score}%.</p>
                {!quizPassed && (
                  <button
                    onClick={retryQuiz}
                    className="bg-[#F47920] hover:bg-[#d66515] text-white font-semibold px-6 py-2.5 rounded-lg transition"
                  >
                    Retry Quiz
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            onClick={() => prevLesson && navigate(`/modules/${moduleId}/lessons/${prevLesson.id}`)}
            disabled={!prevLesson}
            className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            ← Previous Lesson
          </button>

          {nextLesson ? (
            <button
              onClick={() => navigate(`/modules/${moduleId}/lessons/${nextLesson.id}`)}
              disabled={totalQuestions > 0 && !quizPassed}
              className="px-5 py-2.5 rounded-xl bg-[#3AAA35] hover:bg-[#2e872a] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next Lesson →
            </button>
          ) : (
            <button
              onClick={() => navigate(`/modules/${moduleId}`)}
              disabled={totalQuestions > 0 && !quizPassed}
              className="px-5 py-2.5 rounded-xl bg-[#F47920] hover:bg-[#d66515] text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Finish → Back to Module
            </button>
          )}
        </div>
      </div>
    </div>
  );
}