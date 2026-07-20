import { supabase } from "./supabaseClient";

export async function validateEnrollmentCode(code: string) {
  try {
    console.log("[enrollment] Starting validation for code:", code);

    const queryBuilder = supabase
      .from("enrollment_codes")
      .select("*")
      .eq("code", code)
      .eq("used", false);

    console.log("[enrollment] Query builder created, about to execute...");

    const { data, error } = await queryBuilder.maybeSingle();

    console.log("[enrollment] Query completed. Error:", error, "Data:", data);

    return { data, error };
  } catch (err: any) {
    console.error("[enrollment] Supabase network request failed completely:", err);
    return { data: null, error: err };
  }
}