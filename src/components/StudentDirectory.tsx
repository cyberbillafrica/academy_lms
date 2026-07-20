import type { ProfileItem } from "../hooks/adminHooks";

interface Props {
  students: ProfileItem[];
  isFetching: boolean;
  onSelectProfile: (profile: ProfileItem) => void;
}

export default function StudentDirectory({ students, isFetching, onSelectProfile }: Props) {
  return (
    <div className="bg-white border rounded-xl shadow-sm p-4">
      <h3 className="font-bold text-sm mb-2">👥 Registered Students</h3>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-700 uppercase font-bold tracking-wider">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Track</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white text-gray-600">
            {isFetching ? (
              <tr><td colSpan={4} className="p-8 text-center text-gray-400">Loading...</td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={4} className="p-8 text-center text-gray-400">No students found</td></tr>
            ) : (
              students.map(student => (
                <tr
                  key={student.id}
                  onClick={() => onSelectProfile(student)}
                  className="hover:bg-slate-50 cursor-pointer transition"
                >
                  <td className="px-4 py-3 font-semibold text-gray-900 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold uppercase">
                      {student.full_name?.slice(0,2) || "ST"}
                    </div>
                    {student.full_name || "Incomplete"}
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500">{student.email}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{student.specialization_track || "None"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] uppercase tracking-wide ${student.active ? "bg-emerald-100 text-[#3AAA35]" : "bg-red-100 text-red-800"}`}>
                      {student.active ? "Active" : "Suspended"}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}