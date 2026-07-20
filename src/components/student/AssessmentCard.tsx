import React from 'react';
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, BookOpen, Award, FileText, ClipboardCheck, FolderKanban, GraduationCap } from "lucide-react";

interface AssessmentCardProps {
  task: any;
  onViewFeedback?: (task: any) => void;
}

const iconMap: Record<string, JSX.Element> = {
  assignment: <FileText className="w-5 h-5 text-blue-600" />,
  quiz: <ClipboardCheck className="w-5 h-5 text-purple-600" />,
  project: <FolderKanban className="w-5 h-5 text-orange-600" />,
  exam: <GraduationCap className="w-5 h-5 text-red-600" />
};

const ribbonMap: Record<string, string> = {
  active: "bg-blue-500",
  submitted: "bg-amber-500",
  graded: "bg-emerald-500"
};

const badgeMap: Record<string, string> = {
  overdue: "bg-red-100 text-red-700",
  today: "bg-orange-100 text-orange-700",
  tomorrow: "bg-yellow-100 text-yellow-700",
  this_week: "bg-blue-100 text-blue-700",
  upcoming: "bg-green-100 text-green-700",
  none: "bg-gray-100 text-gray-600"
};

function renderStars(stars: number) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < stars ? "text-yellow-400 text-lg" : "text-gray-300 text-lg"}>
          ★
        </span>
      ))}
    </div>
  );
}

export default function AssessmentCard({
  task,
  onViewFeedback
}: AssessmentCardProps) {

  const type = (task.assessment_type ?? "Assignment").toLowerCase();

  const icon = iconMap[type] ?? iconMap.assignment;

  const ribbon = ribbonMap[task.status] ?? ribbonMap.active;

  const badge = badgeMap[task.urgency] ?? badgeMap.none;

  const progress =
    task.status === "graded"
      ? 100
      : task.status === "submitted"
      ? 65
      : 20;

  return (
    <div className="group rounded-2xl border border-gray-200 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">

      <div className={`h-2 w-full ${ribbon}`} />

      <div className="p-5 space-y-4">

        <div className="flex items-start justify-between gap-4">

          <div className="flex items-start gap-3 min-w-0">

            <div className="rounded-xl bg-gray-100 p-2 flex-shrink-0">
              {icon}
            </div>

            <div className="min-w-0">

              <h3 className="font-bold text-gray-800 text-base md:text-lg truncate">
                {task.title}
              </h3>

              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-500">

                <BookOpen className="w-4 h-4" />

                <span className="truncate">
                  {task.modules?.title ?? task.module_title ?? "General Module"}
                </span>

              </div>

            </div>

          </div>

          <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${badge}`}>
            {task.dueLabel}
          </span>

        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">

          <div className="flex items-center gap-2 text-gray-600">

            <CalendarDays className="w-4 h-4" />

            <span>
              {task.due_date
                ? new Date(task.due_date).toLocaleDateString()
                : "No Deadline"}
            </span>

          </div>

          <div className="flex items-center gap-2 text-gray-600">

            <Award className="w-4 h-4" />

            <span>{task.max_score} Marks</span>

          </div>

        </div>

        <div>

          <div className="flex justify-between text-xs font-medium text-gray-500 mb-1">

            <span>Progress</span>

            <span>{progress}%</span>

          </div>

          <div className="w-full h-2 rounded-full bg-gray-200 overflow-hidden">

            <div
              className={`h-full transition-all duration-500 ${ribbon}`}
              style={{ width: `${progress}%` }}
            />

          </div>

        </div>

        {task.status === "graded" && (

          <div className="rounded-xl bg-green-50 p-3 space-y-2">

            <div className="flex items-center justify-between">

              {renderStars(task.stars)}

              <span className="font-bold text-green-700 text-lg">
                {task.submission.grade}%
              </span>

            </div>

            {task.submission.feedback && (

              <p className="text-sm text-gray-600 line-clamp-2">
                {task.submission.feedback}
              </p>

            )}

          </div>

        )}

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-100">

          <div className="flex items-center gap-2 flex-wrap">

            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              task.status === "graded"
                ? "bg-emerald-100 text-emerald-700"
                : task.status === "submitted"
                ? "bg-amber-100 text-amber-700"
                : "bg-blue-100 text-blue-700"
            }`}>
              {task.status === "graded"
                ? "Graded"
                : task.status === "submitted"
                ? "Awaiting Review"
                : "Action Required"}
            </span>

            {task.isOverdue && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700 animate-pulse">
                Overdue
              </span>
            )}

            {task.daysRemaining !== null &&
              task.daysRemaining >= 0 &&
              task.daysRemaining <= 1 && (
                <div className="flex items-center gap-1 text-orange-600 text-xs font-semibold">
                  <Clock3 className="w-4 h-4" />
                  <span>Less than 24 Hours Left</span>
                </div>
            )}

          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">

            {task.status === "graded" ? (
              <button
                onClick={() => onViewFeedback?.(task)}
                className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition"
              >
                💬 View Feedback
              </button>
            ) : task.isQuiz ? (
              <Link
                to={task.action.href}
                className="w-full sm:w-auto text-center px-4 py-2 rounded-xl bg-purple-600 text-white font-medium hover:bg-purple-700 transition"
              >
                🚀 Launch Quiz
              </Link>
            ) : task.status === "submitted" ? (
             <Link
                    to={`/student/submissions?assessment=${task.id}`}
                    className="w-full sm:w-auto text-center px-4 py-2 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-700 transition"
                    >
                    👁 View Submission
             </Link>
            ) : (
             <Link
                to={`/student/submissions?assessment=${task.id}`}
                className="w-full sm:w-auto text-center px-4 py-2 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition"
                >
                📤 Submit Assignment
             </Link>
            )}

          </div>

        </div>

      </div>

    </div>

  );

}