/**
 * Role-based access control utilities
 */

import { createClient } from "@/lib/supabase/server";

export type UserRole = 
  | "super_admin" 
  | "admin" 
  | "manager"
  | "operator"
  | "qc" 
  | "vendor"
  | "translation"
  | "dubbing"
  | "mixing"
  | "subtitling";

export async function getCurrentUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return profile?.role || null;
}

export async function hasPermission(
  requiredRoles: UserRole[]
): Promise<boolean> {
  const role = await getCurrentUserRole();
  if (!role) return false;
  return requiredRoles.includes(role);
}

export async function enforceRole(requiredRoles: UserRole[]) {
  const hasAccess = await hasPermission(requiredRoles);
  if (!hasAccess) {
    throw new Error("Unauthorized: Insufficient permissions");
  }
}

// Client-side version
export async function getCurrentUserRoleClient(): Promise<UserRole | null> {
  // This would need to be implemented with client-side supabase
  // For now, return null and handle on server-side
  return null;
}

