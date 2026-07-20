import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

export interface ResumeLearningData{
courseId:string;
courseTitle:string;
moduleId:string;
moduleTitle:string;
moduleOrder:number;
lessonId:string;
lessonTitle:string;
lessonOrder:number;
progress:number;
estimatedMinutes:number;
resumeUrl:string;
isCompleted:boolean;
}

export function useResumeLearning(studentId:string|undefined){
return useQuery<ResumeLearningData|null>({
queryKey:["resume-learning",studentId],
enabled:!!studentId,
queryFn:async()=>{
if(!studentId)return null;

const {data:courses,error:courseErr}=await supabase
.from("student_course_assignments")
.select(`
course_id,
courses(title)
`)
.eq("student_id",studentId)
.limit(1);

if(courseErr)throw courseErr;
if(!courses?.length)return null;

const courseId=courses[0].course_id;
const courseTitle=(courses[0] as any).courses?.title??"Course";

const {data:modules,error:moduleErr}=await supabase
.from("modules")
.select("id,title,module_order")
.eq("course_id",courseId)
.order("module_order");

if(moduleErr)throw moduleErr;
if(!modules?.length)return null;

const moduleIds=modules.map(m=>m.id);

const {data:moduleProgress}=await supabase
.from("module_progress")
.select("module_id,completed")
.eq("student_id",studentId)
.in("module_id",moduleIds);

const completed=new Set(
(moduleProgress??[])
.filter(m=>m.completed)
.map(m=>m.module_id)
);

const currentModule=
modules.find(m=>!completed.has(m.id))||
modules[modules.length-1];

const {data:lessons,error:lessonErr}=await supabase
.from("lessons")
.select("id,title,lesson_order,content")
.eq("module_id",currentModule.id)
.order("lesson_order");

if(lessonErr)throw lessonErr;
if(!lessons?.length){
return{
courseId,
courseTitle,
moduleId:currentModule.id,
moduleTitle:currentModule.title,
moduleOrder:currentModule.module_order,
lessonId:"",
lessonTitle:"",
lessonOrder:0,
progress:100,
estimatedMinutes:0,
resumeUrl:`/modules/${currentModule.id}`,
isCompleted:true
};
}

const lessonIds=lessons.map(l=>l.id);

const {data:lessonProgress}=await supabase
.from("lesson_progress")
.select("lesson_id,passed")
.eq("student_id",studentId)
.in("lesson_id",lessonIds);

const passed=new Set(
(lessonProgress??[])
.filter(l=>l.passed)
.map(l=>l.lesson_id)
);

const nextLesson=
lessons.find(l=>!passed.has(l.id))||
lessons[lessons.length-1];

const progress=Math.round(
(passed.size/lessons.length)*100
);

const words=(nextLesson.content??"").replace(/<[^>]+>/g,"").split(/\s+/).filter(Boolean).length;

let estimatedMinutes=Math.ceil(words/220);

if(estimatedMinutes<3)estimatedMinutes=3;

return{
courseId,
courseTitle,
moduleId:currentModule.id,
moduleTitle:currentModule.title,
moduleOrder:currentModule.module_order,
lessonId:nextLesson.id,
lessonTitle:nextLesson.title,
lessonOrder:nextLesson.lesson_order,
progress,
estimatedMinutes,
resumeUrl:`/modules/${currentModule.id}/lessons/${nextLesson.id}`,
isCompleted:passed.size===lessons.length
};
}
});
}