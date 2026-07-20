import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
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
import RichTextEditor from "../components/RichTextEditor";
import CollapsibleCard from '../components/CollapsibleCard';

interface Course {
  id: string;
  title: string;
}

interface Module {
  id: string;
  course_id: string;
  title: string;
  content: string | null;
  module_order: number;
  quiz_enabled: boolean;
  quiz_questions: QuizQuestion[] | null;
  quiz_pass_score: number;
  lab_steps?: string | null;
  assignment_text?: string | null;
  capstone_task?: string | null;
  live_class_notes?: string | null;
  whatsapp_activity?: string | null;
  courses?: {
    title: string;
  };
}

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number; // index of correct answer (0-3)
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  content: string | null;
  lesson_order: number;
  quiz_enabled: boolean;
  quiz_questions: QuizQuestion[] | null;
  quiz_pass_score: number;
  created_at?: string;
}

const PAGE_SIZE = 10;
const LESSON_QUIZ_LENGTH = 4; // knowledge-check questions per lesson
const DEFAULT_MODULE_QUIZ_PASS_SCORE = 75;
const LESSON_QUIZ_PASS_SCORE = 100;

const blankQuizQuestion = (): QuizQuestion => ({
  question: "",
  options: ["", "", "", ""],
  correct: 0,
});

const blankLessonQuestions = (): QuizQuestion[] =>
  Array.from({ length: LESSON_QUIZ_LENGTH }, blankQuizQuestion);

// PostgREST .or() filters break on unescaped %, comma, and parens in user
// input (comma separates filter clauses, parens group them). Escape before
// interpolating into any ilike pattern.
const escapeForIlike = (raw: string) => raw.replace(/[%,()]/g, "\\$&");

