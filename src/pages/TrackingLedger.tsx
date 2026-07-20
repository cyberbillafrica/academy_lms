import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import CollapsibleCard from "../components/CollapsibleCard";

interface StudentProfile {
  id: string;
  full_name: string;
  email: string;
  specialization_track?: string | null;
}

export default function TrackingLedger() {
  const navigate = useNavigate();

  // ── STATE ─────────────────────────────────────────────────────────────
  const [students, setStudents] = useState<StudentProfile[]>([]);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendanceGrid, setAttendanceGrid] = useState<Record<string, string>>({});
  const [progressMatrix, setProgressMatrix] = useState<Record<string, number>>({});
  const [moduleProgressData, setModuleProgressData] = useState<Record<string, any[]>>({});
  const [gradesMatrix, setGradesMatrix] = useState<Record<string, { totalScore: number; count: number }>>({});
  const [totalModules, setTotalModules] = useState(0);

  // UI Controls
  const [searchQuery, setSearchQuery] = useState("");
  const [trackFilter, setTrackFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: "", type: "" });

  // ── CGPA Calculator ───────────────────────────────────────────────────
  const calculateCGPA = (percentage: number): string => {
    if (percentage >= 90) return "4.0";
    if (percentage >= 80) return "3.7";
    if (percentage >= 70) return "3.3";
    if (percentage >= 60) return "3.0";
    if (percentage >= 50) return "2.7";
    if (percentage >= 40) return "2.3";
    if (percentage >= 30) return "2.0";
    return "1.0";
  };

  // ── DATA FETCHING ─────────────────────────────────────────────────────
  const initializeLedgerData = useCallback(async () => {
    setLoading(true);
    try {
      const [profilesRes, modulesRes, progressRes, gradesRes, moduleProgressRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, email, specialization_track").eq("role", "student").order("full_name"),
        supabase.from("modules").select("*", { count: "exact", head: true }),
        supabase.from("module_progress").select("student_id").eq("completed", true),
        supabase.from("submissions").select("student_id, grade").not("grade", "is", null),
        supabase.from("module_progress").select(`
          student_id,
          module_id,
          completed,
          progress_percentage,
          module:modules(id, title, module_order)
        `).order("module_order", { referencedTable: "modules", ascending: true })
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (modulesRes.error) throw modulesRes.error;
      if (progressRes.error) throw progressRes.error;
      if (gradesRes.error) throw gradesRes.error;
      if (moduleProgressRes.error) throw moduleProgressRes.error;

      setStudents(profilesRes.data || []);
      setTotalModules(modulesRes.count || 0);

      // Overall completed count
      const progMatrix: Record<string, number> = {};
      progressRes.data?.forEach((row) => {
        progMatrix[row.student_id] = (progMatrix[row.student_id] || 0) + 1;
      });
      setProgressMatrix(progMatrix);

      // Detailed module progress with real percentage
      const progressByStudent: Record<string, any[]> = {};
      moduleProgressRes.data?.forEach((row: any) => {
        if (!progressByStudent[row.student_id]) progressByStudent[row.student_id] = [];
        progressByStudent[row.student_id].push({
          module_id: row.module_id,
          completed: row.completed,
          progress_percentage: row.progress_percentage,
          module: row.module,
        });
      });
      setModuleProgressData(progressByStudent);

      // Grades
      const gpaMap: Record<string, { totalScore: number; count: number }> = {};
      gradesRes.data?.forEach((row) => {
        if (!gpaMap[row.student_id]) gpaMap[row.student_id] = { totalScore: 0, count: 0 };
        gpaMap[row.student_id].totalScore += Number(row.grade);
        gpaMap[row.student_id].count += 1;
      });
      setGradesMatrix(gpaMap);

    } catch (err: any) {
      setStatusMsg({ text: err.message || "Failed to load data.", type: "error" });
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAttendanceForDate = useCallback(async (date: string) => {
    try {
      const { data, error } = await supabase.from("attendance").select("student_id, status").eq("attendance_date", date);
      if (error) throw error;

      const grid: Record<string, string> = {};
      data?.forEach((rec) => grid[rec.student_id] = rec.status);
      setAttendanceGrid(grid);
    } catch (err: any) {
      console.error("Attendance error:", err.message);
    }
  }, []);

  useEffect(() => { initializeLedgerData(); }, [initializeLedgerData]);
  useEffect(() => { fetchAttendanceForDate(attendanceDate); }, [attendanceDate, fetchAttendanceForDate]);

  // ── HANDLERS ─────────────────────────────────────────────────────────
  const handleStatusChange = (studentId: string, status: string) => {
    setAttendanceGrid(prev => ({ ...prev, [studentId]: status }));
  };

  const handleBulkMarkPresent = () => {
    const bulk = { ...attendanceGrid };
    filteredStudents.forEach(s => bulk[s.id] = "present");
    setAttendanceGrid(bulk);
  };

  const handleClearSelection = () => {
    const reset = { ...attendanceGrid };
    filteredStudents.forEach(s => delete reset[s.id]);
    setAttendanceGrid(reset);
  };

  const saveAttendanceGrid = async () => {
    setLoading(true);
    setStatusMsg({ text: "", type: "" });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const payloads = Object.entries(attendanceGrid).map(([studentId, status]) => ({
        student_id: studentId,
        attendance_date: attendanceDate,
        status,
        marked_by: user?.id ?? null,
      }));

      if (payloads.length === 0) {
        setStatusMsg({ text: "No changes to save.", type: "error" });
        setLoading(false);
        return;
      }

      const { error } = await supabase.from("attendance").upsert(payloads, { onConflict: "student_id,attendance_date" });
      if (error) throw error;
      setStatusMsg({ text: "Attendance saved successfully.", type: "success" });
    } catch (err: any) {
      setStatusMsg({ text: err.message || "Failed to save.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  // ── FILTERS ───────────────────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const matchesSearch = student.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           student.email.toLowerCase().includes(searchQuery.toLowerCase());
      const track = student.specialization_track || "Core";
      const matchesTrack = trackFilter === "all" || track.toLowerCase() === trackFilter.toLowerCase();
      return matchesSearch && matchesTrack;
    });
  }, [students, searchQuery, trackFilter]);

  return (
    <div className="p-6 max-w-7xl mx-auto font-sans bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 tracking-tight">Tracking Ledger & Matrix</h1>
          <p className="text-xs text-gray-500 mt-1">Monitor attendance, progress, and performance</p>
        </div>
        <button onClick={() => navigate("/dashboard")} className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-slate-700 transition">
          ← Dashboard
        </button>
      </div>

      {/* Controls */}
      <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-center">
        <div className="flex flex-1 gap-3 w-full sm:w-auto">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by name or email..."
              className="w-full text-xs px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-800 text-gray-900 placeholder-gray-400"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="text-xs px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-slate-800 text-gray-700"
            value={trackFilter}
            onChange={(e) => setTrackFilter(e.target.value)}
          >
            <option value="all">All Tracks</option>
            <option value="core">Core Path</option>
            <option value="network security">Network Security</option>
            <option value="identity & access management">Identity & Access Management</option>
            <option value="risk management & incident response">Risk Management</option>
            <option value="cloud security">Cloud Security</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button onClick={handleBulkMarkPresent} disabled={filteredStudents.length === 0} className="text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 hover:bg-emerald-100 disabled:opacity-50">
            Mark Filtered Present
          </button>
          <button onClick={handleClearSelection} disabled={filteredStudents.length === 0} className="text-[11px] font-bold bg-gray-50 text-gray-600 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-100 disabled:opacity-50">
            Clear Visible
          </button>
        </div>
      </div>

      {statusMsg.text && (
        <div className={`mb-6 p-4 rounded-xl text-xs font-bold border ${statusMsg.type === "error" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
          {statusMsg.text}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-200 text-slate-700 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Student Profile</th>
                <th className="px-6 py-4">Track Status</th>
                <th className="px-6 py-4">Syllabus Progress</th>
                <th className="px-6 py-4">Performance</th>
                <th className="px-6 py-4 text-center">Attendance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-800">
              {filteredStudents.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400 text-xs italic">No students found.</td></tr>
              ) : (
                filteredStudents.map((student) => {
                  const completed = progressMatrix[student.id] || 0;
                  const currentStatus = attendanceGrid[student.id] || "";
                  const gradeData = gradesMatrix[student.id];
                  const averageScore = gradeData ? Math.round(gradeData.totalScore / gradeData.count) : null;

                  return (
                    <tr key={student.id} className="hover:bg-slate-50/40 transition">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900">{student.full_name}</div>
                        <div className="text-xs text-gray-400 font-mono">{student.email}</div>
                      </td>

                      <td className="px-6 py-4">
                        <span className={`text-[10px] font-extrabold tracking-wide uppercase px-2 py-0.5 rounded-md border ${
                          student.specialization_track && student.specialization_track !== "Core"
                            ? "bg-purple-50 text-purple-700 border-purple-200" 
                            : "bg-blue-50 text-blue-700 border-blue-200"
                        }`}>
                          {student.specialization_track || "Core Path"}
                        </span>
                      </td>

                      {/* Dynamic Module Progress */}
                      <td className="px-6 py-4">
                        <CollapsibleCard title={`📊 Module Progress (${completed}/${totalModules})`} defaultOpen={false}>
                          <div className="space-y-2 p-1 max-h-72 overflow-y-auto">
                            {moduleProgressData[student.id]?.length > 0 ? (
                              moduleProgressData[student.id].map((mod: any) => {
                                const progressPercent = mod.completed ? 100 : (mod.progress_percentage ?? 0);
                                return (
                                  <div key={mod.module_id} className="border rounded p-2 text-xs bg-white">
                                    <div className="flex justify-between items-center mb-1">
                                      <span className="font-bold text-[#1B2A6B]">Wk {mod.module?.module_order}: {mod.module?.title}</span>
                                      {mod.completed && <span className="text-emerald-600 text-[10px] font-bold">✓ Completed</span>}
                                    </div>
                                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                                      <div 
                                        className={`h-1.5 rounded-full transition-all ${mod.completed ? "bg-green-500" : "bg-amber-400"}`} 
                                        style={{ width: `${progressPercent}%` }} 
                                      />
                                    </div>
                                    <div className="text-right text-xs text-gray-500 mt-1 font-mono">{progressPercent}%</div>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-xs text-gray-400 p-3">No progress recorded yet.</p>
                            )}
                          </div>
                        </CollapsibleCard>
                      </td>

                      {/* Performance */}
                      <td className="px-6 py-4">
                        {averageScore !== null ? (
                          <div className="space-y-1">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded border ${
                              averageScore >= 75 ? "bg-emerald-50 text-emerald-700 border-emerald-100" :
                              averageScore >= 50 ? "bg-amber-50 text-amber-700 border-amber-100" :
                              "bg-rose-50 text-rose-700 border-rose-100"
                            }`}>
                              {averageScore}% Avg
                            </span>
                            <div className="text-xs text-slate-600">
                              CGPA: <span className="font-bold text-slate-800">{calculateCGPA(averageScore)}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">Avg: —<br />CGPA: —</div>
                        )}
                      </td>

                      {/* Attendance */}
                      <td className="px-6 py-4">
                        <div className="flex justify-center gap-1.5">
                          {["Present", "Absent", "Late"].map((type) => {
                            const value = type.toLowerCase();
                            const isSelected = currentStatus === value;
                            return (
                              <button
                                key={type}
                                onClick={() => handleStatusChange(student.id, value)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                                  isSelected
                                    ? type === "Present" ? "bg-emerald-600 text-white border-emerald-600" :
                                      type === "Absent" ? "bg-rose-600 text-white border-rose-600" :
                                      "bg-amber-500 text-white border-amber-500"
                                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                                }`}
                              >
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="p-4 bg-slate-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={saveAttendanceGrid}
            disabled={loading || filteredStudents.length === 0}
            className="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-xs font-bold uppercase tracking-wider py-2.5 px-6 rounded-xl shadow-sm transition"
          >
            {loading ? "Saving..." : "Commit Attendance Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}