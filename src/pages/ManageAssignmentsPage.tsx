import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import toast from "react-hot-toast";

interface StudentRow {
  id: string;
  name: string;
  email: string;
}

export default function ManageAssignmentsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const assessmentId = searchParams.get("id");

  const [assessmentTitle, setAssessmentTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [assignedStudentIds, setAssignedStudentIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadAssignmentContext = useCallback(async () => {
    if (!assessmentId) return;
    setLoading(true);
    try {
      // 1. Fetch the assessment details to find its associated module context
      const { data: assessment, error: aErr } = await supabase
        .from("assessments")
        .select(`title, module_id`)
        .eq("id", assessmentId)
        .single();
      if (aErr) throw aErr;
      setAssessmentTitle(assessment.title);

      const { data: mod, error: mErr } = await supabase
        .from("modules")
        .select("course_id")
        .eq("id", assessment.module_id)
        .single();
      if (mErr) throw mErr;
      setCourseId(mod.course_id);

      // 2. Fetch all students enrolled in this course context joined with their profile info
      const { data: enrolled, error: eErr } = await supabase
        .from("student_course_assignments")
        .select(`
          student_id,
          profiles:student_id (
            full_name,
            email
          )
        `)
        .eq("course_id", mod.course_id);
      if (eErr) throw eErr;

      // Map relational join payloads into clean layout view rows
      const studentRows: StudentRow[] = (enrolled as any[])?.map(r => ({
        id: r.student_id,
        name: r.profiles?.full_name || "Unknown Student",
        email: r.profiles?.email || "No email available"
      })) || [];
      
      // Sort alphabetically by name for a premium presentation layer experience
      studentRows.sort((a, b) => a.name.localeCompare(b.name));
      setStudents(studentRows);

      // 3. Fetch currently assigned students for this assessment
      const { data: existingAssignments, error: aaErr } = await supabase
        .from("assessment_assignments")
        .select("student_id")
        .eq("assessment_id", assessmentId);
      if (aaErr) throw aaErr;

      const assignedSet = new Set<string>(existingAssignments.map((a: any) => a.student_id));
      setAssignedStudentIds(assignedSet);

    } catch (err: any) {
      setError(err.message || "Failed to load assignment structural scopes.");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadAssignmentContext();
  }, [loadAssignmentContext]);

  const handleToggleAssignment = async (studentId: string, isCurrentlyAssigned: boolean) => {
    if (!assessmentId) return;
    setProcessingId(studentId);
    try {
      if (isCurrentlyAssigned) {
        // Unassign student scope link
        const { error } = await supabase
          .from("assessment_assignments")
          .delete()
          .eq("assessment_id", assessmentId)
          .eq("student_id", studentId);
        if (error) throw error;

        setAssignedStudentIds(prev => {
          const next = new Set(prev);
          next.delete(studentId);
          return next;
        });
        toast.success("Access scope revoked.");
      } else {
        // Assign student scope link
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase
          .from("assessment_assignments")
          .insert([{
            assessment_id: assessmentId,
            student_id: studentId,
            assigned_by: user?.id || null
          }]);
        if (error) throw error;

        setAssignedStudentIds(prev => {
          const next = new Set(prev);
          next.add(studentId);
          return next;
        });
        toast.success("Access scope granted successfully.");
      }
    } catch (err: any) {
      toast.error(`Modification failed: ${err.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-gray-50">
        <div className="w-10 h-10 border-4 border-[#1E3A8A] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (error) return <div className="p-6 text-red-600 bg-red-50 rounded-xl m-6">{error}</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans bg-gray-50 min-h-screen font-[DM_Sans]">
      <div className="mb-6 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight font-[Syne]">Manage Access Scopes</h1>
          <p className="text-sm text-cyan-700 font-semibold mt-1">Assessment Target: {assessmentTitle}</p>
        </div>
        <button
          onClick={() => navigate("/assessments")}
          className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
        >
          Back to List
        </button>
      </div>

      <div className="bg-white shadow-sm border border-gray-200 rounded-2xl overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-gray-200 text-xs font-bold uppercase tracking-wider text-slate-700">
          Enrolled Student Cohort ({students.length})
        </div>
        
        {students.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No students are currently enrolled in this course context.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {students.map((student) => {
              const isAssigned = assignedStudentIds.has(student.id);
              const isWorking = processingId === student.id;

              return (
                <li key={student.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition">
                  <div>
                    {/* Displays Student Name cleanly */}
                    <p className="text-sm font-bold text-gray-900">{student.name}</p>
                    {/* Secondary row showing their email and a clipped portion of the ID */}
                    <p className="text-xs text-gray-400 font-mono mt-0.5">
                      {student.email} <span className="text-gray-300 mx-1">|</span> {student.id.slice(0, 8)}...
                    </p>
                  </div>
                  <button
                    disabled={isWorking}
                    onClick={() => handleToggleAssignment(student.id, isAssigned)}
                    className={`px-4 py-1.5 rounded-lg font-bold text-xs uppercase tracking-wider transition shadow-sm ${
                      isAssigned 
                        ? "bg-emerald-600 text-white hover:bg-emerald-700" 
                        : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {isWorking ? "Updating..." : isAssigned ? "✓ Access Granted" : "Revoked / Restrict"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}