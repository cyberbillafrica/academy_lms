import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAuthStore } from "../store/authStore";

interface Props {
  className?: string;
}

export default function AvatarUploader({ className }: Props) {
  const profile = useAuthStore((s) => s.profile);
  const setProfile = useAuthStore((s) => s.setProfile); // you need to add this setter to authStore
  const [isUploading, setIsUploading] = useState(false);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile?.id) return;

    if (!file.type.startsWith("image/")) {
      alert("Please select a valid image file.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("Image size must be less than 2MB.");
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const filePath = `${profile.id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update profile only if needed
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      // Update local state
      setProfile({ ...profile, avatar_url: publicUrl });
    } catch (err: any) {
      alert(err.message || "Failed to upload photo.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={className}>
      <input
        type="file"
        id="avatar-upload-input"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarChange}
        disabled={isUploading}
      />
      <label
        htmlFor="avatar-upload-input"
        className={`relative block h-20 w-20 sm:h-24 sm:w-24 rounded-2xl shadow-xl ring-2 ring-[#3AAA35]/40 overflow-hidden bg-slate-800 border border-white/10 cursor-pointer transition-transform active:scale-95 ${
          isUploading ? "opacity-50 pointer-events-none" : ""
        }`}
        title="Update passport photograph"
      >
        {profile?.avatar_url ? (
          <img src={profile.avatar_url} alt="Student" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-white text-3xl sm:text-4xl font-black font-[Syne]">
              {(profile?.full_name ?? "U")[0].toUpperCase()}
            </span>
          </div>
        )}
        {!isUploading && (
          <div className="absolute bottom-1 right-1 h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-[#F47920] border-2 border-white flex items-center justify-center shadow-md transition-transform hover:scale-110">
            <span className="text-sm sm:text-base">📷</span>
          </div>
        )}
        {isUploading && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </label>
    </div>
  );
}