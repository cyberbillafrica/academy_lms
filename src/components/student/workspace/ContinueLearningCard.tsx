import {useNavigate} from "react-router-dom";
import {useAuthStore} from "../../../store/authStore";
import {useResumeLearning} from "../../../hooks/useResumeLearning";

export default function ContinueLearningCard(){
const navigate=useNavigate();
const profile=useAuthStore(s=>s.profile);
const{data, isLoading}=useResumeLearning(profile?.id);

if(isLoading){
return(
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse">
<div className="h-5 w-40 bg-gray-200 rounded mb-4"/>
<div className="h-4 w-64 bg-gray-100 rounded mb-2"/>
<div className="h-3 w-32 bg-gray-100 rounded mb-5"/>
<div className="h-2 w-full bg-gray-100 rounded"/>
</div>
);
}

if(!data){
return(
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
<div className="text-5xl mb-3">🎉</div>
<h3 className="font-bold text-xl text-[#1B2A6B] font-[Syne]">
Congratulations!
</h3>
<p className="text-sm text-gray-500 mt-2">
You have completed your current learning path.
</p>
</div>
);
}

return(
<div className="bg-gradient-to-br from-[#1B2A6B] via-[#1E3A8A] to-[#2563EB] rounded-3xl shadow-xl overflow-hidden">

<div className="p-6">

<div className="flex items-center justify-between">

<div>

<p className="uppercase tracking-[0.25em] text-blue-200 text-[10px] font-bold">
Continue Learning
</p>

<h2 className="mt-2 text-2xl font-bold text-white font-[Syne]">
📘 {data.courseTitle}
</h2>

<p className="text-blue-100 mt-2 text-sm">
Week {data.moduleOrder} • {data.moduleTitle}
</p>

<p className="text-white mt-1 font-semibold">
Lesson {data.lessonOrder}: {data.lessonTitle}
</p>

</div>

<div className="hidden md:flex text-6xl">
🚀
</div>

</div>

<div className="mt-6">

<div className="flex justify-between text-xs text-blue-100 mb-2">

<span>Progress</span>

<span>{data.progress}%</span>

</div>

<div className="h-3 rounded-full bg-white/20 overflow-hidden">

<div
className="h-full bg-[#3AAA35] transition-all duration-700"
style={{width:`${data.progress}%`}}
/>

</div>

</div>

<div className="mt-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">

<div className="space-y-1">

<p className="text-blue-100 text-sm">

⏱ Estimated time remaining

</p>

<p className="text-white font-bold">

{data.estimatedMinutes} mins

</p>

</div>

<button
onClick={()=>navigate(data.resumeUrl)}
className="bg-white hover:bg-gray-100 text-[#1B2A6B] px-6 py-3 rounded-xl font-bold transition shadow-lg">
Continue Learning →
</button>

</div>

</div>

</div>
);
}