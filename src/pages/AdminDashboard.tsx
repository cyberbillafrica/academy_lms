import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import MessagesPanel from "../components/MessagesPanel";
import CollapsibleCard from "../components/CollapsibleCard";
import { queryClient } from "../lib/queryClient";
import { useAuditLogs } from "../hooks/useAuditLogs";

// New imports: our centralised hooks + the extracted student table
import {
  useMetrics,
  useEnrollmentCodes,
  useProfiles,
  useCourses,
  useEnrollments,
  type ProfileItem,
  type EnrollmentCode,
  type CourseItem,
  type Enrollment,
} from "../hooks/adminHooks";
import StudentDirectory from "../components/StudentDirectory";

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  severity: "info" | "warning" | "critical";
}

const SPECIALIZATION_TRACKS = [
  "Network Security",
  "Identity & Access Management",
  "Risk Management & Incident Response",
  "Cloud Security",
  "Application Security",
  "Governance, Risk & Compliance",
];

type BroadcastTarget = "global" | "students" | "instructors";

function generateUniqueCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  arr.forEach((b) => (suffix += chars[b % chars.length]));
  return "CBA-" + suffix;
}

export default function AdminDashboard() {
  const navigate = useNavigate();

  // ── Global UI state (unchanged) ──
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "">("");
  const [lastGeneratedCode, setLastGeneratedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Token table search & pagination
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  // Course Creator form
  const [ccTitle, setCcTitle] = useState("");
  const [ccInstructor, setCcInstructor] = useState("");
  const [ccInitialModule, setCcInitialModule] = useState("");
  const [ccAssessmentTitle, setCcAssessmentTitle] = useState("");
  const [isCreatingCourseCanvas, setIsCreatingCourseCanvas] = useState(false);

  // Global switches
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [allowRegistrationCodes, setAllowRegistrationCodes] = useState(true);
  const [lockGradesVisibility, setLockGradesVisibility] = useState(false);

  // Modal
  const [selectedProfile, setSelectedProfile] = useState<ProfileItem | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);

  // Enrollment
  const [enrollCourseId, setEnrollCourseId] = useState("");
  const [enrollStudentId, setEnrollStudentId] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);

  // Communication
  const [broadcastTarget, setBroadcastTarget] = useState<BroadcastTarget>("global");
  const [broadcastTitle, setBroadcastTitle] = useState("");
  const [broadcastBody, setBroadcastBody] = useState("");
  const [selectedStudentUid, setSelectedStudentUid] = useState("");
  const [directMessageBody, setDirectMessageBody] = useState("");


  // ── Data hooks (replace all manual fetching) ──
  const { data: metricsData } = useMetrics();
  const metrics = metricsData ?? { total: 0, used: 0, pending: 0 };

  const {
    codes,
    totalFilteredCount,
    totalPages,
    isFetching: isFetchingCodes,
  } = useEnrollmentCodes(searchTerm, currentPage);

  const {
    students: registeredStudentsList,
    instructors: activeInstructorsList,
    isLoading: isFetchingProfiles,
  } = useProfiles();

  const { data: courses = [] } = useCourses();
  const { data: enrollments = [] } = useEnrollments();
  const { logs: auditLogs, isLoading: isAuditLoading, pushAuditLog } = useAuditLogs();


  // Derived: at-risk students
  const atRiskStudents = registeredStudentsList
    .filter((s) => !s.active || s.specialization_track === null)
    .slice(0, 2);


  // Token generation
  const generateCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!allowRegistrationCodes) {
      setStatusMessage("Registration tokens are currently closed.");
      setStatusType("error");
      return;
    }
    setLoading(true);
    try {
      const generatedString = generateUniqueCode();
      const { error } = await supabase
        .from("enrollment_codes")
        .insert({ code: generatedString, active: true, used: false });
      if (error) throw error;
      setLastGeneratedCode(generatedString);
      setStatusMessage(`New enrollment token created: ${generatedString}`);
      setStatusType("success");
      pushAuditLog("Generated Enrollment Token", generatedString, "info");
      // Invalidate React Query cache so table refreshes
      queryClient.invalidateQueries({ queryKey: ["codes"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    } finally {
      setLoading(false);
    }
  };

  // Token revocation
  const revokeCode = async (id: number, code: string) => {
    if (!window.confirm(`Delete token ${code}?`)) return;
    try {
      const { error } = await supabase.from("enrollment_codes").delete().eq("id", id);
      if (error) throw error;
      setStatusMessage(`Token ${code} deleted.`);
      setStatusType("success");
      pushAuditLog("Deleted Enrollment Token", code, "warning");
      queryClient.invalidateQueries({ queryKey: ["codes"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    }
  };

  // Student suspension
  const handleToggleSuspension = async (profile: ProfileItem) => {
    setIsActionLoading(true);
    const nextActiveStatus = !profile.active;
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ active: nextActiveStatus })
        .eq("id", profile.id);
      if (error) throw error;
      setStatusMessage(
        `Student account is now ${nextActiveStatus ? "Active" : "Suspended"}.`
      );
      setStatusType("success");
      pushAuditLog(
        nextActiveStatus ? "Activated Student Account" : "Suspended Student Account",
        profile.full_name || profile.id,
        nextActiveStatus ? "info" : "warning"
      );
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Student deletion
  const handlePermanentDeletion = async (profile: ProfileItem) => {
    const confirmation = window.confirm(
      `Are you completely sure you want to delete ${profile.full_name || "this student"}? This will completely wipe their login profile and account data forever.`
    );
    if (!confirmation) return;
    setIsActionLoading(true);
    try {
      const { error } = await supabase.from("profiles").delete().eq("id", profile.id);
      if (error) throw error;
      setStatusMessage("Student account deleted successfully.");
      setStatusType("success");
      pushAuditLog("Deleted Student Account", profile.full_name || profile.id, "critical");
      setSelectedProfile(null);
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    } finally {
      setIsActionLoading(false);
    }
  };

  // Course creation (old multi‑insert – you can later upgrade to transaction)
  const handleCreateUnifiedCourseCanvas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ccTitle.trim()) return;
    setIsCreatingCourseCanvas(true);
    try {
      const { data: courseData, error: cErr } = await supabase
        .from("courses")
        .insert({ title: ccTitle.trim(), is_global: true })
        .select()
        .single();
      if (cErr) throw cErr;

      if (ccInstructor) {
        await supabase.from("course_instructors").insert({
          course_id: courseData.id,
          instructor_id: ccInstructor,
        });
      }

      if (ccInitialModule.trim()) {
        const { data: modData, error: mErr } = await supabase
          .from("modules")
          .insert({ course_id: courseData.id, title: ccInitialModule.trim(), order_index: 1 })
          .select()
          .single();

        if (ccAssessmentTitle.trim() && !mErr && modData) {
          await supabase.from("assessments").insert({
            module_id: modData.id,
            title: ccAssessmentTitle.trim(),
            max_score: 100,
          });
        }
      }

      setStatusMessage(`Course "${ccTitle}" has been created successfully!`);
      setStatusType("success");
      pushAuditLog("Created new course setup", ccTitle, "info");

      setCcTitle("");
      setCcInstructor("");
      setCcInitialModule("");
      setCcAssessmentTitle("");
      queryClient.invalidateQueries({ queryKey: ["courses"] });
    } catch (err: any) {
      setStatusMessage(err.message || "Could not create the course.");
      setStatusType("error");
    } finally {
      setIsCreatingCourseCanvas(false);
    }
  };

  // Enrollment
  const handleEnrollStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollCourseId || !enrollStudentId) return;
    setIsEnrolling(true);
    try {
      const { error } = await supabase
        .from("student_course_assignments")
        .insert({ student_id: enrollStudentId, course_id: enrollCourseId });
      if (error) throw error;
      setStatusMessage("Student has been assigned to the course.");
      setStatusType("success");
      pushAuditLog("Enrolled Student to Course", `Student ID: ${enrollStudentId}`, "info");
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleUnenroll = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from("student_course_assignments")
        .delete()
        .eq("id", assignmentId);
      if (error) throw error;
      setStatusMessage("Student removed from course.");
      setStatusType("success");
      pushAuditLog("Removed Student from Course", assignmentId, "warning");
      queryClient.invalidateQueries({ queryKey: ["enrollments"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    }
  };

  // Specialization
  const handleSetSpecialization = async (userId: string, track: string) => {
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ specialization_track: track || null })
        .eq("id", userId);
      if (error) throw error;
      setStatusMessage("Student track updated successfully.");
      setStatusType("success");
      pushAuditLog("Updated Student Track", `${userId} -> ${track || "None"}`, "info");
      queryClient.invalidateQueries({ queryKey: ["profiles"] });
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    }
  };

  // Direct message
  const submitDirectStudentMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentUid || !directMessageBody.trim()) return;
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.from("direct_messages").insert({
        sender_id: user?.id,
        recipient_id: selectedStudentUid,
        body: directMessageBody.trim(),
      });
      if (error) throw error;
      setStatusMessage("Message sent directly to student.");
      setStatusType("success");
      pushAuditLog("Sent Direct Message to Student", selectedStudentUid, "info");
      setDirectMessageBody("");
    } catch (err: any) {
      setStatusMessage(err.message);
      setStatusType("error");
    }
  };

  // EWS intervention
  const triggerEwsIntervention = (studentId: string) => {
    setSelectedStudentUid(studentId);
    setDirectMessageBody(
      "Hello, we noticed your study progress has slowed down over the last few days. Please send us a message here so we can help you out."
    );
    const element = document.getElementById("direct-message-suite");
    if (element) element.scrollIntoView({ behavior: "smooth" });
  };

  // ── JSX – ONLY the student table is replaced, everything else remains identical ──
  return (
    <div
      className={`font-sans min-h-screen relative transition-all duration-300 ${
        maintenanceMode ? "bg-amber-50" : "bg-gray-100"
      }`}
    >
      {/* Header (unchanged) */}
      <div
        className={`p-6 shadow-md border-b text-white transition-all ${
          maintenanceMode ? "bg-amber-800" : "bg-[#0A192F]"
        }`}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-bold text-2xl tracking-tight">CYBERBILL ACADEMY</h1>
              {maintenanceMode && (
                <span className="bg-red-500 text-white font-bold text-xs px-2.5 py-0.5 rounded-md animate-pulse">
                  MAINTENANCE MODE ACTIVE
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-1 uppercase tracking-widest font-semibold">
              Admin Control Dashboard
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setMaintenanceMode(!maintenanceMode);
                pushAuditLog("Changed Maintenance Mode Status", String(!maintenanceMode), "critical");
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-400 text-amber-400 bg-transparent hover:bg-amber-500/10 transition"
            >
              ⚙️ Maintenance Settings
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                navigate("/login");
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-8">
        {/* Global Dashboard Switches (unchanged) */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex items-center justify-between p-2 border-r last:border-0 border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-800">Registration Access Tokens</p>
              <p className="text-xs text-gray-400">Allow new users to sign up</p>
            </div>
            <input
              type="checkbox"
              checked={allowRegistrationCodes}
              onChange={(e) => {
                setAllowRegistrationCodes(e.target.checked);
                pushAuditLog("Toggled Registration Token Status", String(e.target.checked), "warning");
              }}
              className="w-10 h-5 bg-gray-200 rounded-full appearance-none checked:bg-[#3AAA35] relative cursor-pointer before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:transition-all checked:before:translate-x-5 shadow-inner"
            />
          </div>

          <div className="flex items-center justify-between p-2 border-r last:border-0 border-gray-100">
            <div>
              <p className="text-sm font-bold text-gray-800">Lock Student Grades</p>
              <p className="text-xs text-gray-400">Hide grades while instructors mark</p>
            </div>
            <input
              type="checkbox"
              checked={lockGradesVisibility}
              onChange={(e) => {
                setLockGradesVisibility(e.target.checked);
                pushAuditLog("Toggled Grade Visibility Lock", String(e.target.checked), "critical");
              }}
              className="w-10 h-5 bg-gray-200 rounded-full appearance-none checked:bg-[#F47920] relative cursor-pointer before:content-[''] before:absolute before:w-5 before:h-5 before:bg-white before:rounded-full before:transition-all checked:before:translate-x-5 shadow-inner"
            />
          </div>

          <div className="flex items-center justify-between p-2">
            <div>
              <p className="text-sm font-bold text-slate-800">System Security Network</p>
              <p className="text-xs text-gray-400">LMS Server Status</p>
            </div>
            <span className="bg-emerald-100 text-[#3AAA35] text-[10px] uppercase font-extrabold px-2 py-1 rounded">
              SECURE & ONLINE
            </span>
          </div>
        </div>

        {/* METRICS PANELS (unchanged) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Created Tokens</p>
            <p className="text-3xl font-black text-slate-800 mt-1">{metrics.total}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Used Tokens</p>
            <p className="text-3xl font-black text-[#3AAA35] mt-1">{metrics.used}</p>
          </div>
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Unused Tokens</p>
            <p className="text-3xl font-black text-[#F47920] mt-1">{metrics.pending}</p>
          </div>
        </div>

        {/* Early Warning System Alerts (unchanged) */}
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">⚠️</span>
            <div>
              <h3 className="text-sm font-bold text-orange-900 uppercase tracking-wide">
                Attention: Students Needing Support
              </h3>
              <p className="text-xs text-orange-700">
                The system auto-flags students who haven't completed their registration or have account issues.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {atRiskStudents.map((student) => (
              <div
                key={student.id}
                className="bg-white border border-orange-100 p-3 rounded-lg flex items-center justify-between text-xs"
              >
                <div>
                  <p className="font-bold text-gray-900">
                    {student.full_name || "New Student Account"}
                  </p>
                  <p className="text-gray-500 font-mono text-[10px] mt-0.5">{student.email}</p>
                  <span className="text-[10px] mt-1 inline-block font-semibold bg-red-100 text-red-800 px-1.5 rounded">
                    Needs Track Selection / Registration Check
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => triggerEwsIntervention(student.id)}
                  className="bg-[#F47920] text-white font-bold px-3 py-1 rounded hover:opacity-90 transition"
                >
                  Send Message
                </button>
              </div>
            ))}
            {atRiskStudents.length === 0 && (
              <p className="text-xs font-medium text-[#3AAA35] col-span-2">
                All system student folders are in excellent order.
              </p>
            )}
          </div>
        </div>

        {/* NAV BUTTONS (unchanged) */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => navigate("/courses")}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
          >
            Manage Courses
          </button>
          <button
            onClick={() => navigate("/modules")}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700 transition"
          >
            Manage Modules
          </button>
          <button
            onClick={() => navigate("/assessments")}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition"
          >
            Manage Assessments
          </button>
          <button
            onClick={() => navigate("/admin/tracking")}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            Manage Attendance & Progress
          </button>
        </div>

        {/* Course Creator (unchanged) */}
        <CollapsibleCard title="🛠️ Fast Course Setup Studio (Add Course, Module, & Assessment at once)">
          <div className="p-2">
            <p className="text-xs text-gray-500 mb-4">
              Save time! Use this form to create a brand new course, link its teacher, add its first lesson
              topic module, and attach its first grading test inside one quick action.
            </p>
            <form
              onSubmit={handleCreateUnifiedCourseCanvas}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end"
            >
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  Course Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. Introduction to Cybersecurity"
                  value={ccTitle}
                  onChange={(e) => setCcTitle(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2 text-sm text-gray-900 w-full bg-white outline-none focus:border-[#F47920]"
                  required
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  Assign Course Instructor
                </label>
                <select
                  value={ccInstructor}
                  onChange={(e) => setCcInstructor(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2 text-sm text-gray-900 w-full bg-white outline-none focus:border-[#F47920]"
                >
                  <option value="">-- Choose Instructor --</option>
                  {activeInstructorsList.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  First Module Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Module 1: Core Concepts"
                  value={ccInitialModule}
                  onChange={(e) => setCcInitialModule(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2 text-sm text-gray-900 w-full bg-white outline-none focus:border-[#F47920]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">
                  First Assessment Test Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Module 1 Quiz"
                  value={ccAssessmentTitle}
                  onChange={(e) => setCcAssessmentTitle(e.target.value)}
                  className="border border-gray-300 rounded-lg p-2 text-sm text-gray-900 w-full bg-white outline-none focus:border-[#F47920]"
                  disabled={!ccInitialModule.trim()}
                />
              </div>
              <div className="md:col-span-2 lg:col-span-4 mt-2">
                <button
                  type="submit"
                  disabled={isCreatingCourseCanvas || !ccTitle.trim()}
                  className="bg-[#3AAA35] text-white font-bold text-xs uppercase tracking-widest px-6 py-3 rounded-lg shadow-md hover:opacity-90 transition disabled:opacity-50"
                >
                  {isCreatingCourseCanvas ? "Saving Setup Layout..." : "Deploy Full Course Setup Layout"}
                </button>
              </div>
            </form>
          </div>
        </CollapsibleCard>

        {/* Status message (unchanged) */}
        {statusMessage && (
          <div
            className={`p-4 text-xs font-bold rounded-lg ${
              statusType === "error"
                ? "bg-red-50 text-red-800 border border-red-200"
                : "bg-emerald-50 text-[#3AAA35] border border-emerald-200"
            }`}
          >
            <div className="flex justify-between items-center">
              <p>{statusMessage}</p>
              {lastGeneratedCode && (
                <button
                  onClick={() => navigator.clipboard.writeText(lastGeneratedCode)}
                  className="bg-[#0A192F] text-white px-2 py-0.5 rounded text-[10px]"
                >
                  Copy Code
                </button>
              )}
            </div>
          </div>
        )}

        {/* STUDENT DIRECTORY – NOW USING THE EXTRACTED COMPONENT */}
        <StudentDirectory
          students={registeredStudentsList}
          isFetching={isFetchingProfiles}
          onSelectProfile={setSelectedProfile}
        />

        {/* TOKEN GENERATOR HUB (unchanged) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <CollapsibleCard title="🎟️ Issue Single Student Registration Token">
            <div className="p-2">
              <form onSubmit={generateCode} className="space-y-4">
                <p className="text-xs text-gray-400">
                  Creates a singular custom security sign-up code that you can give to a student so they can
                  register for training access.
                </p>
                <button
                  type="submit"
                  disabled={loading || !allowRegistrationCodes}
                  className="w-full bg-[#F47920] text-white font-bold text-xs uppercase tracking-wider py-3 px-4 rounded-lg hover:opacity-90 transition disabled:opacity-40"
                >
                  Generate Token Code
                </button>
              </form>
            </div>
          </CollapsibleCard>

          <div className="lg:col-span-2">
            <CollapsibleCard title="📊 Active Registration Access Tokens Registry Tracking Ledger">
              <div className="p-2 space-y-4">
                <input
                  type="text"
                  placeholder="Search tokens database..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded-lg p-2 text-xs w-full bg-white text-gray-900 outline-none"
                />
                <div className="overflow-x-auto rounded-lg border border-gray-100">
                  <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
                    <thead className="bg-gray-50 font-bold text-gray-600 uppercase">
                      <tr>
                        <th className="px-3 py-2">Token</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Claimed By</th>
                        <th className="px-3 py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white font-mono text-gray-600">
                      {codes.map((c) => (
                        <tr key={c.id}>
                          <td className="px-3 py-2 text-slate-800 font-bold">{c.code}</td>
                          <td className="px-3 py-2">
                            {c.used ? (
                              <span className="text-gray-400 font-bold">USED</span>
                            ) : (
                              <span className="text-[#3AAA35] font-bold">READY</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-[11px] truncate max-w-[120px]">
                            {c.used_by || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex gap-1">
                              <button
                                onClick={() => navigator.clipboard.writeText(c.code)}
                                className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-700 font-bold"
                              >
                                Copy
                              </button>
                              {!c.used && (
                                <button
                                  onClick={() => revokeCode(c.id, c.code)}
                                  className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalFilteredCount > 5 && (
                  <div className="flex items-center gap-1 text-xs">
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2 py-1 border rounded disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="px-2 py-1 bg-slate-100 rounded font-bold">
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 border rounded disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
            </CollapsibleCard>
          </div>
        </div>

        {/* Communication Panel (unchanged) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CollapsibleCard title="📢 Post Campus Broadcast / Global System Notice">
            <div className="p-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setStatusMessage("Global notice published successfully.");
                  setStatusType("success");
                  pushAuditLog(
                    "Published system broadcast notice",
                    broadcastTitle || "Notice Announcement",
                    "info"
                  );
                  setBroadcastBody("");
                  setBroadcastTitle("");
                }}
                className="space-y-4"
              >
                <select
                  value={broadcastTarget}
                  onChange={(e) => setBroadcastTarget(e.target.value as BroadcastTarget)}
                  className="border border-gray-300 rounded-lg p-2 w-full text-xs bg-white text-gray-900 outline-none"
                >
                  <option value="global">Audience Scope: Send to Everyone on LMS Platform</option>
                  <option value="students">Audience Scope: Send to Registered Students Only</option>
                  <option value="instructors">Audience Scope: Send to Teachers & Instructors Only</option>
                </select>
                <input
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="Notice Headline / Subject Title"
                  className="border border-gray-300 rounded-lg p-2 text-xs w-full bg-white text-gray-900 outline-none"
                  required
                />
                <textarea
                  rows={3}
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  placeholder="Type announcement message contents here..."
                  className="border border-gray-300 rounded-lg p-2.5 text-xs w-full bg-white text-gray-900 outline-none"
                  required
                />
                <button
                  type="submit"
                  className="bg-[#0A192F] text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg hover:opacity-90 transition"
                >
                  Post Broad Notice
                </button>
              </form>
            </div>
          </CollapsibleCard>

          <div id="direct-message-suite">
            <CollapsibleCard title="💬 Send Private Directive Message to Particular Student">
              <div className="p-2">
                <form onSubmit={submitDirectStudentMessage} className="space-y-4">
                  <select
                    value={selectedStudentUid}
                    onChange={(e) => setSelectedStudentUid(e.target.value)}
                    className="border border-gray-300 rounded-lg p-2 w-full text-xs bg-white text-gray-900 outline-none"
                    required
                  >
                    <option value="">-- Choose Target Student Recipient Folder --</option>
                    {registeredStudentsList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name || "Student profile account missing name info"} ({s.id.slice(0, 8)}
                        ...)
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={3}
                    value={directMessageBody}
                    onChange={(e) => setDirectMessageBody(e.target.value)}
                    placeholder="Type private instructional message here..."
                    className="border border-gray-300 rounded-lg p-2.5 text-xs w-full bg-white text-gray-900 outline-none"
                    required
                  />
                  <button
                    type="submit"
                    className="bg-[#F47920] text-white font-bold text-xs uppercase tracking-wider px-4 py-2 rounded-lg hover:opacity-90 transition"
                  >
                    Send Private Message
                  </button>
                </form>
              </div>
            </CollapsibleCard>
          </div>
        </div>

        {/* Messages Panel (unchanged) */}
        <CollapsibleCard title="📬 Administrative Portal Communications Mailroom Feed Panel">
          <div className="p-2">
            <MessagesPanel variant="light" />
          </div>
        </CollapsibleCard>

        {/* Instructor Assignments & Enrollment Manager (unchanged) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <CollapsibleCard title="📋 Assign Track Specializations for Instructors & Faculty Lead Teams">
            <div className="p-2 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-[11px] text-left">
                <thead className="bg-slate-50 text-green-600 font-bold uppercase">
                  <tr>
                    <th className="p-2">Instructor Name</th>
                    <th className="p-2">Assigned Study Track Department</th>
                    <th className="p-2">Role Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-900 bg-white">
                  {activeInstructorsList.map((u) => (
                    <tr key={u.id}>
                      <td className="p-2 font-bold text-gray-900">{u.full_name}</td>
                      <td className="p-2">
                        <select
                          value={u.specialization_track ?? ""}
                          onChange={(e) => handleSetSpecialization(u.id, e.target.value)}
                          className="border text-gray-900 text-[10px] p-1 rounded bg-white outline-none"
                        >
                          <option value="">— Unassigned Pool —</option>
                          {SPECIALIZATION_TRACKS.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-3">
                        <span className="text-indigo-800 font-extrabold tracking-wide uppercase">
                          Academy Staff
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleCard>

          <CollapsibleCard title="🎓 Manage Manual Student Course Assignments">
            <div className="p-2 space-y-4">
              <form
                onSubmit={handleEnrollStudent}
                className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end"
              >
                <select
                  value={enrollCourseId}
                  onChange={(e) => setEnrollCourseId(e.target.value)}
                  className="border p-1.5 text-xs rounded bg-white text-gray-900 outline-none"
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <select
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  className="border p-1.5 text-xs rounded bg-white text-gray-900 outline-none"
                >
                  <option value="">-- Choose Student --</option>
                  {registeredStudentsList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={isEnrolling}
                  className="bg-[#0A192F] text-white font-bold text-xs p-1.5 rounded uppercase tracking-wider"
                >
                  {isEnrolling ? "Assigning..." : "Assign Access"}
                </button>
              </form>
              <div className="overflow-x-auto max-h-40 border rounded">
                <table className="min-w-full divide-y divide-gray-200 text-[10px] text-left">
                  <thead className="bg-gray-50 text-green-600 font-bold uppercase">
                    <tr>
                      <th className="p-2">Student</th>
                      <th className="p-2">Target Assigned Course</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-gray-200 text-gray-900 bg-white">
                    {enrollments.map((en) => (
                      <tr key={en.id}>
                        <td className="p-2 font-semibold text-gray-900">
                          {registeredStudentsList.find((p) => p.id === en.student_id)?.full_name ||
                            en.student_id.slice(0, 6)}
                        </td>
                        <td className="p-2 font-medium">
                          {courses.find((c) => c.id === en.course_id)?.title ||
                            en.course_id.slice(0, 6)}
                        </td>
                        <td className="p-2">
                          <button
                            onClick={() => handleUnenroll(en.id)}
                            className="text-red-600 font-bold"
                          >
                            Remove From Course
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>

                </table>
              </div>
            </div>
          </CollapsibleCard>
        </div>

        {/* Audit Log Feed (unchanged) */}
        <div className="bg-slate-900 text-slate-100 rounded-xl p-5 shadow-lg border border-slate-800 font-mono text-xs">
  <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
      <h3 className="font-bold text-slate-300 uppercase tracking-wider text-[11px]">
        System Maintenance Feed & Admin Audit Timeline
      </h3>
    </div>
    <span className="text-[10px] text-slate-500 uppercase tracking-widest">
      Active Activity Logs
    </span>
  </div>

  <div className="space-y-2 max-h-48 overflow-y-auto">
    {isAuditLoading ? (
      <div className="flex items-center justify-center py-6 text-slate-400 text-xs gap-2">
        <div className="w-3 h-3 rounded-full border-2 border-slate-600 border-t-emerald-400 animate-spin"></div>
        Loading audit trail…
      </div>
    ) : (
      auditLogs.map((log) => (
        <div
          key={log.id}
          className="p-2 rounded bg-slate-950/60 border-l-2 border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
        >
          <div>
            <span className="text-slate-500 mr-2">[{log.timestamp}]</span>
            <span className="text-indigo-400 font-bold mr-1">{log.actor}</span>
            <span className="text-slate-300">{log.action}:</span>
            <span className="text-cyan-400 font-semibold ml-1">"{log.target}"</span>
          </div>
          <div>
            <span
              className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                log.severity === "critical"
                  ? "bg-red-950 text-red-400 border border-red-900"
                  : log.severity === "warning"
                  ? "bg-amber-950 text-amber-400 border border-amber-900"
                  : "bg-slate-800 text-slate-400"
              }`}
            >
              {log.severity}
            </span>
          </div>
        </div>
      ))
    )}
    </div>
    </div>
    
    
      {/* ── FIXED MODAL OVERLAY PORTAL SCREEN (unchanged) ── */}
      {selectedProfile && (
        <div
          className="fixed inset-0 w-full h-full bg-black/60 z-[9999] flex justify-end pointer-events-auto"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSelectedProfile(null);
          }}
        >
          <div
            className="bg-white w-full max-w-md h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto pointer-events-auto"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <div>
              <div className="flex items-center justify-between border-b pb-3 mb-6">
                <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">
                  Student Account Summary
                </h3>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedProfile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 font-bold text-2xl p-2 cursor-pointer transition-colors"
                >
                  &times;
                </button>
              </div>

              <div className="flex flex-col items-center text-center bg-slate-50 border p-4 rounded-xl mb-6">
                <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[#0A192F] text-white text-xl font-black flex items-center justify-center uppercase mb-2 border-2 border-white shadow">
                  {selectedProfile.avatar_url ? (
                    <img
                      src={selectedProfile.avatar_url}
                      alt={`${selectedProfile.full_name || "Student"} avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{selectedProfile.full_name?.slice(0, 2) || "ST"}</span>
                  )}
                </div>
                <h4 className="font-bold text-gray-900">
                  {selectedProfile.full_name || "Incomplete Profile Registry Entry"}
                </h4>
                <p className="text-[10px] text-gray-400 font-mono mt-0.5">{selectedProfile.id}</p>
                <span
                  className={`mt-3 px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                    selectedProfile.active
                      ? "bg-emerald-100 text-[#3AAA35]"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {selectedProfile.active ? "Account Is Active" : "Account Is Suspended"}
                </span>
              </div>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Email Address
                  </label>
                  <p className="font-semibold text-gray-800">{selectedProfile.email}</p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Phone Contact Number
                  </label>
                  <p className="font-semibold text-gray-800">
                    {selectedProfile.phone_number || "Not provided yet"}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Specialization Focus Track
                  </label>
                  <p className="font-semibold text-slate-700 italic">
                    {selectedProfile.specialization_track || "General Entry Pool Workflow Pipeline"}
                  </p>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                    Registration Timestamp Entry
                  </label>
                  <p className="font-medium text-gray-500">
                    {selectedProfile.created_at
                      ? new Date(selectedProfile.created_at).toLocaleString()
                      : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => handleToggleSuspension(selectedProfile)}
                className={`w-full py-2 px-4 rounded text-xs font-bold uppercase tracking-wider text-white shadow transition ${
                  selectedProfile.active ? "bg-[#F47920]" : "bg-[#3AAA35]"
                }`}
              >
                {selectedProfile.active ? "Suspend Student Access" : "Activate Student Access"}
              </button>
              <button
                type="button"
                disabled={isActionLoading}
                onClick={() => handlePermanentDeletion(selectedProfile)}
                className="w-full py-2 px-4 bg-red-100 text-red-700 hover:bg-red-200 rounded text-xs font-bold uppercase tracking-wider transition"
              >
                Delete Account Data Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}