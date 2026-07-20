import { BrowserRouter, Routes, Route } from "react-router-dom";

import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import DashboardPage from "../pages/DashboardPage";
import ProtectedRoute from "../components/ProtectedRoute";
import CoursesPage from "../pages/CoursesPage";
import ModulesPage from "../pages/ModulesPage";
import AssessmentsPage from "../pages/AssessmentsPage";
import TrackingLedger from "../pages/TrackingLedger";
import GeneralChat from "../components/GeneralChat";
import ModuleListPage from "../pages/ModuleListPage";
import ModuleDetailPage from "../pages/ModuleDetailPage";
import LessonViewerPage from "../pages/LessonViewerPage";
import StudentSubmissionsPage from "../pages/StudentSubmissionsPage";
import QuizEngine from "../pages/QuizEngine"; 
import ManageAssignmentsPage from "../pages/ManageAssignmentsPage";
import SubmissionsPage from "../pages/SubmissionsPage";
import AssessmentSubmissionDashboard from "../components/student/AssessmentSubmissionDashboard";
import StudentWorkspace from "../components/student/workspace/StudentWorkspacePage";


import { useParams } from "react-router-dom";


function QuizEngineRouteWrapper() {
  const { assessmentId } = useParams();

  return (
    <QuizEngine
      assessmentId={assessmentId!}
      title="Quiz"
      type="Quiz"
      maxScore={100}
      onComplete={() => {}}
    />
  );
}


export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Access Entry Gateways */}
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Admin-only: full-cohort attendance/progress ledger */}
        <Route
          path="/admin/tracking"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <TrackingLedger />
            </ProtectedRoute>
          }
        />

        {/* Management Portals: Admin + Instructor Roles */}
        <Route
          path="/assessments"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor"]}>
              <AssessmentsPage />
            </ProtectedRoute>
          }
        />
        
        <Route 
          path="/assessments/manage"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor"]}>
              <ManageAssignmentsPage />
            </ProtectedRoute>
          } 
        />

        <Route 
          path="/submissions"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor"]}>
              <SubmissionsPage />
            </ProtectedRoute>
          } 
        />

        <Route
          path="/modules"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor"]}>
              <ModulesPage />
            </ProtectedRoute>
          }
        />
        
        <Route
          path="/courses"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor"]}>
              <CoursesPage />
            </ProtectedRoute>
          }
        />

        {/* Student Terminal Zones */}
        <Route
          path="/student/submissions"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentSubmissionsPage />
            </ProtectedRoute>
          }
        />

          <Route
          path="/student/workspace"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <StudentWorkspace />
            </ProtectedRoute>
          }
        />

        {/* Clean URL Endpoint pointing to your self-managed submission board */}
        <Route
          path="/student/assignments"
          element={
            <ProtectedRoute allowedRoles={["student"]}>
              <AssessmentSubmissionDashboard />
            </ProtectedRoute>
          }
        />
          
              <Route
              path="/student/assessment/:assessmentId/quiz"
              element={
                <ProtectedRoute allowedRoles={["student"]}>
                  <QuizEngineRouteWrapper />
                </ProtectedRoute>
              }
            />


        {/* Global Communal Areas (Open to all authenticated accounts) */}
        <Route
          path="/chat"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor", "student"]}>
              <GeneralChat />
            </ProtectedRoute>
          }
        />

        {/* 
          🎯 CRITICAL FIX FOR PAGE-REFRESH/KICK BACKS:
          Explicitly added ["admin", "instructor", "student"] array parameters so the Guard 
          allows the student through instead of breaking out to a fallback state.
        */}
        <Route
          path="/courses/:courseId/modules"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor", "student"]}>
              <ModuleListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/modules/:moduleId"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor", "student"]}>
              <ModuleDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/modules/:moduleId/lessons/:lessonId"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor", "student"]}>
              <LessonViewerPage />
            </ProtectedRoute>
          }
        />

        {/* Base Landing Command Core Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute allowedRoles={["admin", "instructor", "student"]}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}