import {useEffect,useState} from "react";
import {Link} from "react-router-dom";

interface TaskCardProps{task:any;}

function getDueStatus(dueDate?:string|null){
if(!dueDate)return{label:"No Deadline",className:"bg-gray-100 text-gray-600"};
const today=new Date();
const due=new Date(dueDate);
today.setHours(0,0,0,0);
due.setHours(0,0,0,0);
const diff=Math.ceil((due.getTime()-today.getTime())/(1000*60*60*24));
if(diff<0)return{label:"Overdue",className:"bg-red-100 text-red-700"};
if(diff===0)return{label:"Due Today",className:"bg-orange-100 text-orange-700"};
if(diff===1)return{label:"Tomorrow",className:"bg-yellow-100 text-yellow-700"};
if(diff<=7)return{label:`${diff} Days Left`,className:"bg-blue-100 text-blue-700"};
return{label:due.toLocaleDateString(),className:"bg-green-100 text-green-700"};
}

export default function TaskCard({task}:TaskCardProps){
const[countdown,setCountdown]=useState("");

useEffect(()=>{
if(!task.due_date)return;
const update=()=>{
const now=Date.now();
const due=new Date(task.due_date).getTime();
const diff=due-now;
if(diff<=0){setCountdown("Expired");return;}
const d=Math.floor(diff/86400000);
const h=Math.floor((diff%86400000)/3600000);
const m=Math.floor((diff%3600000)/60000);
setCountdown(`${d}d ${h}h ${m}m`);
};
update();
const timer=setInterval(update,60000);
return()=>clearInterval(timer);
},[task.due_date]);

const due=getDueStatus(task.due_date);
const submission=task.submission;
const isQuiz=task.assessment_type?.toLowerCase()==="quiz";
const isGraded=submission?.grade!==null&&submission?.grade!==undefined;
const isSubmitted=!!submission&&!isGraded;
let progress=0;

if(isGraded){
  progress=100;
}else if(isSubmitted){
  progress=50;
}else if(task.progress_percentage!==undefined&&task.progress_percentage!==null){
  progress=Math.round(task.progress_percentage);
}

const gradeColor=
submission?.grade>=80?"text-green-600":
submission?.grade>=60?"text-yellow-600":
"text-red-600";

return(
<div className="bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-lg transition overflow-hidden">

<div className="h-1 bg-gradient-to-r from-[#3AAA35] via-[#1E3A8A] to-[#F47920]"/>

<div className="p-5">

<div className="flex flex-col lg:flex-row gap-6">

<div className="flex-1">

<div className="flex flex-wrap gap-2 mb-3">

{task.module?.module_order&&(
<span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
Week {task.module.module_order}
</span>
)}

<span className="px-3 py-1 rounded-full bg-[#1B2A6B]/10 text-[#1B2A6B] text-xs font-bold">
{task.module?.title??"General Module"}
</span>

<span className="px-3 py-1 rounded-full bg-[#3AAA35]/10 text-[#3AAA35] text-xs font-bold">
{task.assessment_type}
</span>

<span className={`px-3 py-1 rounded-full text-xs font-bold ${due.className}`}>
{due.label}
</span>

</div>

<h2 className="text-xl font-bold text-gray-900">
{task.title}
</h2>

{task.instructions&&(
<p className="mt-3 text-sm leading-6 text-gray-600 whitespace-pre-wrap">
{task.instructions}
</p>
)}

{submission?.feedback&&(
<div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
<p className="text-xs font-bold uppercase text-amber-700 mb-2">
Instructor Feedback
</p>
<p className="text-sm text-amber-900">
{submission.feedback}
</p>
</div>
)}

<div className="mt-5">
<div className="flex justify-between text-xs text-gray-500 mb-1">
<span>Task Progress</span>
<span>{progress}%</span>
</div>

<div className="h-2 rounded-full bg-gray-200 overflow-hidden">
<div
style={{width:`${progress}%`}}
className="h-full rounded-full bg-gradient-to-r from-[#3AAA35] to-[#1E3A8A]"
></div>
</div>
</div>

</div>

<div className="w-full lg:w-72">

<div className="rounded-2xl bg-gray-50 border border-gray-200 p-5">

<p className="text-xs uppercase tracking-wider font-bold text-gray-400">
Status
</p>

<div className="mt-3">

{isGraded?(
<>
<span className="inline-flex px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-bold">
✅ Graded
</span>

<h3 className={`mt-4 text-4xl font-black ${gradeColor}`}>
{submission.grade}%
</h3>
</>

):isSubmitted?(
<span className="inline-flex px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-bold">
⏳ Awaiting Review
</span>

):(
<span className="inline-flex px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-sm font-bold">
📄 Pending Submission
</span>
)}

</div>

<div className="mt-6">

{isQuiz?(
<Link
to={`/student/assessment/${task.id}/quiz`}
className="block w-full text-center rounded-xl bg-[#1B2A6B] hover:bg-[#16235a] text-white py-3 font-bold transition">
🚀 Launch Quiz
</Link>

):(
<Link
to={`/student/submissions?assessment=${task.id}`}
className={`block w-full text-center rounded-xl py-3 font-bold transition ${
isGraded
?"bg-gray-300 text-gray-600"
:isSubmitted
?"bg-amber-600 hover:bg-amber-700 text-white"
:"bg-[#3AAA35] hover:bg-[#2d8b2a] text-white"
}`}>
{isGraded?"View Submission":isSubmitted?"Update Submission":"Submit Assignment"}
</Link>
)}

</div>

{!isGraded&&task.due_date&&(
<div className="mt-5 rounded-xl bg-blue-50 border border-blue-100 p-3">
<p className="text-xs font-bold uppercase text-blue-700">
Time Remaining
</p>
<p className="mt-1 text-xl font-black text-blue-900">
⏳ {countdown}
</p>
</div>
)}

<div className="mt-5 pt-4 border-t border-gray-200 space-y-2 text-xs">

<div className="flex justify-between">
<span className="text-gray-500">Maximum Score</span>
<strong>{task.max_score}</strong>
</div>

<div className="flex justify-between">
<span className="text-gray-500">Assessment</span>
<strong>{task.assessment_type}</strong>
</div>

{submission?.submitted_at&&(
<div className="flex justify-between">
<span className="text-gray-500">Submitted</span>
<strong>{new Date(submission.submitted_at).toLocaleDateString()}</strong>
</div>
)}

</div>

</div>

</div>

</div>

</div>

</div>
);
}