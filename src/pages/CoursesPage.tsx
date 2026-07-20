import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import CollapsibleCard from "../components/CollapsibleCard";

interface Course {
  id: string;
  title: string;
  description: string | null;
  status?: string;
  created_by?: string | null;
  created_at: string;
}

const PAGE_SIZE = 5;

export default function CoursesPage() {
  const navigate = useNavigate();

  // Form Creation State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  // Form Editing State
  const [editLoading, setEditLoading] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // System Notification Status
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "">("");

  // Data Queries State
  const [courses, setCourses] = useState<Course[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCoursesCount, setTotalCoursesCount] = useState(0);

  // ── Fetch Courses (Paginated & Filtered via Server) ─────────────────────────
  const fetchCourses = useCallback(async () => {
    setIsFetching(true);
    try {
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("courses")
        .select("*", { count: "exact" });

      if (searchTerm.trim()) {
        const cleanSearch = searchTerm.trim().replace(/[%,()]/g, "\\$&");
        query = query.or(`title.ilike.%${cleanSearch}%,description.ilike.%${cleanSearch}%`);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;

      setCourses(data ?? []);
      setTotalCoursesCount(count ?? 0);
    } catch (err: any) {
      console.error("Error loading courses:", err.message);
      setStatusMessage("Unable to load courses. Try again later.");
      setStatusType("error");
    } finally {
      setIsFetching(false);
    }
  }, [currentPage, searchTerm]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

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

  // ── Create Course Form Submission ───────────────────────────────────────────
  const createCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatusMessage("");
    setStatusType("");

    if (!title.trim() || !description.trim()) {
      setStatusMessage("Please provide both a title and a description.");
      setStatusType("error");
      return;
    }

    setLoading(true);

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user?.id) {
        setStatusMessage("Unable to verify admin identity. Please refresh and try again.");
        setStatusType("error");
        return;
      }

      const { error } = await supabase.from("courses").insert({
        title: title.trim(),
        description: description.trim(),
        status: "active",
        created_by: user.id,
      });

      if (error) throw error;

      setStatusMessage("Course created successfully.");
      setStatusType("success");
      setTitle("");
      setDescription("");
      setCurrentPage(1); // Reset back to view index layer
      await fetchCourses();
    } catch (err: any) {
      setStatusMessage(err.message || "An unexpected error occurred.");
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // ── Inline Edit Form Layout Actions ─────────────────────────────────────────
  const startEditCourse = (course: Course) => {
    setEditingCourseId(course.id);
    setEditTitle(course.title);
    setEditDescription(course.description ?? "");
    setStatusMessage("");
    setStatusType("");
  };

  const cancelEdit = () => {
    setEditingCourseId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const updateCourse = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCourseId) return;

    setStatusMessage("");
    setStatusType("");

    if (!editTitle.trim() || !editDescription.trim()) {
      setStatusMessage("Please provide both a title and a description.");
      setStatusType("error");
      return;
    }

    setEditLoading(true);

    try {
      const { error } = await supabase
        .from("courses")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim(),
        })
        .eq("id", editingCourseId);

      if (error) throw error;

      setStatusMessage("Course updated successfully.");
      setStatusType("success");
      cancelEdit();
      await fetchCourses();
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to update course.");
      setStatusType("error");
    } {
      setEditLoading(false);
    }
  };

  // ── Delete Course Configuration ────────────────────────────────────────────
  const deleteCourse = async (courseId: string) => {
    if (!window.confirm("Delete this course? This cannot be undone.")) return;

    setStatusMessage("");
    setStatusType("");

    try {
      const { error } = await supabase.from("courses").delete().eq("id", courseId);

      if (error) throw error;

      setStatusMessage("Course deleted successfully.");
      setStatusType("success");

      if (editingCourseId === courseId) {
        cancelEdit();
      }

      // Safe page bound redirection
      if (courses.length === 1 && currentPage > 1) {
        setCurrentPage((p) => p - 1);
      } else {
        await fetchCourses();
      }
    } catch (err: any) {
      setStatusMessage(err.message || "Failed to delete course.");
      setStatusType("error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCoursesCount / PAGE_SIZE));

  return (
    <div className="p-6 max-w-5xl mx-auto font-sans bg-gray-200 min-h-screen">
      {/* ── Top Header and Context Nav Controls ── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900">Course Management</h1>
          <p className="mt-1 text-sm text-gray-600">
            Add new academic tracks, customize syllabus paths, and manage system catalog modules.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <div className="rounded-full bg-cyan-50 px-4 py-2 text-xs font-bold text-cyan-700 whitespace-nowrap">
            {totalCoursesCount} Course{totalCoursesCount === 1 ? "" : "s"} Total
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="inline-flex items-center gap-1 rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-700 active:bg-slate-900 transition"
            aria-label="Return to Dashboard Dashboard View"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
            </svg>
            Dashboard
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── Create New Course Component Form ── */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Create New Course</h2>
          <form onSubmit={createCourse} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Course Title</label>
              <input
                className="border border-gray-300 rounded-xl p-3 w-full text-gray-900 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition text-sm"
                placeholder="e.g., Cybersecurity Systems Baseline"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={4}
                className="border border-gray-300 rounded-xl p-3 w-full text-gray-900 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition text-sm"
                placeholder="Provide a comprehensive operational summary of the training scope..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </div>

            {statusMessage && (
              <div
                role="alert"
                className={`rounded-xl border px-4 py-3 text-sm ${
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
              className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-3 px-4 rounded-xl shadow transition disabled:opacity-50 text-sm"
            >
              {loading ? "Saving course..." : "Create Course"}
            </button>
          </form>
        </div>

        {/* ── Existing Catalog Processing Table Layout ── */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h2 className="text-xl font-bold text-gray-900">Existing Course Records</h2>
            <input
              type="text"
              className="border border-gray-300 rounded-xl p-2.5 text-sm w-full sm:w-64 text-gray-900 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition"
              placeholder="Search by title, context details..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              aria-label="Filter Course Records"
            />
          </div>

          {isFetching ? (
            <div className="rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
              <span className="inline-flex items-center gap-2">
                <svg className="h-5 w-5 animate-spin text-cyan-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
                Loading course profiles…
              </span>
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 p-12 text-center text-sm text-gray-500">
              {searchTerm ? "No active courses match your current filter parameters." : "No active courses found. Populate data parameters to start."}
            </div>
          ) : (
            <div className="space-y-4">
              {courses.map((course) => (
                <div key={course.id} className="rounded-2xl border border-gray-200 p-5 bg-slate-50 shadow-sm transition hover:shadow-md">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-200 text-slate-800 font-bold mr-2">
                        ID: {course.id}
                      </span>
                      <h3 className="text-lg font-bold text-gray-900 mt-1 inline-block">{course.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Syllabus Lead: <span className="font-medium text-slate-700">{course.status === "active" ? "Active Catalog" : "System Root"}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                        {course.status || "active"}
                      </span>
                      <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                        {new Date(course.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-gray-600 border-l-2 border-slate-300 pl-3 bg-white py-2 rounded-r-lg">
                    {course.description || "No specific target criteria parameters outlined."}
                  </p>

                  {editingCourseId === course.id ? (
                    <form onSubmit={updateCourse} className="mt-4 space-y-4 border-t border-gray-200 pt-4 bg-white p-4 rounded-xl shadow-inner">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Modify Title</label>
                        <input
                          className="border border-gray-300 rounded-xl p-2.5 w-full text-gray-900 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition text-sm"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Modify Summary Overview</label>
                        <textarea
                          rows={3}
                          className="border border-gray-300 rounded-xl p-2.5 w-full text-gray-900 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition text-sm"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={editLoading}
                          className="rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 transition disabled:opacity-50"
                        >
                          {editLoading ? "Saving Track..." : "Save Changes"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200/60 pt-3">
                      <button
                        type="button"
                        onClick={() => startEditCourse(course)}
                        className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white hover:bg-cyan-700 transition shadow-sm"
                      >
                        Edit Course
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCourse(course.id)}
                        className="rounded-xl bg-rose-100 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-200 transition"
                      >
                        Delete Track
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Sub-level View Pagination Mechanics ── */}
          {!isFetching && totalCoursesCount > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100 text-sm text-gray-600">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, totalCoursesCount)} of{" "}
                {totalCoursesCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-100 transition disabled:opacity-40"
                >
                  &larr; Prev
                </button>
                <span className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 font-semibold text-cyan-700">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl border border-gray-300 px-3 py-1.5 font-medium hover:bg-gray-100 transition disabled:opacity-40"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
