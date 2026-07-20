import { create } from "zustand";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  specialization_track?: string | null;
  avatar_url?: string | null;
}

interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isInitialized: boolean;

  initialize: () => Promise<void>;
  fetchProfile: (userId: string) => Promise<void>;
  logout: () => Promise<void>;
  setProfile: (profile: Profile | null) => void; // ✅ ADDED
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  isInitialized: false,

  initialize: async () => {
    if (get().isInitialized) return;
    set({ isInitialized: true });

    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      set({ user: session.user });
      await get().fetchProfile(session.user.id);
    }

    set({ loading: false });

    supabase.auth.onAuthStateChange(async (event, currentSession) => {
      const currentUser = currentSession?.user ?? null;

      if (get().user?.id === currentUser?.id && get().profile !== null) {
        return;
      }

      if (currentUser) {
        set({ user: currentUser, loading: true });
        await get().fetchProfile(currentUser.id);
        set({ loading: false });
      } else {
        set({ user: null, profile: null, loading: false });
      }
    });
  },

  fetchProfile: async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, specialization_track, avatar_url") // ✅ ADD avatar_url
        .eq("id", userId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching profile from database:", error.message);
        set({ profile: null });
        return;
      }

      set({ profile: (data as Profile) ?? null });
    } catch (err) {
      console.error("Unexpected error in fetchProfile:", err);
      set({ profile: null });
    }
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({
      user: null,
      profile: null,
      loading: false,
    });
  },

  // ✅ NEW setter for optimistic UI updates after avatar upload
  setProfile: (profile) => set({ profile }),
}));