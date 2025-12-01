/**
 * Database types for AlokickFlow
 * Generated from Supabase schema
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type SubscriptionTier = "free" | "pro" | "enterprise";
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
export type DeliveryStatus =
  | "uploading"
  | "processing"
  | "qc_passed"
  | "qc_failed"
  | "rejected";

export interface Organization {
  id: string;
  name: string;
  subscription_tier: SubscriptionTier;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  organization_id: string;
  role: UserRole;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  naming_convention_regex: string;
  created_at: string;
  updated_at: string;
}

export interface QCError {
  type: string;
  message: string;
  timestamp: number; // in seconds
  severity: "error" | "warning";
}

export interface QCReport {
  status: "passed" | "failed";
  format?: {
    container: string;
    videoCodec?: string;
    audioCodec?: string;
    resolution?: string;
    frameRate?: number;
  };
  duration?: {
    expected: number;
    actual: number;
    difference: number;
  };
  loudness?: {
    value: number; // in LUFS
    target: number; // in LUFS (typically -23)
    status: "passed" | "failed";
  };
  errors: QCError[];
  warnings: QCError[];
  analyzedAt: string;
}

export interface Delivery {
  id: string;
  organization_id: string;
  project_id: string;
  vendor_id: string;
  file_name: string;
  original_file_name: string;
  status: DeliveryStatus;
  storage_path: string;
  file_size: number | null;
  file_type: string | null;
  duration_seconds: number | null;
  qc_report: QCReport | null;
  qc_errors: QCError[];
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  organization_id: string;
  action: string;
  actor_id: string;
  metadata: Json;
  timestamp: string;
}