export default function ModulesPage() {
  const navigate = useNavigate();

  // Reference Catalogs State
  const [courses, setCourses] = useState<Course[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [isFetching, setIsFetching] = useState(true);

  // Form Creation State
  const [courseId, setCourseId] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [weekNumber, setWeekNumber] = useState("");
  const [liveClassNotes, setLiveClassNotes] = useState("");
  const [labSteps, setLabSteps] = useState("");
  const [assignmentText, setAssignmentText] = useState("");
  const [whatsappActivity, setWhatsappActivity] = useState("");
  const [capstoneTask, setCapstoneTask] = useState("");
  const [loading, setLoading] = useState(false);

  // Quiz Builder State
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const [editingModuleForQuiz, setEditingModuleForQuiz] = useState<Module | null>(null);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([blankQuizQuestion()]);

  const [quizPassScore, setQuizPassScore] = useState(DEFAULT_MODULE_QUIZ_PASS_SCORE);
  const [quizSaving, setQuizSaving] = useState(false);

  // Lesson Manager State
  const [lessonManagerOpen, setLessonManagerOpen] = useState(false);
  const [activeModuleForLessons, setActiveModuleForLessons] = useState<Module | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonsLoading, setLessonsLoading] = useState(false);
  const [lessonFormMode, setLessonFormMode] = useState<"create" | "edit">("create");
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState("");
  const [lessonOrder, setLessonOrder] = useState("");
  const [lessonContent, setLessonContent] = useState("");
  const [lessonQuizQuestions, setLessonQuizQuestions] = useState<QuizQuestion[]>(
    blankLessonQuestions()
  );

  const [bulkLessonText, setBulkLessonText] = useState("");
  const [lessonPreviewQuestions, setLessonPreviewQuestions] = useState<QuizQuestion[]>([]);
  const [showLessonPreview, setShowLessonPreview] = useState(false);

  const [lessonSaving, setLessonSaving] = useState(false);
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);

  // Form Inline Editing State
  const [editLoading, setEditLoading] = useState(false);
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  const [editCourseId, setEditCourseId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editWeekNumber, setEditWeekNumber] = useState("");
  const [editLiveClassNotes, setEditLiveClassNotes] = useState("");
  const [editLabSteps, setEditLabSteps] = useState("");
  const [editAssignmentText, setEditAssignmentText] = useState("");
  const [editWhatsappActivity, setEditWhatsappActivity] = useState("");
  const [editCapstoneTask, setEditCapstoneTask] = useState("");

  // System Notification Status
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "">("");

  // Search and Server-Driven Pagination Limits
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalModulesCount, setTotalModulesCount] = useState(0);

  // ── Fetch Shared Course Catalog Dropdown Reference ──────────────────────────
  const fetchCoursesCatalog = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title")
        .order("title");
      if (error) throw error;
      setCourses(data || []);
    } catch (err: any) {
      console.error("Error loading courses dropdown framework:", err.message);
    }
  }, []);

  // ── Upload images from the rich text editors to Supabase Storage ────────────
  // Wrapped in useCallback with a stable identity: RichTextEditor may use this
  // prop inside its own effects/config, and a new function reference on every
  // keystroke can cause it to reinitialize (which looks like the editor
  // "closing" mid-type).
  const uploadImageToSupabase = useCallback(async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const { error } = await supabase.storage
        .from("course-media")
        .upload(fileName, file);
      if (error) throw error;
      const { data } = supabase.storage.from("course-media").getPublicUrl(fileName);
      return data.publicUrl;
    } catch (err: any) {
      setStatusMessage(err.message || "Image upload failed.");
      setStatusType("error");
      return null;
    }
  }, []);

  // ── Fetch Modules (Paginated & Filtered via Server Engine) ──────────────────
  const fetchModules = useCallback(async () => {
    setIsFetching(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      // courses!inner is required so PostgREST allows filtering on the
      // embedded table's columns (courses.title) in the .or() below. This
      // is safe as long as course_id is required on modules (deleting a
      // course would then also need to cascade or restrict on modules).
      let query = supabase
        .from("modules")
        .select(
          `
          id,
          course_id,
          title,
          content,
          module_order,
          quiz_enabled,
          quiz_questions,
          quiz_pass_score,
          lab_steps,
          assignment_text,
          capstone_task,
          live_class_notes,
          whatsapp_activity,
          courses!inner ( title )
        `,
          { count: "exact" }
        );

      if (searchTerm.trim()) {
        const cleanSearch = escapeForIlike(searchTerm.trim());
        query = query.or(
          `title.ilike.%${cleanSearch}%,courses.title.ilike.%${cleanSearch}%`
        );
      }

      const { data, error, count } = await query
        .order("module_order", { ascending: true })
        .range(from, to);

      if (error) throw error;

      setModules((data as any) ?? []);
      setTotalModulesCount(count ?? 0);
    } catch (err: any) {
      console.error("Error query executions on modules view:", err.message);
      setStatusMessage("Unable to load academic modules catalog context.");
      setStatusType("error");
    } finally {
      setIsFetching(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchCoursesCatalog();
  }, [fetchCoursesCatalog]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // ── Auto-clear Notification Banners ──────────────────────────────────────────
  useEffect(() => {
    if (!statusMessage) return;
    const timer = setTimeout(() => {
      setStatusMessage("");
      setStatusType("");
    }, 5000);
    return () => clearTimeout(timer);
  }, [statusMessage]);

  // ── Search State Dispatch ───────────────────────────────────────────────────
  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  // ── Create Module Form Submission ───────────────────────────────────────────
  const createModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatusMessage("");
    setStatusType("");

    const weekInt = parseInt(weekNumber);
    if (!courseId || !title.trim() || isNaN(weekInt) || weekInt <= 0) {
      setStatusMessage(
        "Please specify a valid parent course track, title, and sequential week integer."
      );
      setStatusType("error");
      return;
    }

    setLoading(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.id) {
        setStatusMessage(
          "Unable to verify your identity. Please refresh and try again."
        );
        setStatusType("error");
        setLoading(false);
        return;
      }

      const { data: insertedRows, error: insertErr } = await supabase
        .from("modules")
        .insert({
          course_id: courseId,
          title: title.trim(),
          content: content.trim() || null,
          module_order: weekInt,
          created_by: user.id,
          quiz_enabled: false,
          quiz_pass_score: DEFAULT_MODULE_QUIZ_PASS_SCORE,
          live_class_notes: liveClassNotes.trim() || null,
          lab_steps: labSteps.trim() || null,
          assignment_text: assignmentText.trim() || null,
          whatsapp_activity: whatsappActivity.trim() || null,
          capstone_task: capstoneTask.trim() || null,
        })
        .select("id, module_order");

      if (insertErr) throw insertErr;

      const created = insertedRows?.[0];

      setStatusMessage("Module assigned and registered successfully.");
      setStatusType("success");
      setTitle("");
      setContent("");
      setWeekNumber("");
      setLiveClassNotes("");
      setLabSteps("");
      setAssignmentText("");
      setWhatsappActivity("");
      setCapstoneTask("");

      // Determine page where the new module appears (ordered by module_order)
      // and navigate there so the user can see the newly created module.
      if (created?.module_order != null) {
        try {
          const { count, error: countErr } = await supabase
            .from("modules")
            .select("id", { count: "exact" })
            .lte("module_order", created.module_order);
          if (countErr) throw countErr;
          const position = count ?? 0;
          const targetPage = Math.max(1, Math.ceil(position / PAGE_SIZE));
          setCurrentPage(targetPage);
          // fetchModules will run via the currentPage effect; also fetch
          // immediately to reduce perceived latency.
          await fetchModules();
        } catch (err) {
          // Fallback: refresh current page
          await fetchModules();
        }
      } else {
        if (currentPage !== 1) {
          setCurrentPage(1);
        } else {
          await fetchModules();
        }
      }
    } catch (err: any) {
      setStatusMessage(err.message || "An unexpected validation crash occurred.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // ── Inline Edit Form Layout Actions ─────────────────────────────────────────
  const startEditModule = (mod: Module) => {
    setEditingModuleId(mod.id);
    setEditCourseId(mod.course_id);
    setEditTitle(mod.title);
    setEditContent(mod.content ?? "");
    setEditWeekNumber(mod.module_order.toString());
    setEditLiveClassNotes(mod.live_class_notes ?? "");
    setEditLabSteps(mod.lab_steps ?? "");
    setEditAssignmentText(mod.assignment_text ?? "");
    setEditWhatsappActivity(mod.whatsapp_activity ?? "");
    setEditCapstoneTask(mod.capstone_task ?? "");
    setStatusMessage("");
    setStatusType("");
  };

  const cancelEdit = () => {
    setEditingModuleId(null);
    setEditCourseId("");
    setEditTitle("");
    setEditContent("");
    setEditWeekNumber("");
    setEditLiveClassNotes("");
    setEditLabSteps("");
    setEditAssignmentText("");
    setEditWhatsappActivity("");
    setEditCapstoneTask("");
  };

  const updateModule = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingModuleId) return;

    setStatusMessage("");
    setStatusType("");

    const weekInt = parseInt(editWeekNumber);
    if (!editCourseId || !editTitle.trim() || isNaN(weekInt) || weekInt <= 0) {
      setStatusMessage("All fields must contain valid schema details.");
      setStatusType("error");
      return;
    }

    setEditLoading(true);

    try {
      const { error } = await supabase
        .from("modules")
        .update({
          course_id: editCourseId,
          title: editTitle.trim(),
          content: editContent.trim() || null,
          module_order: weekInt,
          live_class_notes: editLiveClassNotes.trim() || null,
          lab_steps: editLabSteps.trim() || null,
          assignment_text: editAssignmentText.trim() || null,
          whatsapp_activity: editWhatsappActivity.trim() || null,
          capstone_task: editCapstoneTask.trim() || null,
        })
        .eq("id", editingModuleId);
      if (error) throw error;

      setStatusMessage("Module parameters modified successfully.");
      setStatusType("success");
      cancelEdit();
      await fetchModules();
    } catch (err: any) {
      setStatusMessage(err.message || "Failed saving changes onto schema.");
      setStatusType("error");
    } finally {
      setEditLoading(false);
    }
  };

  // ── Delete Module Configuration ─────────────────────────────────────────────
  const deleteModule = async (moduleId: string) => {
    if (
      !window.confirm(
        "Permanently remove this module? Dependent assessments may lose validation hooks."
      )
    )
      return;

    setStatusMessage("");
    setStatusType("");

    try {
      const { error } = await supabase.from("modules").delete().eq("id", moduleId);
      if (error) throw error;

      setStatusMessage("Module profile purged successfully.");
      setStatusType("success");

      if (editingModuleId === moduleId) cancelEdit();

      if (modules.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        await fetchModules();
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed running drop execution constraints.");
      setStatusType("error");
    }
  };

  // ── QUIZ BUILDER FUNCTIONS ──────────────────────────────────────────────────
  const openQuizBuilder = (module: Module) => {
    setEditingModuleForQuiz(module);

    if (module.quiz_enabled && module.quiz_questions) {
      // Deep-clone: without this, editing/mutating quizQuestions below would
      // mutate the exact objects sitting inside `modules` state, so a
      // cancelled edit would still show unsaved changes in the list until
      // the next refetch.
      setQuizQuestions(structuredClone(module.quiz_questions));
      setQuizPassScore(module.quiz_pass_score || DEFAULT_MODULE_QUIZ_PASS_SCORE);
    } else {
      setQuizQuestions([blankQuizQuestion()]);
      setQuizPassScore(DEFAULT_MODULE_QUIZ_PASS_SCORE);
    }

    setQuizModalOpen(true);
  };

  const addQuestion = () => {
    setQuizQuestions((prev) => [...prev, blankQuizQuestion()]);
  };

  const removeQuestion = (index: number) => {
    if (quizQuestions.length === 1) {
      setStatusMessage("You need at least one question.");
      setStatusType("error");
      return;
    }
    setQuizQuestions((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Immutable updates: previously this mutated the array elements in place
  // (newQuestions[index].question = value), which meant it silently mutated
  // whatever object reference quizQuestions[index] happened to share with
  // module state. Always build new objects.
  const updateQuestion = (index: number, field: "question" | "correct", value: any) => {
    setQuizQuestions((prev) =>
      prev.map((q, i) =>
        i !== index ? q : { ...q, [field]: field === "correct" ? parseInt(value) : value }
      )
    );
  };

  const updateOption = (qIndex: number, optIndex: number, value: string) => {
    setQuizQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIndex
          ? q
          : { ...q, options: q.options.map((o, j) => (j === optIndex ? value : o)) }
      )
    );
  };

  const saveQuiz = async () => {
    for (let i = 0; i < quizQuestions.length; i++) {
      const q = quizQuestions[i];
      if (!q.question.trim()) {
        setStatusMessage(`Question ${i + 1} has no text.`);
        setStatusType("error");
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].trim()) {
          setStatusMessage(`Question ${i + 1}, Option ${j + 1} is empty.`);
          setStatusType("error");
          return;
        }
      }
      if (q.correct < 0 || q.correct > 3) {
        setStatusMessage(
          `Question ${i + 1} has invalid correct answer selection.`
        );
        setStatusType("error");
        return;
      }
    }

    if (quizPassScore < 1 || quizPassScore > 100) {
      setStatusMessage("Pass score must be between 1 and 100.");
      setStatusType("error");
      return;
    }

    setQuizSaving(true);

    try {
      const { error } = await supabase
        .from("modules")
        .update({
          quiz_enabled: true,
          quiz_questions: quizQuestions,
          quiz_pass_score: quizPassScore,
        })
        .eq("id", editingModuleForQuiz?.id);

      if (error) throw error;

      setStatusMessage(`Quiz saved for "${editingModuleForQuiz?.title}"!`);
      setStatusType("success");
      setQuizModalOpen(false);
      await fetchModules();
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to save quiz.");
      setStatusType("error");
    } finally {
      setQuizSaving(false);
    }
  };

  const removeQuiz = async (module: Module) => {
    if (
      !confirm(
        `Remove quiz from "${module.title}"? Students will no longer have a quiz for this module.`
      )
    )
      return;

    try {
      const { error } = await supabase
        .from("modules")
        .update({
          quiz_enabled: false,
          quiz_questions: null,
          quiz_pass_score: DEFAULT_MODULE_QUIZ_PASS_SCORE,
        })
        .eq("id", module.id);

      if (error) throw error;

      setStatusMessage(`Quiz removed from "${module.title}".`);
      setStatusType("success");
      await fetchModules();
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to remove quiz.");
      setStatusType("error");
    }
  };

  const parseLessonBulkQuestions = () => {
    if (!bulkLessonText.trim()) return alert("Paste lesson questions first");

    const blocks = bulkLessonText
      .replace(/^#{1,6}\s*/gm, "").replace(/\*\*/g, "").replace(/\*/g, "")
      .replace(/^[-•]\s*/gm, "").replace(/\r/g, "").trim()
      .split(/(?:Question\s*\d+[:.)]?|^\d+[.)]|^Q\d+[:.)]?)/gim)
      .map((q) => q.trim()).filter(Boolean);

    const parsed = blocks.map((b) => {
      const lines = b.split("\n").map((x) => x.trim()).filter(Boolean);
      const q = lines[0];
      const opts = lines.filter((l) => /^[A-D][.)]/i.test(l))
        .map((l) => l.replace(/^[A-D][.)]\s*/i, ""));
      const ansLine = lines.find((l) => /(Answer|Correct|Ans)\s*:/i.test(l));
      const ansMatch = ansLine?.match(/[A-D]/i)?.[0]?.toUpperCase();
      if (!ansMatch) {
        console.warn(`Could not detect an answer letter for question: "${q}". Skipping.`);
        return null;
      }
      const ans = ansMatch as "A" | "B" | "C" | "D";
      return { question: q, options: opts, correct: { A: 0, B: 1, C: 2, D: 3 }[ans] };
    }).filter((q): q is QuizQuestion => !!q && q.options.length === 4);

    if (!parsed.length) return alert("No valid questions detected");

    setLessonPreviewQuestions(parsed);
    setShowLessonPreview(true);
  };

  // ── LESSON MANAGER FUNCTIONS ────────────────────────────────────────────
  const fetchLessonsForModule = useCallback(async (moduleId: string) => {
    setLessonsLoading(true);
    try {
      const { data, error } = await supabase
        .from("lessons")
        .select(
          "id, module_id, title, content, lesson_order, quiz_enabled, quiz_questions, quiz_pass_score, created_at"
        )
        .eq("module_id", moduleId)
        .order("lesson_order", { ascending: true });
      if (error) throw error;
      setLessons((data as any) || []);
    } catch (err: any) {
      console.error("Error loading lessons:", err.message);
      setStatusMessage("Unable to load lessons for this module.");
      setStatusType("error");
    } finally {
      setLessonsLoading(false);
    }
  }, []);

  const resetLessonForm = () => {
    setLessonFormMode("create");
    setEditingLessonId(null);
    setLessonTitle("");
    setLessonOrder("");
    setLessonContent("");
    setLessonQuizQuestions(blankLessonQuestions());
    setBulkLessonText("");
    setLessonPreviewQuestions([]);
    setShowLessonPreview(false);
  };

  const openLessonManager = async (mod: Module) => {
    setActiveModuleForLessons(mod);
    setLessonManagerOpen(true);
    resetLessonForm();
    await fetchLessonsForModule(mod.id);
  };

  const closeLessonManager = () => {
    setLessonManagerOpen(false);
    setActiveModuleForLessons(null);
    setLessons([]);
    resetLessonForm();
  };

  const startEditLesson = (lesson: Lesson) => {
    setLessonFormMode("edit");
    setEditingLessonId(lesson.id);
    setLessonTitle(lesson.title);
    setLessonOrder(lesson.lesson_order.toString());
    setLessonContent(lesson.content ?? "");
    if (lesson.quiz_questions && lesson.quiz_questions.length === LESSON_QUIZ_LENGTH) {
      // Deep-clone for the same reason as openQuizBuilder above.
      setLessonQuizQuestions(structuredClone(lesson.quiz_questions));
    } else {
      setLessonQuizQuestions(blankLessonQuestions());
    }
  };

  const updateLessonQuestion = (index: number, field: "question" | "correct", value: any) => {
    setLessonQuizQuestions((prev) =>
      prev.map((q, i) =>
        i !== index ? q : { ...q, [field]: field === "correct" ? parseInt(value) : value }
      )
    );
  };

  const updateLessonOption = (qIndex: number, optIndex: number, value: string) => {
    setLessonQuizQuestions((prev) =>
      prev.map((q, i) =>
        i !== qIndex
          ? q
          : { ...q, options: q.options.map((o, j) => (j === optIndex ? value : o)) }
      )
    );
  };

  const saveLesson = async () => {
    if (!activeModuleForLessons) return;

    const orderInt = parseInt(lessonOrder);

    if (!lessonTitle.trim() || isNaN(orderInt) || orderInt <= 0) {
      setStatusMessage("Please provide a lesson title and a valid positive lesson number.");
      setStatusType("error");
      return;
    }

    for (let i = 0; i < lessonQuizQuestions.length; i++) {
      const q = lessonQuizQuestions[i];
      if (!q.question.trim()) {
        setStatusMessage(`Lesson quiz question ${i + 1} has no text.`);
        setStatusType("error");
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].trim()) {
          setStatusMessage(
            `Lesson quiz question ${i + 1}, option ${j + 1} is empty.`
          );
          setStatusType("error");
          return;
        }
      }
    }

    setLessonSaving(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user?.id) {
        setStatusMessage(
          "Unable to verify your identity. Please refresh and try again."
        );
        setStatusType("error");
        setLessonSaving(false);
        return;
      }

      const payload = {
        module_id: activeModuleForLessons.id,
        title: lessonTitle.trim(),
        content: lessonContent.trim() || null,
        lesson_order: orderInt,
        quiz_enabled: true,
        quiz_questions: lessonQuizQuestions,
        quiz_pass_score: LESSON_QUIZ_PASS_SCORE,
      };

      let dbError;
      if (lessonFormMode === "edit" && editingLessonId) {
        ({ error: dbError } = await supabase
          .from("lessons")
          .update(payload)
          .eq("id", editingLessonId));
      } else {
        ({ error: dbError } = await supabase
          .from("lessons")
          .insert({ ...payload, created_by: user.id }));
      }

      if (dbError) throw dbError;

      setStatusMessage(
        lessonFormMode === "edit"
          ? "Lesson updated successfully."
          : "Lesson added successfully."
      );
      setStatusType("success");
      resetLessonForm();
      await fetchLessonsForModule(activeModuleForLessons.id);
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to save lesson.");
      setStatusType("error");
    } finally {
      setLessonSaving(false);
    }
  };

  const deleteLesson = async (lessonId: string) => {
    if (!activeModuleForLessons) return;
    if (
      !window.confirm(
        "Delete this lesson permanently? Students who haven't reached it yet won't see it."
      )
    )
      return;

    setDeletingLessonId(lessonId);
    try {
      const { error } = await supabase.from("lessons").delete().eq("id", lessonId);
      if (error) throw error;
      setStatusMessage("Lesson deleted successfully.");
      setStatusType("success");
      if (editingLessonId === lessonId) resetLessonForm();
      await fetchLessonsForModule(activeModuleForLessons.id);
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to delete lesson.");
      setStatusType("error");
    } finally {
      setDeletingLessonId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalModulesCount / PAGE_SIZE));

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans bg-gray-100 min-h-screen">
      {/* Header Workspace Wrapped in Collapsible Card */}
      <CollapsibleCard title=" Syllabus Module Controls" defaultOpen={true}>
        <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
          <div>
            <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
              Syllabus Module Controls
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Define sequential training milestones, map tasks by week parameters,
              and add quizzes to lock completion.
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 active:bg-slate-900 transition"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z"
              />
            </svg>
            Dashboard
          </button>
        </div>
      </CollapsibleCard>
    
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        {/* Module Entry Creation Panel */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200/80 h-fit">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Create New Module
          </h2>
          <form onSubmit={createModule} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                Parent Course
              </label>
              <select
                className="border border-gray-300 rounded-xl p-2.5 w-full text-gray-900 text-sm focus:ring-2 focus:ring-cyan-500 outline-none bg-white transition"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
              >
                <option value="">Select Course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                Module Title
              </label>
              <input
                className="border border-gray-300 rounded-xl p-2.5 w-full text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none text-sm transition"
                placeholder="e.g., Network Perimeter Protocols"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                Week Number
              </label>
              <input
                type="number"
                min="1"
                className="border border-gray-300 rounded-xl p-2.5 w-full text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none text-sm transition"
                placeholder="e.g., 3"
                value={weekNumber}
                onChange={(e) => setWeekNumber(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">
                Module Summary
              </label>
              <RichTextEditor
                content={content}
                onChange={setContent}
                onImageUpload={uploadImageToSupabase}
              />
            </div>

            <details className="border border-gray-200 rounded-xl p-3 bg-gray-50/50">
              <summary className="text-xs font-bold uppercase tracking-wider text-gray-600 cursor-pointer">
                Additional Weekly Content (optional)
              </summary>
              <div className="space-y-3 mt-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Live Class Notes
                  </label>
                  <RichTextEditor
                    content={liveClassNotes}
                    onChange={setLiveClassNotes}
                    onImageUpload={uploadImageToSupabase}
                    compact
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Hands-on Lab
                  </label>
                  <RichTextEditor
                    content={labSteps}
                    onChange={setLabSteps}
                    onImageUpload={uploadImageToSupabase}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Assignment
                  </label>
                  <RichTextEditor
                    content={assignmentText}
                    onChange={setAssignmentText}
                    onImageUpload={uploadImageToSupabase}
                    compact
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Group Chat Activity
                  </label>
                  <RichTextEditor
                    content={whatsappActivity}
                    onChange={setWhatsappActivity}
                    onImageUpload={uploadImageToSupabase}
                    compact
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Capstone Task
                  </label>
                  <RichTextEditor
                    content={capstoneTask}
                    onChange={setCapstoneTask}
                    onImageUpload={uploadImageToSupabase}
                    compact
                  />
                </div>
              </div>
            </details>

            {statusMessage && (
              <div
                role="alert"
                className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${
                  statusType === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                }`}
              >
                {statusMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow transition disabled:opacity-50 text-sm"
            >
              {loading ? "Creating..." : "Create Module"}
            </button>
          </form>
        </div>

        {/* Existing Modules List Column with Collapsible Card */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-200/80">
          <CollapsibleCard title="📋 Modules with Quiz Builder" defaultOpen={true}>
            <div className="mt-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-wider">
                  Configured Syllabus Records
                </h2>
                <input
                  type="text"
                  className="border border-gray-300 rounded-xl p-2 text-xs w-full sm:w-60 text-gray-900 focus:ring-2 focus:ring-cyan-500 outline-none transition"
                  placeholder="Search modules..."
                  value={searchTerm}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>

              {isFetching ? (
                <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin text-cyan-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    Loading modules...
                  </span>
                </div>
              ) : modules.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-xs text-gray-500">
                  No modules found. Create your first module using the form.
                </div>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                  {modules.map((mod) => (
                    <div
                      key={mod.id}
                      className="rounded-xl border border-gray-200 p-4 bg-slate-50 shadow-sm transition hover:bg-slate-100/50"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-xs bg-cyan-600 text-white font-extrabold px-2 py-0.5 rounded-md">
                              WEEK {mod.module_order}
                            </span>
                            <span className="text-xs font-semibold text-slate-500">
                              Course:{" "}
                              <strong className="text-slate-700">
                                {mod.courses?.title || "Unknown"}
                              </strong>
                            </span>
                            {mod.quiz_enabled && (
                              <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">
                                ✓ Quiz Active
                              </span>
                            )}
                          </div>
                          <h3 className="text-base font-bold text-gray-900">
                            {mod.title}
                          </h3>

                          {mod.content && (
                            <div
                              className="text-gray-700 leading-relaxed prose prose-sm max-w-none line-clamp-2 mt-1"
                              dangerouslySetInnerHTML={{ __html: sanitizeHTML(mod.content) }}
                            />
                          )}
                        </div>

                        <div className="flex gap-2 mt-2 sm:mt-0 flex-wrap">
                          <button
                            onClick={() => openLessonManager(mod)}
                            className="text-indigo-600 hover:text-indigo-700 text-xs font-bold uppercase tracking-wider bg-indigo-50 px-3 py-1.5 rounded-lg"
                          >
                            📖 Manage Lessons
                          </button>
                          {mod.quiz_enabled ? (
                            <>
                              <button
                                onClick={() => openQuizBuilder(mod)}
                                className="text-amber-600 hover:text-amber-700 text-xs font-bold uppercase tracking-wider bg-amber-50 px-3 py-1.5 rounded-lg"
                              >
                                Edit Quiz
                              </button>
                              <button
                                onClick={() => removeQuiz(mod)}
                                className="text-red-600 hover:text-red-700 text-xs font-bold uppercase tracking-wider bg-red-50 px-3 py-1.5 rounded-lg"
                              >
                                Remove Quiz
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => openQuizBuilder(mod)}
                              className="text-green-600 hover:text-green-700 text-xs font-bold uppercase tracking-wider bg-green-50 px-3 py-1.5 rounded-lg"
                            >
                              + Add Quiz
                            </button>
                          )}
                          <button
                            onClick={() => startEditModule(mod)}
                            className="text-cyan-600 hover:text-cyan-700 text-xs font-bold uppercase tracking-wider bg-cyan-50 px-3 py-1.5 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteModule(mod.id)}
                            className="text-rose-600 hover:text-rose-700 text-xs font-bold uppercase tracking-wider bg-rose-50 px-3 py-1.5 rounded-lg"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Inline Edit Form */}
                      {editingModuleId === mod.id && (
                        <ModuleEditForm
                          courses={courses}
                          editCourseId={editCourseId}
                          setEditCourseId={setEditCourseId}
                          editWeekNumber={editWeekNumber}
                          setEditWeekNumber={setEditWeekNumber}
                          editTitle={editTitle}
                          setEditTitle={setEditTitle}
                          editContent={editContent}
                          setEditContent={setEditContent}
                          editLiveClassNotes={editLiveClassNotes}
                          setEditLiveClassNotes={setEditLiveClassNotes}
                          editLabSteps={editLabSteps}
                          setEditLabSteps={setEditLabSteps}
                          editAssignmentText={editAssignmentText}
                          setEditAssignmentText={setEditAssignmentText}
                          editWhatsappActivity={editWhatsappActivity}
                          setEditWhatsappActivity={setEditWhatsappActivity}
                          editCapstoneTask={editCapstoneTask}
                          setEditCapstoneTask={setEditCapstoneTask}
                          uploadImageToSupabase={uploadImageToSupabase}
                          updateModule={updateModule}
                          cancelEdit={cancelEdit}
                          editLoading={editLoading}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pagination Section */}
              {!isFetching && totalModulesCount > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 text-xs text-gray-600">
                  <span>
                    Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                    {Math.min(currentPage * PAGE_SIZE, totalModulesCount)} of{" "}
                    {totalModulesCount}
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40"
                    >
                      &larr; Prev
                    </button>
                    <span className="rounded-lg border border-cyan-200 bg-cyan-50 px-2.5 py-1 font-bold text-cyan-700">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-lg border border-gray-300 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Next &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </CollapsibleCard>
        </div>
      </div>

      {/* ── QUIZ BUILDER MODAL ── */} 
      {quizModalOpen && editingModuleForQuiz && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-[Syne,sans-serif] text-xl font-bold text-[#1B2A6B]">
                  Quiz Builder: {editingModuleForQuiz.title}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Create multiple choice questions. Students must score {quizPassScore}% to pass.
                </p>
              </div>
              <button
                onClick={() => setQuizModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Passing Score Required
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={quizPassScore}
                    onChange={(e) => setQuizPassScore(parseInt(e.target.value))}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#3AAA35]"
                  />
                  <span className="text-lg font-bold text-[#1B2A6B] min-w-[60px] text-center">
                    {quizPassScore}%
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Students need this percentage to complete the module.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-gray-700">
                    Questions
                  </label>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="bg-[#3AAA35] hover:bg-[#2e872a] text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  >
                    + Add Question
                  </button>
                </div>

                {quizQuestions.map((q, qIdx) => (
                  <div key={qIdx} className="border border-gray-200 rounded-xl p-4 bg-white">
                    <div className="flex items-start justify-between mb-3">
                      <h4 className="font-semibold text-gray-800">
                        Question {qIdx + 1}
                      </h4>
                      {quizQuestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(qIdx)}
                          className="text-red-500 hover:text-red-700 text-xs font-bold"
                        >
                          Remove
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      placeholder="Enter your question here..."
                      value={q.question}
                      onChange={(e) => updateQuestion(qIdx, "question", e.target.value)}
                      className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 mb-3 focus:ring-2 focus:ring-[#3AAA35] outline-none"
                    />

                    <div className="space-y-2 pl-4">
                      {q.options.map((opt, optIdx) => (
                        <div key={optIdx} className="flex items-center gap-3">
                          <input
                            type="radio"
                            name={`correct_${qIdx}`}
                            checked={q.correct === optIdx}
                            onChange={() => updateQuestion(qIdx, "correct", optIdx)}
                            className="w-4 h-4 text-[#3AAA35]"
                          />
                          <input
                            type="text"
                            placeholder={`Option ${optIdx + 1}`}
                            value={opt}
                            onChange={(e) => updateOption(qIdx, optIdx, e.target.value)}
                            className="flex-1 border border-gray-300 rounded-lg p-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#3AAA35] outline-none"
                          />
                        </div>
                      ))}
                      <p className="text-[10px] text-gray-400 mt-2">
                        ✓ Select the radio button next to the correct answer.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setQuizModalOpen(false)}
                className="px-4 py-2 text-sm font-semibold border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveQuiz}
                disabled={quizSaving}
                className="bg-[#1B2A6B] hover:bg-[#152154] text-white font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                {quizSaving ? "Saving..." : "Save Quiz"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LESSON MANAGER MODAL ── */}
      {lessonManagerOpen && activeModuleForLessons && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="font-[Syne,sans-serif] text-xl font-bold text-[#1B2A6B]">
                  Lesson Manager: {activeModuleForLessons.title}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Each lesson has {LESSON_QUIZ_LENGTH} knowledge-check questions. Students must score {LESSON_QUIZ_PASS_SCORE}% to unlock the next lesson.
                </p>
              </div>
              <button
                onClick={closeLessonManager}
                className="text-gray-400 hover:text-gray-600 bg-gray-100 p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-600 mb-3">
                  Lessons in this Module ({lessons.length})
                </h3>
                {lessonsLoading ? (
                  <div className="text-center py-6 text-gray-400 text-sm">
                    Loading lessons...
                  </div>
                ) : lessons.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">
                    No lessons yet. Add the first lesson using the form below.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lessons.map((lesson) => (
                      <div
                        key={lesson.id}
                        className="flex items-center justify-between border border-gray-200 rounded-xl p-3 bg-slate-50"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs bg-[#1B2A6B] text-white font-extrabold px-2 py-0.5 rounded-md">
                            Lesson {lesson.lesson_order}
                          </span>
                          <span className="text-sm font-semibold text-gray-800">
                            {lesson.title}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEditLesson(lesson)}
                            className="text-cyan-600 hover:text-cyan-700 text-xs font-bold uppercase tracking-wider bg-cyan-50 px-3 py-1.5 rounded-lg"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteLesson(lesson.id)}
                            disabled={deletingLessonId === lesson.id}
                            className="text-rose-600 hover:text-rose-700 text-xs font-bold uppercase tracking-wider bg-rose-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
                          >
                            {deletingLessonId === lesson.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-600 mb-3">
                  {lessonFormMode === "edit" ? "Edit Lesson" : "Add New Lesson"}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                  <div className="sm:col-span-3">
                    <label className="block text-xs font-bold text-gray-600 mb-1">
                      Lesson Title
                    </label>
                    <input
                      className="border border-gray-300 rounded-lg p-2.5 w-full text-gray-600 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="e.g., What is Cybersecurity?"
                      value={lessonTitle}
                      onChange={(e) => setLessonTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-600 mb-1">
                      Lesson #
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="border border-gray-300 rounded-lg p-2.5 w-full text-gray-600 text-sm outline-none focus:ring-2 focus:ring-cyan-500"
                      placeholder="1"
                      value={lessonOrder}
                      onChange={(e) => setLessonOrder(e.target.value)}
                    />
                  </div>
                </div>

                <div className="mb-5">
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    Lesson Content
                  </label>
                  <RichTextEditor
                    content={lessonContent}
                    onChange={setLessonContent}
                    onImageUpload={uploadImageToSupabase}
                  />
                </div>

                <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50">
                  <label className="text-sm font-bold text-indigo-700">Bulk Paste Lesson Questions</label>
                  <textarea rows={8} value={bulkLessonText} onChange={e=>setBulkLessonText(e.target.value)}
                    placeholder={`Question 1:\nWhat is cybersecurity?\nA. Protecting digital assets\nB. Creating websites\nC. Writing applications\nD. Managing databases\nAnswer: A`}
                    className="w-full mt-3 border border-gray-300 text-gray-700 rounded-xl p-3 text-sm" />
                  <button type="button" onClick={parseLessonBulkQuestions}
                    className="mt-3 bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-bold">
                    Analyze Lesson Questions
                  </button>
                </div>

                {showLessonPreview && (
                  <div className="mt-4 border rounded-xl p-4 bg-white">
                    <h3 className="font-bold text-gray-700 mb-3">Preview ({lessonPreviewQuestions.length} Questions)</h3>
                    {lessonPreviewQuestions.map((q,i)=>(
                      <div key={i} className="mb-4 border rounded-lg p-3">
                        <p className="font-bold text-red-500">{i+1}. {q.question}</p>
                        {q.options.map((o:any,idx:number)=>(
                          <p key={idx} className={idx===q.correct?"text-green-600 font-semibold":"text-gray-600"}>
                            {String.fromCharCode(65+idx)}. {o}{idx===q.correct&&" ✓"}
                          </p>
                        ))}
                      </div>
                    ))}
                    {lessonPreviewQuestions.length !== LESSON_QUIZ_LENGTH && (
                      <p className="text-xs text-amber-600 font-semibold mb-3">
                        ⚠ Detected {lessonPreviewQuestions.length} question(s), but lessons require exactly {LESSON_QUIZ_LENGTH}. Review your pasted text before applying.
                      </p>
                    )}
                    <button type="button" onClick={()=>{
                      setLessonQuizQuestions(lessonPreviewQuestions);
                      setShowLessonPreview(false);
                    }} className="bg-green-600 text-white px-5 py-2 rounded-lg font-bold">
                      Apply To Lesson Quiz
                    </button>
                  </div>
                )}

                <div className="space-y-4 mt-6">
                  <label className="text-sm font-bold text-gray-700 block">
                    Knowledge Check ({LESSON_QUIZ_LENGTH} questions, {LESSON_QUIZ_PASS_SCORE}% to pass)
                  </label>
                  {lessonQuizQuestions.map((q, qIdx) => (
                    <div key={qIdx} className="border border-gray-200 rounded-xl p-4 bg-white">
                      <h4 className="font-semibold text-gray-600 mb-3">
                        Question {qIdx + 1}
                      </h4>
                      <input
                        type="text"
                        placeholder="Enter question text..."
                        value={q.question}
                        onChange={(e) => updateLessonQuestion(qIdx, "question", e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2 text-sm text-gray-900 mb-3 focus:ring-2 focus:ring-[#3AAA35] outline-none"
                      />
                      <div className="space-y-2 pl-4">
                        {q.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-3">
                            <input
                              type="radio"
                              name={`lesson_correct_${qIdx}`}
                              checked={q.correct === optIdx}
                              onChange={() => updateLessonQuestion(qIdx, "correct", optIdx)}
                              className="w-4 h-4 text-[#3AAA35]"
                            />
                            <input
                              type="text"
                              placeholder={`Option ${optIdx + 1}`}
                              value={opt}
                              onChange={(e) => updateLessonOption(qIdx, optIdx, e.target.value)}
                              className="flex-1 border border-gray-300 rounded-lg p-2 text-sm text-gray-900 focus:ring-2 focus:ring-[#3AAA35] outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
              {lessonFormMode === "edit" && (
                <button
                  type="button"
                  onClick={resetLessonForm}
                  className="px-4 py-2 text-sm font-semibold border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 transition"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                onClick={saveLesson}
                disabled={lessonSaving}
                className="bg-[#1B2A6B] hover:bg-[#152154] text-white font-semibold px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                {lessonSaving
                  ? "Saving..."
                  : lessonFormMode === "edit"
                  ? "Save Lesson Changes"
                  : "Add Lesson"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface ModuleEditFormProps {
  courses: any[];
  editCourseId: string;
  setEditCourseId: (id: string) => void;
  editWeekNumber: string;
  setEditWeekNumber: (num: string) => void;
  editTitle: string;
  setEditTitle: (title: string) => void;
  editContent: string;
  setEditContent: (content: string) => void;
  editLiveClassNotes: string;
  setEditLiveClassNotes: (notes: string) => void;
  editLabSteps: string;
  setEditLabSteps: (steps: string) => void;
  editAssignmentText: string;
  setEditAssignmentText: (text: string) => void;
  editWhatsappActivity: string;
  setEditWhatsappActivity: (activity: string) => void;
  editCapstoneTask: string;
  setEditCapstoneTask: (task: string) => void;
  uploadImageToSupabase: (file: File) => Promise<string | null>;
  updateModule: (e: React.FormEvent<HTMLFormElement>) => void;
  cancelEdit: () => void;
  editLoading: boolean;
}

function ModuleEditForm({
  courses,
  editCourseId,
  setEditCourseId,
  editWeekNumber,
  setEditWeekNumber,
  editTitle,
  setEditTitle,
  editContent,
  setEditContent,
  editLiveClassNotes,
  setEditLiveClassNotes,
  editLabSteps,
  setEditLabSteps,
  editAssignmentText,
  setEditAssignmentText,
  editWhatsappActivity,
  setEditWhatsappActivity,
  editCapstoneTask,
  setEditCapstoneTask,
  uploadImageToSupabase,
  updateModule,
  cancelEdit,
  editLoading,
}: ModuleEditFormProps) {
  return (
    <form
      onSubmit={updateModule}
      className="mt-4 space-y-3 border-t border-gray-200 pt-4 bg-white p-4 rounded-xl shadow-inner w-full block clear-both"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-0.5">Course</label>
          <select
            className="border border-gray-300 rounded-lg p-2 w-full text-gray-900 text-xs outline-none bg-white"
            value={editCourseId}
            onChange={(e) => setEditCourseId(e.target.value)}
          >
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-0.5">Week Number</label>
          <input
            type="number"
            className="border border-gray-300 rounded-lg p-2 w-full text-gray-900 text-xs outline-none"
            value={editWeekNumber}
            onChange={(e) => setEditWeekNumber(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 mb-0.5">Module Title</label>
        <input
          className="border border-gray-300 rounded-lg p-2 w-full text-gray-900 text-xs outline-none"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-gray-600 mb-0.5">Module Summary</label>
        <RichTextEditor
          content={editContent}
          onChange={setEditContent}
          onImageUpload={uploadImageToSupabase}
        />
      </div>

      <details className="border border-gray-200 rounded-lg p-3 bg-white">
        <summary className="text-xs font-bold text-gray-600 cursor-pointer">
          Additional Weekly Content (optional)
        </summary>
        <div className="space-y-3 mt-3">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-0.5">Live Class Notes</label>
            <RichTextEditor
              content={editLiveClassNotes}
              onChange={setEditLiveClassNotes}
              onImageUpload={uploadImageToSupabase}
              compact
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-0.5">Hands-on Lab Steps</label>
            <RichTextEditor
              content={editLabSteps}
              onChange={setEditLabSteps}
              onImageUpload={uploadImageToSupabase}
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-0.5">Assignment</label>
            <RichTextEditor
              content={editAssignmentText}
              onChange={setEditAssignmentText}
              onImageUpload={uploadImageToSupabase}
              compact
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-0.5">WhatsApp Activity</label>
            <RichTextEditor
              content={editWhatsappActivity}
              onChange={setEditWhatsappActivity}
              onImageUpload={uploadImageToSupabase}
              compact
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-0.5">Capstone Task</label>
            <RichTextEditor
              content={editCapstoneTask}
              onChange={setEditCapstoneTask}
              onImageUpload={uploadImageToSupabase}
              compact
            />
          </div>
        </div>
      </details>

      <div className="flex gap-2 pt-1 justify-end">
        <button
          type="button"
          onClick={cancelEdit}
          className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={editLoading}
          className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50"
        >
          {editLoading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
