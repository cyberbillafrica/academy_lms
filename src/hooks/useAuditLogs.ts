import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabaseClient";

export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;        // Always a formatted time for display
  created_at: string;
}

/**
 * Fetch logs via secure RPC function (bypasses RLS).
 * Keep the timestamp formatting as a derived field.
 */
async function fetchAuditLogs(): Promise<AuditLog[]> {
  const { data, error } = await supabase.rpc("get_audit_logs");
  if (error) throw error;

  return (data ?? []).map((log: any) => ({
    ...log,
    timestamp: log.created_at
      ? new Date(log.created_at).toLocaleTimeString()
      : new Date().toLocaleTimeString(),
  }));
}

/**
 * Insert a new log via the SECURITY DEFINER RPC function.
 */
async function addAuditLog(log: {
  actor: string;
  action: string;
  target: string;
  severity: "info" | "warning" | "critical";
}) {
  const { data, error } = await supabase.rpc("add_audit_log", {
    _actor: log.actor,
    _action: log.action,
    _target: log.target,
    _severity: log.severity,
  });
  if (error) throw error;
  return data;
}

/**
 * Hook that provides a real‑time, persistent audit trail.
 */
export function useAuditLogs() {
  const queryClient = useQueryClient();

  // Fetch logs with polling (live dashboard feel)
  const { data: logs = [], isLoading } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs"],
    queryFn: fetchAuditLogs,
    refetchInterval: 5000, // optional polling, remove if you don't want auto-refresh
  });

  // Mutation to insert a new log entry
  const mutation = useMutation({
    mutationFn: addAuditLog,
    onSuccess: () => {
      // Immediately refetch after a successful insert
      queryClient.invalidateQueries({ queryKey: ["audit-logs"] });
    },
  });

  /**
   * Public helper used by the dashboard to push a new audit entry.
   * The dashboard calls `pushAuditLog(action, target, severity)` – everything works as before.
   */
  const pushAuditLog = (
    action: string,
    target: string,
    severity: "info" | "warning" | "critical" = "info",
    actor: string = "Admin"
  ) => {
    mutation.mutate({ actor, action, target, severity });
  };

  return { logs, isLoading, pushAuditLog };
}