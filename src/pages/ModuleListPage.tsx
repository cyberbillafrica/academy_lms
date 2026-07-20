import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useAuthStore } from "../store/authStore";

interface ModuleRow {
  id: string;
  title: string;
  module_order: number;
}

interface CourseInfo {
  id: string;
  title: string;
  description: string | null;
}

export default function ModuleListPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const profile = useAuthStore((s) => s.profile);

  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [moduleFinalPassed, setModuleFinalPassed] = useState<Record<string, boolean>>({});
  const [lessonCounts, setLessonCounts] = useState<Record<string, { total: number; passed: number }>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!courseId || !profile?.id) return;
    setLoading(true);
    try {
      const { data: courseRow } = await supabase
        .from("courses")
        .select("id, title, description")
        .eq("id", courseId)
        .maybeSingle();
      setCourse(courseRow ?? null);

      const { data: moduleRows } = await supabase
        .from("modules")
        .select("id, title, module_order")
        .eq("course_id", courseId)
        .order("module_order", { ascending: true });
      const mods = moduleRows ?? [];
      setModules(mods);

      const moduleIds = mods.map((m) => m.id);
      if (moduleIds.length > 0) {
        const { data: progressRows } = await supabase
          .from("module_progress")
          .select("module_id, completed")
          .eq("student_id", profile.id)
          .in("module_id", moduleIds);
        const passedMap: Record<string, boolean> = {};
        (progressRows || []).forEach((p) => {
          passedMap[p.module_id] = p.completed;
        });
        setModuleFinalPassed(passedMap);

        const { data: lessonRows } = await supabase
          .from("lessons")
          .select("id, module_id")
          .in("module_id", moduleIds);

        const totals: Record<string, number> = {};
        (lessonRows || []).forEach((l) => {
          totals[l.module_id] = (totals[l.module_id] || 0) + 1;
        });

        const passedCounts: Record<string, number> = {};
        const lessonIds = (lessonRows || []).map((l) => l.id);
        if (lessonIds.length > 0) {
          const { data: lp } = await supabase
            .from("lesson_progress")
            .select("lesson_id, passed")
            .eq("student_id", profile.id)
            .eq("passed", true)
            .in("lesson_id", lessonIds);
          const passedLessonIds = new Set((lp || []).map((r) => r.lesson_id));
          (lessonRows || []).forEach((l) => {
            if (passedLessonIds.has(l.id)) {
              passedCounts[l.module_id] = (passedCounts[l.module_id] || 0) + 1;
            }
          });
        }

        const combined: Record<string, { total: number; passed: number }> = {};
        moduleIds.forEach((id) => {
          combined[id] = { total: totals[id] || 0, passed: passedCounts[id] || 0 };
        });
        setLessonCounts(combined);
      }
    } catch (err) {
      console.error("Error loading module list:", err);
    } finally {
      setLoading(false);
    }
  }, [courseId, profile?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-10 w-10 rounded-full border-4 border-[#3AAA35] border-t-[#F47920] animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans,sans-serif]">
      <div className="bg-gradient-to-r from-[#1B2A6B] via-[#1E3A8A] to-[#2563EB] px-6 py-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate("/dashboard")}
            className="text-white/80 hover:text-white text-sm font-semibold mb-4 inline-flex items-center gap-1"
          >
            ← Back to Dashboard
          </button>
          <p className="text-[#3AAA35] text-xs font-bold uppercase tracking-[0.3em] mb-1">Course Roadmap</p>
          <h1 className="font-[Syne,sans-serif] text-3xl font-extrabold text-white">{course?.title || "Course"}</h1>
          {course?.description && <p className="text-blue-200 text-sm mt-2 max-w-2xl">{course.description}</p>}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        {modules.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400">
            No weeks/modules published for this course yet.
          </div>
        ) : (
          modules.map((mod) => {
            const counts = lessonCounts[mod.id] || { total: 0, passed: 0 };
            const finalPassed = moduleFinalPassed[mod.id] || false;
            const allLessonsPassed = counts.total > 0 && counts.passed === counts.total;
            return (
              <button
                key={mod.id}
                onClick={() => navigate(`/modules/${mod.id}`)}
                className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition p-6 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`h-12 w-12 rounded-xl flex items-center justify-center font-extrabold text-white shrink-0 ${
                      finalPassed ? "bg-green-500" : "bg-[#1B2A6B]"
                    }`}
                  >
                    {finalPassed ? "✓" : `W${mod.module_order}`}
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Week {mod.module_order}</p>
                    <h3 className="font-bold text-gray-900">{mod.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {counts.total > 0 ? `${counts.passed}/${counts.total} lessons completed` : "No lessons published yet"}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {finalPassed ? (
                    <span className="text-xs font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full">✓ Week Complete</span>
                  ) : allLessonsPassed ? (
                    <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1 rounded-full">⚡ Final Quiz Ready</span>
                  ) : (
                    <span className="text-xs font-bold bg-gray-100 text-gray-500 px-3 py-1 rounded-full">In Progress</span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}