import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

interface Question {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
}

interface QuizEngineProps {
  assessmentId: string;
  moduleId?: string;
  // The following props are now optional – the engine fetches them itself
  title?: string;
  type?: "Quiz" | "Exam";
  dueDate?: string | null;
  maxScore?: number;
  onComplete: () => void;
  timeLimitMinutes?: number | null;
}

export default function QuizEngine({
  assessmentId,
  moduleId,
  title: propTitle,
  type: propType,
  dueDate,
  maxScore,
  onComplete,
  timeLimitMinutes: propTimeLimitMinutes,
}: QuizEngineProps) {
  const navigate = useNavigate();

  // ── Self‑fetch assessment details (ensures correct title, time limit, module info) ──
  const { data: assessment } = useQuery({
    queryKey: ["assessment", assessmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assessments")
        .select(`
          id, title, assessment_type, time_limit_minutes,
          modules ( title, module_order )
        `)
        .eq("id", assessmentId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!assessmentId,
  });

  // Extract values from assessment (fallback to props if not loaded yet)
  const title = assessment?.title ?? propTitle ?? "";
  const type = (assessment?.assessment_type ?? propType ?? "Quiz") as "Quiz" | "Exam";
  const timeLimitMinutes = assessment?.time_limit_minutes ?? propTimeLimitMinutes ?? null;
  const moduleTitle = assessment?.modules?.[0]?.title ?? "";
  const moduleOrder = assessment?.modules?.[0]?.module_order ?? null;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentPage, setCurrentPage] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [antiCheatFlags, setAntiCheatFlags] = useState<string[]>([]);

  const fullscreenRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const PASS_THRESHOLD = 80;

  // ── Anti‑Cheating ──
  const enterFullscreen = useCallback(() => {
    const el = fullscreenRef.current;
    if (el?.requestFullscreen) el.requestFullscreen();
  }, []);

  useEffect(() => {
    enterFullscreen();
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setAntiCheatFlags(prev => [...prev, "fullscreen_exit"]);
        toast.error("Fullscreen mode is required. Please re‑enter fullscreen.");
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [enterFullscreen]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        setAntiCheatFlags(prev => [...prev, "tab_switch"]);
        toast.error("Tab switch detected! This incident has been logged.");
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Block copy/paste
  useEffect(() => {
    const block = (e: ClipboardEvent) => e.preventDefault();
    document.addEventListener("copy", block);
    document.addEventListener("paste", block);
    document.addEventListener("cut", block);
    return () => {
      document.removeEventListener("copy", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("cut", block);
    };
  }, []);

  // ── Fetch Questions ──
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("quiz_questions")
        .select("id, question, options, correct_index")
        .eq("assessment_id", assessmentId)
        .order("order", { ascending: true });

      if (error) {
        toast.error("Failed to load questions.");
        navigate(-1);
        return;
      }
      const shuffled = [...(data ?? [])].sort(() => Math.random() - 0.5);
      setQuestions(shuffled);
      // We’ll set the timer only after the assessment loads (see below)
    })();
  }, [assessmentId, navigate]);

  // ── Set timer only when assessment AND questions are ready ──
  useEffect(() => {
    if (assessment && questions.length > 0 && timeLeft === null) {
      const defaultTime = (assessment.assessment_type === "Exam" ? 60 : 20) * 60;
      const finalTime = assessment.time_limit_minutes
        ? assessment.time_limit_minutes * 60
        : defaultTime;
      setTimeLeft(finalTime);
      setLoading(false);
    }
  }, [assessment, questions, timeLeft]);

  // ── Countdown Timer ──
  useEffect(() => {
    if (submitted || timeLeft === null) return;
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev !== null && prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmit(true); // Auto-submit when time runs out
          return 0;
        }
        return prev ? prev - 1 : 0;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [submitted, timeLeft]);

  // ── Submit Handler ──
  const handleSubmit = async (isTimeout = false) => {
    if (submitted) return;

    // Only require all answers for manual submission
    if (!isTimeout && Object.keys(answers).length < questions.length) {
      toast.error("Please answer all questions before submitting.");
      return;
    }

    let correct = 0;
    questions.forEach(q => {
      if (answers[q.id] === q.correct_index) correct++;
    });
    const percentage = Math.round((correct / questions.length) * 100);
    const isPassed = percentage >= PASS_THRESHOLD;

    setScore(percentage);
    setPassed(isPassed);
    setSubmitted(true);
    setSaving(true);

    try {
      const { error: attemptErr } = await supabase.from("quiz_attempts").insert({
        assessment_id: assessmentId,
        student_id: (await supabase.auth.getUser()).data.user?.id,
        finished_at: new Date().toISOString(),
        score: percentage,
        passed: isPassed,
        anti_cheat_flags: [...antiCheatFlags, ...(isTimeout ? ["timeout"] : [])],
      });
      if (attemptErr) throw attemptErr;

      if (moduleId) {
        const { data: existing } = await supabase
          .from("module_progress")
          .select("attempts_count, highest_quiz_score")
          .eq("student_id", (await supabase.auth.getUser()).data.user?.id)
          .eq("module_id", moduleId)
          .maybeSingle();

        const newAttempts = (existing?.attempts_count ?? 0) + 1;
        const newHighest = Math.max(percentage, existing?.highest_quiz_score ?? 0);

        await supabase.from("module_progress").upsert({
          student_id: (await supabase.auth.getUser()).data.user?.id,
          module_id: moduleId,
          completed: isPassed,
          highest_quiz_score: newHighest,
          attempts_count: newAttempts,
          progress_percentage: isPassed ? 100 : undefined,
          completed_at: isPassed ? new Date().toISOString() : undefined,
        }, { onConflict: "student_id,module_id" });
      }

      toast.success(
        isPassed
          ? "Congratulations, you passed!"
          : isTimeout
          ? "Time's up! Your answers have been submitted."
          : "Score recorded. You can retake the quiz."
      );
    } catch (err: any) {
      toast.error(err.message || "Error saving attempt.");
    } finally {
      setSaving(false);
      clearInterval(timerRef.current!);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleJumpToQuestion = (index: number) => {
    setCurrentPage(index);
  };

  const answeredCount = Object.keys(answers).length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#3AAA35] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!loading && questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center px-6">
        <div className="text-5xl mb-4">📭</div>
        <h1 className="text-xl font-bold text-gray-800 mb-2">No questions yet</h1>
        <p className="text-sm text-gray-500 mb-6">
          This {type.toLowerCase()} hasn’t been populated with questions. Contact your instructor.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="bg-[#1B2A6B] hover:bg-[#152154] text-white font-semibold px-6 py-2.5 rounded-lg transition"
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const currentQuestion = questions[currentPage];

  return (
    <div ref={fullscreenRef} className="min-h-screen bg-gray-50 font-[DM_Sans]">
      {/* ── Slim Brand Header ── */}
      <div className="bg-gradient-to-r from-[#F47920] via-[#22C55E] to-[#2563EB] px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <img src="/newlogo.png" alt="CyberBill Africa" className="h-16 w-16 object-contain bg-white/10 p-1 rounded-lg" />
        </div>
        <div className="flex items-center gap-4">
          <span className="text-white text-xs bg-black/20 px-3 py-1 rounded-full">
            {answeredCount}/{questions.length} answered
          </span>
          {timeLeft !== null && !submitted && (
            <span className="bg-white/10 text-white text-sm font-mono px-4 py-1.5 rounded-full">
              ⏱ {formatTime(timeLeft)}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        {!submitted ? (
          <>
            {/* ── Quiz Title & Module Info ── */}
            <div className="mb-6">
              <span className="inline-block text-xs font-extrabold uppercase tracking-wider px-3 py-1 rounded-full bg-[#F47920]/10 text-[#F47920] border border-[#F47920]/30 mb-2">
                {type}
              </span>

              {moduleOrder && moduleTitle ? (
                <h6 className="text-base sm:text-3xl font-[Syne] font-extrabold text-gray-900 leading-tight">
                  Week {moduleOrder} • {moduleTitle}
                </h6>
              ) : (
                <h6 className="text-base sm:text-3xl font-[Syne] font-extrabold text-gray-900 leading-tight">
                  {title}
                </h6>
              )}
            </div>

            {/* ── Question Navigator ── */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-3">
                Question Navigator
              </p>
              <div className="flex flex-wrap gap-2">
                {questions.map((q, idx) => {
                  const isAnswered = answers[q.id] !== undefined;
                  const isCurrent = idx === currentPage;
                  return (
                    <button
                      key={q.id}
                      onClick={() => handleJumpToQuestion(idx)}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all border-2 ${
                        isCurrent
                          ? "border-[#F47920] bg-[#F47920]/10 text-[#F47920] scale-110 shadow"
                          : isAnswered
                          ? "bg-[#3AAA35] text-white border-[#3AAA35] hover:bg-[#2e872a]"
                          : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                      }`}
                      title={`Question ${idx + 1}${isAnswered ? " (answered)" : ""}`}
                    >
                      {idx + 1}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Current Question Card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="mb-6">
                <p className="text-xs text-gray-500 mb-2">
                  Question {currentPage + 1} of {questions.length}
                </p>
                <h2 className="text-lg font-bold text-gray-900 leading-relaxed">
                  {currentQuestion?.question}
                </h2>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {(currentQuestion?.options as string[]).map((opt, idx) => (
                  <label
                    key={idx}
                    className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition ${
                      answers[currentQuestion.id] === idx
                        ? "bg-[#3AAA35]/10 border-[#3AAA35] shadow-sm"
                        : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`q_${currentQuestion.id}`}
                      checked={answers[currentQuestion.id] === idx}
                      onChange={() =>
                        setAnswers(prev => ({ ...prev, [currentQuestion.id]: idx }))
                      }
                      className="w-5 h-5 text-[#3AAA35] accent-[#3AAA35]"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {String.fromCharCode(65 + idx)}. {opt}
                    </span>
                  </label>
                ))}
              </div>

              {/* Navigation Buttons */}
              <div className="flex justify-between mt-8">
                <button
                  onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                  disabled={currentPage === 0}
                  className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  ← Previous
                </button>

                {currentPage < questions.length - 1 ? (
                  <button
                    onClick={() => setCurrentPage(p => p + 1)}
                    className="px-5 py-2.5 bg-[#1B2A6B] text-white rounded-xl text-sm font-semibold hover:bg-[#152154] transition"
                  >
                    Next →
                  </button>
                ) : (
                  <button
                    onClick={() => handleSubmit()}
                    disabled={saving || answeredCount < questions.length}
                    className="px-8 py-2.5 bg-[#3AAA35] text-white font-bold rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#2e872a] transition shadow-sm"
                  >
                    {saving ? "Submitting..." : "Submit Quiz"}
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <div className={`text-5xl mb-4 ${passed ? "text-green-500" : "text-red-500"}`}>
              {passed ? "🎉" : "📚"}
            </div>
            <h2 className="text-2xl font-bold mb-2 text-gray-900">
              {passed ? "Congratulations! You Passed" : "Not Yet Passed"}
            </h2>
            <p className="text-lg text-gray-600 mb-4">
              Your score: {score}% (80% required to pass)
            </p>
            {passed ? (
              <button
                onClick={() => {
                  onComplete();
                  navigate(-1);
                }}
                className="bg-[#3AAA35] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#2e872a] transition"
              >
                Return to Dashboard
              </button>
            ) : (
              <button
                onClick={() => window.location.reload()}
                className="bg-[#F47920] text-white font-bold px-6 py-3 rounded-xl hover:bg-[#d66515] transition"
              >
                Retake Quiz
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}