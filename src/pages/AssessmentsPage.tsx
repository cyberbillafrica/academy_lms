import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import Papa from "papaparse";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

interface Module {
  id: string;
  title: string;
  module_order: number;
  courses?: { id: string; title: string } | null;
}

interface Assessment {
  id: string;
  module_id: string;
  title: string;
  instructions: string | null;
  assessment_type: string;
  max_score: number;
  due_date: string | null;
  time_limit_minutes?: number | null;
  modules?: {
    title: string;
    module_order: number;
    courses?: { id: string; title: string } | null;
  };
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "error";
}

const PAGE_SIZE = 10;

export default function AssessmentsPage() {
  const navigate = useNavigate();

  // Reference lists & structural loaders
  const [modules, setModules] = useState<Module[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissionCounts, setSubmissionCounts] = useState<Record<string, number>>({});
  const [isFetching, setIsFetching] = useState(true);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Form states
  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [assessmentType, setAssessmentType] = useState("Quiz");
  const [maxScore, setMaxScore] = useState("100");
  const [dueDate, setDueDate] = useState("");
  const [timeLimitMinutes, setTimeLimitMinutes] = useState("");
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<any>(null);

  // Modal & Edit context
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAutoAssign, setIsAutoAssign] = useState(true);

  // Question Manager State
  const [questionsModalAssessmentId, setQuestionsModalAssessmentId] = useState<string | null>(null);
  const [questionsList, setQuestionsList] = useState<any[]>([]);
  const [questionText, setQuestionText] = useState("");
  const [optionA, setOptionA] = useState("");
  const [optionB, setOptionB] = useState("");
  const [optionC, setOptionC] = useState("");
  const [optionD, setOptionD] = useState("");
  const [correctIndex, setCorrectIndex] = useState("0");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [importingCsv, setImportingCsv] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Bulk Question Paste Import
  const [bulkQuestionText, setBulkQuestionText] = useState("");
  const [parsedBulkQuestions, setParsedBulkQuestions] = useState<any[]>([]);
  const [showBulkPreview, setShowBulkPreview] = useState(false);
  const [importingBulkQuestions, setImportingBulkQuestions] = useState(false);

  // Server-driven Filtering and Index Limits
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Used to hold the created assessment ID for auto‑open question modal
  const createdAssessmentIdRef = useRef<string | null>(null);

  // ── Notification Alerts Dispenser ──
  const showToast = (message: string, type: "success" | "error" = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  };

  // ── Database Relations Mapping ──
  const fetchModules = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("modules")
        .select(`id, title, module_order, courses ( id, title )`)
        .order("module_order");
      if (error) throw error;
      setModules(data || []);
    } catch (err: any) {
      console.error("Failed loading modules:", err.message);
    }
  }, []);

  const fetchAssessments = useCallback(async () => {
    setIsFetching(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("assessments")
        .select(`*, modules!inner (title, module_order)`, { count: "exact" });

      if (searchTerm.trim()) {
        const cleanSearch = searchTerm.trim().replace(/[%,()]/g, "\\$&");
        query = query.or(`title.ilike.%${cleanSearch}%,assessment_type.ilike.%${cleanSearch}%`);
      }

      const { data, error: dbError, count } = await query
        .order("due_date", { ascending: true })
        .range(from, to);

      if (dbError) throw dbError;

      const items = (data as any) || [];
      setAssessments(items);
      setTotalCount(count ?? 0);

      if (items.length > 0) {
        const assessmentIds = items.map((a: any) => a.id);
        const { data: subData, error: subError } = await supabase
          .from("submissions")
          .select("assessment_id");

        if (!subError && subData) {
          const countMap: Record<string, number> = {};
          subData.forEach((row: any) => {
            if (assessmentIds.includes(row.assessment_id)) {
              countMap[row.assessment_id] = (countMap[row.assessment_id] || 0) + 1;
            }
          });
          setSubmissionCounts(countMap);
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed running search execution bounds queries.");
    } finally {
      setIsFetching(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  // ── Question Manager Helpers ──
  const fetchQuestions = async (assessmentId: string) => {
    const { data, error } = await supabase
      .from("quiz_questions")
      .select("*")
      .eq("assessment_id", assessmentId)
      .order("order", { ascending: true });
    if (!error) setQuestionsList(data ?? []);
  };

  const openQuestionsModal = (assessmentId: string) => {
    setQuestionsModalAssessmentId(assessmentId);
    fetchQuestions(assessmentId);
  };

  const closeQuestionsModal = () => {
    setQuestionsModalAssessmentId(null);
    setQuestionsList([]);
  };

  const handleAddQuestion = async () => {
  if (!questionsModalAssessmentId || !questionText.trim() || !optionA.trim() || !optionB.trim() || !optionC.trim() || !optionD.trim()) {
    showToast("Please fill all question fields", "error");
    return;
  }

  setAddingQuestion(true);
  const options = [optionA.trim(), optionB.trim(), optionC.trim(), optionD.trim()];

  try {
    if (editingQuestion) {
      // Update existing question
      const { error } = await supabase
        .from("quiz_questions")
        .update({
          question: questionText.trim(),
          options,
          correct_index: parseInt(correctIndex, 10),
        })
        .eq("id", editingQuestion.id);

      if (error) throw error;
      showToast("Question updated successfully");
      setEditingQuestion(null);
    } else {
      // Add new question
      const { error } = await supabase.from("quiz_questions").insert({
        assessment_id: questionsModalAssessmentId,
        question: questionText.trim(),
        options,
        correct_index: parseInt(correctIndex, 10),
        order: questionsList.length,
      });
      if (error) throw error;
      showToast("Question added successfully");
    }

    // Reset form
    setQuestionText("");
    setOptionA(""); setOptionB(""); setOptionC(""); setOptionD("");
    setCorrectIndex("0");
    fetchQuestions(questionsModalAssessmentId);
  } catch (err: any) {
    showToast(err.message || "Operation failed", "error");
  } finally {
    setAddingQuestion(false);
  }
};

  const handleDeleteQuestion = async (questionId: string) => {
    setDeletingQuestionId(questionId);
    const { error } = await supabase.from("quiz_questions").delete().eq("id", questionId);
    if (!error) {
      showToast("Question deleted");
      fetchQuestions(questionsModalAssessmentId!);
    } else {
      showToast(error.message, "error");
    }
    setDeletingQuestionId(null);
  };

    const handleEditQuestion = (question: any) => {
  setEditingQuestion(question);
  setQuestionText(question.question);
  setOptionA(question.options[0] || "");
  setOptionB(question.options[1] || "");
  setOptionC(question.options[2] || "");
  setOptionD(question.options[3] || "");
  setCorrectIndex(question.correct_index.toString());
};

  // ── CSV Import ──
  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !questionsModalAssessmentId) return;
    setImportingCsv(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
      const headers = lines[0]?.toLowerCase();
      if (!headers || !headers.includes("question")) {
        showToast("Invalid CSV format. First row must contain headers: question,option_a,option_b,option_c,option_d,correct_answer", "error");
        setImportingCsv(false);
        return;
      }
      const rows = lines.slice(1);
      const questions = rows.map((line, idx) => {
        const cols = line.split(',').map(col => col.trim());
        if (cols.length < 6) return null;
        const [question, optA, optB, optC, optD, correctLetter] = cols;
        const options = [optA, optB, optC, optD];
        const correctMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
        const correctIdx = correctMap[correctLetter?.toUpperCase()] ?? 0;
        return {
          assessment_id: questionsModalAssessmentId,
          question,
          options,
          correct_index: correctIdx,
          order: questionsList.length + idx,
        };
      }).filter(Boolean);
      if (questions.length === 0) {
        showToast("No valid rows found.", "error");
        setImportingCsv(false);
        return;
      }
      const { error } = await supabase.from("quiz_questions").insert(questions);
      if (error) throw error;
      showToast(`Imported ${questions.length} questions successfully!`);
      fetchQuestions(questionsModalAssessmentId);
    } catch (err: any) {
      showToast(err.message || "Import failed", "error");
    } finally {
      setImportingCsv(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    // ❗ No extra code after the finally block – this function ends here.
  };

    const normalizeBulkText = (t: string) => 
  t.replace(/^#{1,6}\s*/gm,"")
   .replace(/\*\*/g,"")
   .replace(/\*/g,"")
   .replace(/^>\s*/gm,"")
   .replace(/^[-•]\s*/gm,"")
   .replace(/^✅\s*/gm,"")
   .replace(/^[^\w\s]+\s*/gm,"")
   .replace(/\r/g,"")
   .replace(/\n{3,}/g,"\n\n")
   .split("\n").map(l=>l.trim()).join("\n").trim();

  // ── Bulk Plain Text Question Parser (corrected – only parsing) ──
  const parseBulkQuestions = () => {
    if (!bulkQuestionText.trim()) {
      showToast("Please paste quiz questions first.", "error");
      return;
    }
        const cleanedText = normalizeBulkText(bulkQuestionText);
         const blocks = cleanedText
         .split(/(?:Q(?:uestion)?\s*\d+[:.)]?|^\d+[.)])/gim)
        .map(block => block.trim())
        .filter(Boolean);
        
      const parsed = blocks.map((block, index) => {
      const lines = block.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      const question = lines[0];const optionLines = lines.filter(line =>/^[A-D][.)-]\s+/i.test(line));
      const options = optionLines.map(option =>option.replace(/^[A-D][.)-]\s*/i, "").trim());
      const answerLine = lines.find(line => /^(Answer|Correct Answer|Correct|Ans)\s*:/i.test(line));
      const answerLetter = answerLine?.match(/[A-D]/i)?.[0]?.toUpperCase() ?? '';
      const correctMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
      
      return {
        assessment_id: questionsModalAssessmentId,
        question,
        options,
        correct_index: correctMap[answerLetter || "A"],
        order: questionsList.length + index
      };
    }).filter(q => {

  if (!q.question || q.options.length !== 4) {
    console.warn("Rejected question:", q);
    return false;
  }

  return true;

});

    if (parsed.length === 0) {
      showToast("No valid questions detected. Check your format.", "error");
      return;
    }

    setParsedBulkQuestions(parsed);
    setShowBulkPreview(true);
  };

  // ── Confirm Bulk Import ──
  const confirmBulkImport = async () => {
    if (!questionsModalAssessmentId || parsedBulkQuestions.length === 0) {
      showToast("No questions to import.", "error");
      return;
    }
    setImportingBulkQuestions(true);
    try {
      const { error } = await supabase.from("quiz_questions").insert(parsedBulkQuestions);
      if (error) throw error;
      showToast(`${parsedBulkQuestions.length} questions imported successfully`);
      setBulkQuestionText("");
      setParsedBulkQuestions([]);
      setShowBulkPreview(false);
      fetchQuestions(questionsModalAssessmentId);
    } catch (err: any) {
      showToast(err.message || "Import failed", "error");
    } finally {
      setImportingBulkQuestions(false);
    }
  };

  // ── Layout Control Transitions ──
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  const resetForm = () => {
    setTitle("");
    setModuleId("");
    setInstructions("");
    setAssessmentType("Quiz");
    setMaxScore("100");
    setDueDate("");
    setTimeLimitMinutes("");
    setEditingAssessment(null);
    setError(null);
  };

  const openEditModal = (assessment: Assessment) => {
    setEditingAssessment(assessment);
    setModuleId(assessment.module_id);
    setTitle(assessment.title);
    setInstructions(assessment.instructions ?? "");
    setAssessmentType(assessment.assessment_type);
    setMaxScore(assessment.max_score.toString());
    setTimeLimitMinutes(assessment.time_limit_minutes?.toString() ?? "");
    if (assessment.due_date) {
      const d = new Date(assessment.due_date);
      const isoStr = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
      setDueDate(isoStr.slice(0, 16));
    } else {
      setDueDate("");
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
  };

  // ── Database Modification Controls ──
  const saveAssessment = async () => {
    if (!moduleId || !title.trim() || !maxScore) {
      setError("Please fill all required fields");
      return;
    }

    const scoreNum = parseInt(maxScore);
    if (isNaN(scoreNum) || scoreNum <= 0) {
      setError("Max score must be a valid positive number");
      return;
    }

    setLoading(true);
    setError(null);

    const payload = {
      module_id: moduleId,
      title: title.trim(),
      instructions: instructions.trim() || null,
      assessment_type: assessmentType,
      max_score: scoreNum,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      time_limit_minutes: timeLimitMinutes ? parseInt(timeLimitMinutes, 10) : null,
    };

    try {
      let dbError: any = null;
      let createdAssessmentId: string | null = null;

      if (editingAssessment) {
        const { error } = await supabase
          .from("assessments")
          .update(payload)
          .eq("id", editingAssessment.id);
        dbError = error;
      } else {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user?.id) {
          setError("Unable to verify your identity. Please refresh and try again.");
          setLoading(false);
          return;
        }

        const insertResp = await supabase
          .from("assessments")
          .insert([{ ...payload, created_by: user.id }])
          .select();

        const insertError = (insertResp as any).error;
        const insertData = (insertResp as any).data;
        if (insertError) {
          dbError = insertError;
        } else if (!insertData || insertData.length === 0) {
          dbError = new Error("Failed to create assessment record");
        } else {
          const createdAssessment = insertData[0];
          createdAssessmentId = createdAssessment.id;

          // auto-assign assessment to students in the parent course
          try {
            const moduleObj = modules.find((m) => m.id === createdAssessment.module_id);
            let courseId: string | undefined = moduleObj?.courses?.id;

            if (!courseId) {
              const { data: moduleData } = await supabase
                .from("modules")
                .select("course_id")
                .eq("id", createdAssessment.module_id)
                .single();
              courseId = moduleData?.course_id;
            }

            if (courseId) {
              const { data: students } = await supabase
                .from("student_course_assignments")
                .select("student_id")
                .eq("course_id", courseId);

              const studentRows = (students as any[]) || [];
              if (studentRows.length > 0) {
                const assignments = studentRows.map((s) => ({
                  assessment_id: createdAssessment.id,
                  student_id: s.student_id,
                  assigned_by: user.id,
                }));
                const { error: assignErr } = await supabase
                  .from("assessment_assignments")
                  .insert(assignments);
                if (assignErr) console.warn("Failed auto-assigning assessment:", assignErr.message || assignErr);
              }
            }
          } catch (assignEx: any) {
            console.warn("Auto-assignment skipped due to error:", assignEx?.message || assignEx);
          }
        }
      }

      if (dbError) throw dbError;

      showToast(editingAssessment ? "Assessment updated successfully!" : "Assessment created successfully!");

      // If it's a new Quiz/Exam and not editing, open question manager after creation
      if (!editingAssessment && createdAssessmentId && (assessmentType === "Quiz" || assessmentType === "Exam")) {
        closeModal();                         // close creation modal
        await fetchAssessments();             // refresh the table
        openQuestionsModal(createdAssessmentId); // open question manager
        return;
      }

      closeModal();
      setCurrentPage(1);
      await fetchAssessments();
    } catch (err: any) {
      setError(err.message || "Something went wrong saving the profile.");
    } finally {
      setLoading(false);
    }
  };

  const deleteAssessment = async (id: string) => {
    const existingSubs = submissionCounts[id] || 0;
    if (existingSubs > 0) {
      if (!confirm(`Warning: This assessment has ${existingSubs} student submissions recorded. Deleting this configuration layer will wipe student grades permanently. Do you still want to proceed?`)) {
        return;
      }
    } else {
      if (!confirm("Delete this assessment permanently? This layer cannot be undone.")) return;
    }
    setDeletingId(id);
    setError(null);
    try {
      const { error: delError } = await supabase.from("assessments").delete().eq("id", id);
      if (delError) throw delError;
      showToast("Assessment configuration deleted successfully");
      if (assessments.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        await fetchAssessments();
      }
    } catch (err: any) {
      setError(err.message || "Failed execution constraints database deletions.");
    } finally {
      setDeletingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      {/* Action Header Workspace */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Assessment Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Configure system criteria, modify threshold metrics, and associate evaluations with modules.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start md:self-center">
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 active:bg-gray-100 transition"
          >
            <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
            </svg>
            Dashboard
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-sm flex items-center gap-2 transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            New Assessment
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-3 mb-6 rounded-xl flex justify-between items-center text-sm">
          <span className="font-medium">{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline hover:text-red-800 font-bold">Dismiss</button>
        </div>
      )}

      {/* Search Filter Controls */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search assessments by profile title or evaluation category type..."
          className="w-full border border-gray-300 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 rounded-xl px-4 py-3.5 text-base text-gray-900 placeholder-gray-400 outline-none shadow-sm transition"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
      </div>

      {/* Main Presentation Layers */}
      <div className="bg-white shadow-sm border border-gray-200/80 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50/70 border-b border-gray-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Module Map Context</th>
                <th className="px-6 py-4">Assessment Title</th>
                <th className="px-6 py-4">Type</th>
                <th className="px-6 py-4">Max Score</th>
                <th className="px-6 py-4">Submissions</th>
                <th className="px-6 py-4">Due Date</th>
                <th className="px-6 py-4 text-center">Actions Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-800">
              {isFetching ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-400">
                    <span className="inline-flex items-center gap-2">
                      <svg className="h-5 w-5 animate-spin text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      Parsing schema definitions...
                    </span>
                  </td>
                </tr>
              ) : assessments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-gray-500 font-medium">
                    {searchTerm ? "No structural evaluation criteria match your text constraints." : "No evaluations instantiated. Build parameters using the action tool above."}
                  </td>
                </tr>
              ) : (
                assessments.map((assessment) => {
                  const subCount = submissionCounts[assessment.id] || 0;
                  return (
                    <tr key={assessment.id} className="hover:bg-slate-50/80 transition group">
                      <td className="px-6 py-4.5 font-medium text-slate-900">
                        <span className="inline-block bg-slate-100 group-hover:bg-cyan-100 text-slate-800 group-hover:text-cyan-900 text-xs font-bold px-2 py-0.5 rounded mr-2 transition">
                          Wk {assessment.modules?.module_order}
                        </span>
                        {assessment.modules?.title}
                      </td>
                      <td className="px-6 py-4.5 font-semibold text-gray-900">{assessment.title}</td>
                      <td className="px-6 py-4.5">
                        <span className="inline-block px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 border border-gray-200">
                          {assessment.assessment_type}
                        </span>
                      </td>
                      <td className="px-6 py-4.5 font-mono text-slate-700 font-semibold">{assessment.max_score} pts</td>
                      <td className="px-6 py-4.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                          subCount > 0 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-gray-100 text-gray-500"
                        }`}>
                          {subCount} submitted
                        </span>
                      </td>
                      <td className="px-6 py-4.5 text-slate-600">
                        {assessment.due_date ? new Date(assessment.due_date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : "—"}
                      </td>
                      <td className="px-6 py-4.5 text-center">
                        <div className="flex gap-4 justify-center items-center">
                          <button
                            onClick={() => navigate(`/submissions?assessmentId=${assessment.id}`)}
                            className="text-[#3AAA35] hover:underline text-xs font-bold uppercase tracking-wider"
                          >
                            Grade
                          </button>
                          <button
                            onClick={() => navigate(`/assessments/manage?id=${assessment.id}`)}
                            className="text-[#1E3A8A] hover:underline text-xs font-bold uppercase tracking-wider"
                          >
                            Assign
                          </button>
                          <button
                            onClick={() => openEditModal(assessment)}
                            className="text-cyan-600 hover:underline text-xs font-bold uppercase tracking-wider"
                          >
                            Edit
                          </button>
                          {(assessment.assessment_type === "Quiz" || assessment.assessment_type === "Exam") && (
                            <button
                              onClick={() => openQuestionsModal(assessment.id)}
                              className="text-indigo-600 hover:underline text-xs font-bold uppercase tracking-wider"
                            >
                              Questions
                            </button>
                          )}
                          <button
                            onClick={() => deleteAssessment(assessment.id)}
                            disabled={deletingId === assessment.id}
                            className="text-rose-600 hover:underline text-xs font-bold uppercase tracking-wider disabled:opacity-50 inline-flex items-center"
                          >
                            {deletingId === assessment.id ? "Wiping..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!isFetching && totalCount > PAGE_SIZE && (
          <div className="flex justify-between items-center px-6 py-4 bg-slate-50 border-t border-gray-200 text-xs font-medium text-slate-600">
            <p>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount} records
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-gray-300 bg-white rounded-xl hover:bg-gray-50 transition disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-3 py-1.5 bg-cyan-50 border border-cyan-200 rounded-xl font-bold text-cyan-700">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 border border-gray-300 bg-white rounded-xl hover:bg-gray-50 transition disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating System Toasts Canvas */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`px-5 py-3.5 rounded-xl shadow-xl text-white text-sm font-semibold tracking-wide flex items-center gap-2 transition ${
              toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
            }`}
          >
            {toast.type === "success" ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            )}
            {toast.message}
          </div>
        ))}
      </div>

      {/* Modal Drop – Create / Edit Assessment */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-100 flex flex-col overflow-hidden max-h-[90vh]">
            <div className="p-6 overflow-y-auto space-y-5">
              <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">
                {editingAssessment ? "Modify Assessment Record" : "Instantiate Assessment Criteria"}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Target Module</label>
                  <select
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none bg-white transition"
                    value={moduleId}
                    onChange={(e) => setModuleId(e.target.value)}
                  >
                    <option value="">Select Target Module Context...</option>
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.courses?.title ?? "No Course"} → Week {m.module_order}: {m.title}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 mt-2">
                  <input 
                    type="checkbox" 
                    checked={isAutoAssign} 
                    onChange={(e) => setIsAutoAssign(e.target.checked)} 
                  />
                  <span className="text-sm font-semibold text-gray-700">Auto-assign to all enrolled students</span>
                </label>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Assessment Title</label>
                  <input
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                    placeholder="e.g., Vulnerability Vectors Lab Evaluation"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Instructions</label>
                  <textarea
                    rows={4}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                    placeholder="Describe what students must do, deliverables, grading rubric…"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Category Type</label>
                    <select
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none bg-white transition"
                      value={assessmentType}
                      onChange={(e) => setAssessmentType(e.target.value)}
                    >
                      <option value="Quiz">Quiz</option>
                      <option value="Assignment">Assignment</option>
                      <option value="Project">Project</option>
                      <option value="Exam">Exam</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Max Target Score</label>
                    <input
                      type="number"
                      min="1"
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                      value={maxScore}
                      onChange={(e) => setMaxScore(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Due Date Execution Limit</label>
                  <input
                    type="datetime-local"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1.5">Time Limit (minutes, optional)</label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Leave blank for default"
                    value={timeLimitMinutes}
                    onChange={(e) => setTimeLimitMinutes(e.target.value)}
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-700 placeholder-gray-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 outline-none transition"
                  />
                </div>

                {/* Manage Questions button when editing a Quiz/Exam */}
                {editingAssessment && (editingAssessment.assessment_type === "Quiz" || editingAssessment.assessment_type === "Exam") && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        openQuestionsModal(editingAssessment.id);
                      }}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase py-2.5 rounded-xl transition tracking-wider"
                    >
                      Manage Questions ({editingAssessment.assessment_type === "Quiz" ? "Quiz" : "Exam"})
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex gap-3 border-t border-slate-100 justify-end">
              <button
                onClick={closeModal}
                className="px-4 py-2 text-sm font-semibold border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={saveAssessment}
                disabled={loading}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-400 text-white font-semibold text-sm rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition"
              >
                {loading && <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {loading ? "Processing..." : editingAssessment ? "Save Profile Changes" : "Instantiate Entry"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Question Manager Modal */}
      {questionsModalAssessmentId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl border border-gray-100">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="font-bold text-lg text-gray-900">Manage Quiz Questions</h2>
              <button
                onClick={closeQuestionsModal}
                className="text-gray-400 hover:text-gray-600 text-2xl p-1 rounded-lg hover:bg-gray-100"
              >
                &times;
              </button>
            </div>

            {/* Bulk CSV Import */}
            <div className="px-6 pt-4 pb-2 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Bulk Import via CSV</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvImport}
                disabled={importingCsv}
                className="block w-full text-xs text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"
              />
              {importingCsv && <p className="text-xs text-gray-400 mt-1">Importing…</p>}
            </div>

            {/* Bulk Paste Question Import */}
            <div className="px-6 pt-4 pb-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">
                Bulk Paste Quiz Questions
              </p>

              <textarea
                rows={12}
                value={bulkQuestionText}
                onChange={(e) => setBulkQuestionText(e.target.value)}
                placeholder={`Paste questions in this format:\nQuestion 1:\nWhat is cybersecurity?\nA. Protecting digital assets\nB. Writing software\nC. Designing websites\nD. Managing databases\nAnswer: A`}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm text-gray-700 outline-none focus:border-indigo-500"
              />

              <button
                onClick={parseBulkQuestions}
                className="mt-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm"
              >
                Analyze Questions
              </button>

              {/* Preview and Confirm Import */}
            {showBulkPreview && parsedBulkQuestions.length > 0 && (
              <div className="mt-4 border-t border-gray-200 pt-4">
                <h4 className="font-semibold text-sm text-gray-700 mb-3">
                  Preview ({parsedBulkQuestions.length} questions)
                </h4>
                
                <div className="max-h-60 overflow-y-auto space-y-3 pr-2">
                  {parsedBulkQuestions.map((q, idx) => (
                    <div key={idx} className="border rounded-xl p-4 bg-gray-50">
                      <p className="font-semibold mb-3 text-gray-800">
                        {idx + 1}. {q.question}
                      </p>
                      
                      <ul className="space-y-1 text-sm text-gray-600">
                        {q.options.map((opt: string, optIdx: number) => (
                          <li
                            key={optIdx}
                            className={optIdx === q.correct_index ? "text-emerald-600 font-bold" : ""}
                          >
                            {String.fromCharCode(65 + optIdx)}. {opt}
                            {optIdx === q.correct_index && " ✓"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={confirmBulkImport}   // or importBulkQuestions
                    disabled={importingBulkQuestions}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 transition"
                  >
                    {importingBulkQuestions ? "Importing…" : "Confirm & Import"}
                  </button>    
                  <button
                    onClick={() => {
                      setShowBulkPreview(false);
                      setParsedBulkQuestions([]);
                    }}
                    className="text-gray-500 hover:text-gray-700 text-sm underline py-2.5"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Add new question form */}
            <div className="p-6 border-b border-gray-100 bg-slate-50 space-y-4">
              <h3 className="font-semibold text-sm text-gray-700">{editingQuestion ? "Edit Question" : "Add New Question"}</h3>
             <input
                type="text"
                placeholder="Enter the question text"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-cyan-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder="Option A" value={optionA} onChange={(e) => setOptionA(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm text-gray-700 placeholder-gray-400" />
                <input type="text" placeholder="Option B" value={optionB} onChange={(e) => setOptionB(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm text-gray-700 placeholder-gray-400" />
                <input type="text" placeholder="Option C" value={optionC} onChange={(e) => setOptionC(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm text-gray-700 placeholder-gray-400" />
                <input type="text" placeholder="Option D" value={optionD} onChange={(e) => setOptionD(e.target.value)} className="border border-gray-300 rounded-lg p-2 text-sm text-gray-700 placeholder-gray-400" />
              </div>
              <div className="flex items-center gap-4">
                <label className="text-sm font-semibold text-gray-700">Correct Answer:</label>
                <select
                  value={correctIndex}
                  onChange={(e) => setCorrectIndex(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2 text-sm text-gray-700"
                >
                  <option value="0">A</option>
                  <option value="1">B</option>
                  <option value="2">C</option>
                  <option value="3">D</option>
                </select>
              </div>
              <button
                onClick={handleAddQuestion}
                disabled={addingQuestion}
                className="bg-cyan-600 hover:bg-cyan-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm disabled:opacity-50 transition"
              >
                {addingQuestion ? "Adding..." : "Add Question"}
              </button>
            </div>

            {/* Existing questions list */}
            <div className="p-6">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">
                Questions ({questionsList.length})
              </h3>
              {questionsList.length === 0 ? (
                <p className="text-xs text-gray-400">No questions added yet. Use the form above or import a CSV to add your first question.</p>
              ) : (
                <div className="space-y-3">
                  {questionsList.map((q, idx) => (
                    <div key={q.id} className="border border-gray-200 rounded-xl p-4 text-sm flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">
                          {idx + 1}. {q.question}
                        </p>
                        <ul className="mt-2 pl-4 text-xs text-gray-600 space-y-0.5">
                          {Array.isArray(q.options) && q.options.map((opt: string, optIdx: number) => (
                            <li key={optIdx} className={optIdx === q.correct_index ? "font-bold text-emerald-600" : ""}>
                              {String.fromCharCode(65 + optIdx)}. {opt} {optIdx === q.correct_index && " ✓"}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex items-center gap-4 ml-4">
                        <button
                          onClick={() => handleEditQuestion(q)}
                          className="text-blue-600 hover:text-blue-700 text-xs font-bold hover:underline transition"
                        >
                          Edit
                        </button>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        disabled={deletingQuestionId === q.id}
                        className="text-red-500 hover:underline text-xs font-bold ml-4"
                      >
                        {deletingQuestionId === q.id ? "Deleting..." : "Delete"}
                      </button>
                   </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      )}
    </div>
  );
}