// src/components/student/StudentQuizEngine.tsx
import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
}

interface StudentQuizEngineProps {
  isOpen: boolean;
  onClose: () => void;
  moduleId: string;
  moduleTitle: string;
  questions: QuizQuestion[];
  passScore: number;
  studentId: string;
  onComplete: () => void;  // Callback to refresh progress
}

export default function StudentQuizEngine({
  isOpen,
  onClose,
  moduleId,
  moduleTitle,
  questions,
  passScore,
  studentId,
  onComplete,
}: StudentQuizEngineProps) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [passed, setPassed] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [highestScore, setHighestScore] = useState(0);

  if (!isOpen) return null;

  const calculateScore = () => {
    let correct = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correct) correct++;
    });
    return Math.round((correct / questions.length) * 100);
  };

  const handleSubmit = async () => {
    const answeredCount = Object.keys(answers).length;
    if (answeredCount < questions.length) {
      setFeedback(`⚠️ Please answer all ${questions.length} questions.`);
      return;
    }

    setLoading(true);
    const calculatedScore = calculateScore();
    const hasPassed = calculatedScore >= passScore;
    const newAttempts = attempts + 1;
    const newHighestScore = Math.max(calculatedScore, highestScore);

    setScore(calculatedScore);
    setSubmitted(true);
    setPassed(hasPassed);

    if (hasPassed) {
      setFeedback(`🎉 Excellent! You scored ${calculatedScore}% and passed!`);
      
      await supabase.from("module_progress").upsert({
        student_id: studentId,
        module_id: moduleId,
        completed: true,
        completed_at: new Date().toISOString(),
        highest_quiz_score: newHighestScore,
        attempts_count: newAttempts,
      }, { onConflict: "student_id,module_id" });
      
      setTimeout(() => {
        onComplete();
        onClose();
      }, 2000);
    } else {
      setFeedback(`📚 Score: ${calculatedScore}%. Need ${passScore}% to pass. Try again!`);
      
      await supabase.from("module_progress").upsert({
        student_id: studentId,
        module_id: moduleId,
        completed: false,
        highest_quiz_score: newHighestScore,
        attempts_count: newAttempts,
      }, { onConflict: "student_id,module_id" });
    }
    
    setLoading(false);
  };

  const resetQuiz = () => {
    setAnswers({});
    setSubmitted(false);
    setScore(null);
    setPassed(false);
    setFeedback("");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="font-bold text-xl text-[#1B2A6B]">Quiz: {moduleTitle}</h2>
            <p className="text-xs text-gray-500 mt-1">{questions.length} questions • Pass: {passScore}%</p>
          </div>
          {!submitted && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-lg">✕</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!submitted ? (
            <div className="space-y-6">
              {questions.map((q, idx) => (
                <div key={idx} className="border rounded-xl p-5 bg-gray-50/50">
                  <p className="font-bold text-gray-800 mb-4">{idx + 1}. {q.question}</p>
                  <div className="space-y-3 pl-4">
                    {q.options.map((opt, optIdx) => (
                      <label key={optIdx} className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg transition ${
                        answers[idx] === optIdx ? 'bg-[#3AAA35]/10 border border-[#3AAA35]/30' : 'hover:bg-gray-100'
                      }`}>
                        <input
                          type="radio"
                          name={`q${idx}`}
                          checked={answers[idx] === optIdx}
                          onChange={() => setAnswers(prev => ({ ...prev, [idx]: optIdx }))}
                          className="w-4 h-4 text-[#3AAA35]"
                        />
                        <span className="text-sm text-gray-700">{String.fromCharCode(65 + optIdx)}. {opt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              
              {feedback && <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">{feedback}</div>}
              
              <div className="bg-gray-100 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">{Object.keys(answers).length} of {questions.length} answered</p>
                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                  <div className="bg-[#3AAA35] h-1.5 rounded-full transition-all" style={{ width: `${(Object.keys(answers).length / questions.length) * 100}%` }} />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className={`text-7xl mb-4 ${passed ? 'text-green-500' : 'text-red-500'}`}>{passed ? '🎉🏆' : '📚💪'}</div>
              <h3 className={`text-2xl font-bold mb-2 ${passed ? 'text-green-600' : 'text-red-600'}`}>{passed ? 'Quiz Passed!' : 'Keep Learning!'}</h3>
              <div className="inline-block bg-gray-100 rounded-xl px-6 py-3 mb-4">
                <p className="text-3xl font-bold text-[#1B2A6B]">{score}%</p>
                <p className="text-xs text-gray-500">Your Score</p>
              </div>
              <p className="text-gray-600 mb-4">{feedback}</p>
              {!passed && (
                <button onClick={resetQuiz} className="bg-[#F47920] hover:bg-[#d66515] text-white font-semibold px-8 py-2.5 rounded-lg transition">Try Again</button>
              )}
            </div>
          )}
        </div>

        {!submitted && (
          <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end">
            <button onClick={handleSubmit} disabled={loading || Object.keys(answers).length < questions.length} className="bg-[#1B2A6B] hover:bg-[#152154] disabled:bg-gray-400 text-white font-semibold px-8 py-2.5 rounded-lg transition">
              {loading ? 'Grading...' : 'Submit Quiz'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}