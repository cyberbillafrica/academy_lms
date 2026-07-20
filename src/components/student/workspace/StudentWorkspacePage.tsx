import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../../store/authStore";
import { useStudentWorkspace } from "../../../hooks/useStudentWorkspace";
import SubmissionsSummaryCard from "../../SubmissionsSummaryCard";
import ContinueLearningCard from "./ContinueLearningCard";
import TaskCard from "./TaskCard";



export default function StudentWorkspacePage() {
  const navigate = useNavigate();
  const profile = useAuthStore((state) => state.profile);
  const { workspace, loading } = useStudentWorkspace(profile?.id);
  const [activeTab, setActiveTab] = useState("Overview");

  // Helper to determine health status
  const getHealthStatus = (stats: any) => {
    if (!stats) return { emoji: "⏳", label: "Loading", description: "" };
    const { completion, averageGrade, overdue = 0 } = stats;

    if (completion >= 90 && averageGrade >= 85) {
      return {
        emoji: "🟢",
        label: "Excellent",
        description: "🌟 Outstanding performance – keep it up!",
      };
    }
    if (completion >= 70 && averageGrade >= 70 && overdue === 0) {
      return {
        emoji: "🔵",
        label: "On Track",
        description: "✅ Good progress, no overdue tasks.",
      };
    }
    if (completion >= 50 && averageGrade >= 50) {
      return {
        emoji: "🟡",
        label: "Needs Attention",
        description: "⚠️ Some tasks need attention – review your workload.",
      };
    }
    return {
      emoji: "🔴",
      label: "At Risk",
      description: "🚨 Multiple overdue tasks or low completion – seek support.",
    };
  };

  const health = loading
    ? { emoji: "⏳", label: "--", description: "Loading..." }
    : getHealthStatus(workspace?.stats);

  return (
    <div className="min-h-screen bg-gray-50 font-[DM_Sans]">
      {/* Header */}
      <header className="bg-gradient-to-r from-[#1B2A6B] via-[#1E3A8A] to-[#2563EB] shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-[Syne] font-bold text-white">
              Learning Workspace
            </h1>
            <p className="text-orange-400 mt-2 text-sm max-w-xl">
              Manage assignments, launch quizzes, monitor grades,
              receive instructor feedback and track your learning journey
              from one central workspace.
            </p>
          </div>
          <button
            onClick={() => navigate("/dashboard")}
            className="bg-white/10 hover:bg-white/20 text-white border border-white/20 px-5 py-2.5 rounded-xl text-sm font-bold transition"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
          {/* Active Tasks */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-xs uppercase font-bold tracking-wider text-gray-400">
              Active Tasks
            </p>
            <h2 className="text-4xl font-black mt-2 text-[#1B2A6B]">
              {loading ? "--" : workspace?.stats?.active ?? 0}
            </h2>
            <p className="text-xs text-gray-500 mt-2">
              Assignments waiting to be completed
            </p>
          </div>

          {/* Awaiting Review */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-xs uppercase font-bold tracking-wider text-gray-400">
              Awaiting Review
            </p>
            <h2 className="text-4xl font-black mt-2 text-[#F47920]">
              {loading ? "--" : workspace?.stats?.awaitingReview ?? 0}
            </h2>
            <p className="text-xs text-gray-500 mt-2">
              Submitted and pending grading
            </p>
          </div>

          {/* Average Grade */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-xs uppercase font-bold tracking-wider text-gray-400">
              Average Grade
            </p>
            <h2 className="text-4xl font-black mt-2 text-[#3AAA35]">
              {loading ? "--" : `${workspace?.stats?.averageGrade ?? 0}%`}
            </h2>
            <p className="text-xs text-gray-500 mt-2">
              Overall academic performance
            </p>
          </div>

          {/* Learning Health */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <p className="text-xs uppercase font-bold tracking-wider text-gray-400">
              Learning Health
            </p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl">{health.emoji}</span>
              <h2 className="text-2xl font-black text-gray-800">
                {health.label}
              </h2>
            </div>
            <p className="text-xs text-gray-500 mt-2">{health.description}</p>
          </div>
        </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-8">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div className="flex-1">
          <p className="text-xs uppercase font-bold tracking-wider text-gray-400">Learning Progress</p>
          <h2 className="text-3xl font-black text-[#1B2A6B] mt-1">
          {workspace?.stats.learningProgress ?? 0}%
          </h2>
          <p className="text-sm text-gray-500 mt-2">
          {workspace?.stats.completedModules ?? 0} of {workspace?.stats.totalModules ?? 0} modules completed
          </p>
          </div>
          <div className="flex-1">
          <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
          <div
          className="h-full bg-gradient-to-r from-[#3AAA35] to-[#2563EB] transition-all duration-700"
          style={{
          width:`${workspace?.stats.learningProgress ?? 0}%`
          }}
          />
          </div>
          </div>
          </div>
          </div>

          <ContinueLearningCard/>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex border-b overflow-x-auto scrollbar-hide">
              {[
              "Overview",
              "Active Tasks",
              "Submitted",
              "Graded",
              "History",
            ].map((tab) => (
             <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-4 text-sm font-bold transition whitespace-nowrap ${
                  activeTab === tab
                    ? "border-b-2 border-[#3AAA35] text-[#3AAA35]"
                    : "text-gray-500 hover:text-[#1B2A6B]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

            <div className="p-6">
              {(() => {
                let tasks = workspace?.tasks ?? [];

                if (activeTab === "Active Tasks") tasks = workspace?.activeTasks ?? [];
                if (activeTab === "Submitted") tasks = workspace?.submittedTasks ?? [];
                if (activeTab === "Graded") tasks = workspace?.gradedTasks ?? [];

                if (activeTab === "History") {
                  return (
                    <div className="py-2">
                      <SubmissionsSummaryCard />
                    </div>
                  );
                }

                if (tasks.length === 0) {
                  return (
                    <div className="text-center py-20">
                      <div className="text-5xl mb-3">🎉</div>
                      <h3 className="text-xl font-bold text-gray-700">
                        Nothing here yet
                      </h3>
                      <p className="text-gray-500 mt-2">
                        You're all caught up.
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-5">
                    {tasks.map((task: any) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                      />
                    ))}
                  </div>
                );
              })()}
            </div>
        </div>
        <SubmissionsSummaryCard />
        
      </main>
    </div>
  );
}