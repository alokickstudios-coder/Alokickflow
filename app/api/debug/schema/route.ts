import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET() {
  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server not configured" }, { status: 500 });
  }

  const results: Record<string, any> = {};

  // Check vendors table
  const { data: vendorsData, error: vendorsError } = await supabase
    .from('vendors')
    .select('*')
    .limit(1);

  results.vendors = {
    exists: !vendorsError,
    error: vendorsError?.message,
    sampleRow: vendorsData?.[0] || null,
    columns: vendorsData?.[0] ? Object.keys(vendorsData[0]) : []
  };

  // Check vendor_team_members table
  const { data: teamData, error: teamError } = await supabase
    .from('vendor_team_members')
    .select('*')
    .limit(1);

  results.vendor_team_members = {
    exists: !teamError,
    error: teamError?.message,
    columns: teamData?.[0] ? Object.keys(teamData[0]) : []
  };

  // Check profiles table columns
  const { data: profilesData } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  results.profiles = {
    columns: profilesData?.[0] ? Object.keys(profilesData[0]) : []
  };

  // Check organizations table columns  
  const { data: orgsData } = await supabase
    .from('organizations')
    .select('*')
    .limit(1);

  results.organizations = {
    columns: orgsData?.[0] ? Object.keys(orgsData[0]) : []
  };

  // Check drive_assignments table
  const { data: assignData, error: assignError } = await supabase
    .from('drive_assignments')
    .select('*')
    .limit(1);

  results.drive_assignments = {
    exists: !assignError,
    error: assignError?.message,
    columns: assignData?.[0] ? Object.keys(assignData[0]) : []
  };

  // Check projects table
  const { data: projectsData, error: projectsError } = await supabase
    .from('projects')
    .select('*')
    .limit(1);

  results.projects = {
    exists: !projectsError,
    error: projectsError?.message,
    columns: projectsData?.[0] ? Object.keys(projectsData[0]) : []
  };

  // Check deliveries table
  const { data: deliveriesData, error: deliveriesError } = await supabase
    .from('deliveries')
    .select('*')
    .limit(1);

  results.deliveries = {
    exists: !deliveriesError,
    error: deliveriesError?.message,
    columns: deliveriesData?.[0] ? Object.keys(deliveriesData[0]) : []
  };

  return NextResponse.json(results);
}

