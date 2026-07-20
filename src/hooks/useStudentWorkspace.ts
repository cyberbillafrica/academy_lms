import { useMemo } from "react";
import {
  useStudentCourses,
  useAssessments,
  useWorkspaceSubmissions,
  useModuleProgress,
  useAttendance,
} from "./studentData";

export function useStudentWorkspace(studentId: string | undefined) {
  const courses = useStudentCourses(studentId);

  const courseIds = useMemo(
    () => (courses.data ?? []).map((c) => c.course_id),
    [courses.data]
  );

  const assessments = useAssessments(courseIds, studentId);
  const submissions = useWorkspaceSubmissions(studentId);
  const progress = useModuleProgress(studentId);
  const attendance = useAttendance(studentId);

  const workspace = useMemo(() => {
    const submissionMap = new Map(
      (submissions.data ?? []).map((s) => [s.assessment_id, s])
    );

    const tasks = (assessments.data ?? []).map((assessment: any) => {
      const submission = submissionMap.get(assessment.id);

      let status: "active" | "submitted" | "graded" = "active";

      if (submission) {
        status =
          submission.grade === null || submission.grade === undefined
            ? "submitted"
            : "graded";
      }

      return {
        ...assessment,
        submission,
        status,
      };
    });

    const now=new Date();
    const getPriority=(task:any)=>{
      if(task.status==="graded") return 999;
      if(!task.due_date) return 500;

      const due=new Date(task.due_date);
      due.setHours(23,59,59,999);

      const diff=Math.ceil((due.getTime()-now.getTime())/(1000*60*60*24));

      if(diff<0) return 1;      // Overdue
      if(diff===0) return 2;    // Due today
      if(diff<=7) return 3;     // Due this week
      if(diff<=30) return 4;    // Due this month
      return 5;                 // Future
    };

    tasks.sort((a,b)=>{
      const priority=getPriority(a)-getPriority(b);
      if(priority!==0) return priority;

      if(!a.due_date&&!b.due_date) return 0;
      if(!a.due_date) return 1;
      if(!b.due_date) return -1;

      return new Date(a.due_date).getTime()-new Date(b.due_date).getTime();
    });
    const activeTasks=tasks.filter(t=>t.status==="active");
    const submittedTasks=tasks.filter(t=>t.status==="submitted");
    const gradedTasks=tasks.filter(t=>t.status==="graded");
    
    // ---- NEW: overdue calculation ----
    const overdueTasks = activeTasks.filter(
      (t) => t.due_date && new Date(t.due_date) < now
    );
    // ----------------------------------

    const grades = gradedTasks
      .map((t) => t.submission?.grade)
      .filter((g): g is number => g !== null && g !== undefined);

    const averageGrade = grades.length
      ? Math.round(
          grades.reduce((sum, grade) => sum + grade, 0) / grades.length
        )
      : 0;

    const completion =
      tasks.length === 0
        ? 0
        : Math.round((gradedTasks.length / tasks.length) * 100);

        const moduleProgress=progress.data??[];

          const learningProgress=moduleProgress.length?Math.round(
          moduleProgress.reduce(
          (sum:any,m:any)=>sum+(m.progress_percentage??0),0
          )/moduleProgress.length) :0;
          const completedModules=moduleProgress.filter(
          (m:any)=>m.completed
          ).length;
   
        return {
      tasks,
      activeTasks,
      submittedTasks,
      gradedTasks,
      stats: {
        learningProgress,
        completedModules,
        totalModules:moduleProgress.length,
        total: tasks.length,
        active: activeTasks.length,
        awaitingReview: submittedTasks.length,
        graded: gradedTasks.length,
        averageGrade,
        completion,
        overdue: overdueTasks.length, // new
      },
    };
  }, [assessments.data, submissions.data]);

  return {
    workspace,
    attendance,
    progress,
    loading:
      courses.isLoading ||
      assessments.isLoading ||
      submissions.isLoading ||
      progress.isLoading ||
      attendance.isLoading,
  };
}