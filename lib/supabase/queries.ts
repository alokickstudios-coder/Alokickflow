import { createClient } from './server';
import type { Project, Profile } from '@/types/database';

/**
 * Get the current user's organization_id
 */
export async function getCurrentUserOrganizationId(): Promise<string | null> {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  return profile?.organization_id || null;
}

/**
 * Fetch all projects for the current user's organization
 */
export async function getProjects(): Promise<Project[]> {
  const supabase = await createClient();
  const organizationId = await getCurrentUserOrganizationId();
  
  if (!organizationId) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching projects:', error);
    return [];
  }

  return data || [];
}

/**
 * Create a new project
 */
export async function createProject(
  code: string,
  name: string,
  namingConventionRegex: string = '^([A-Z0-9_]+)[-_]?EP[_-]?(\\d{1,4})[_-]?([A-Za-z]+)[_-]?(.+)$'
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const organizationId = await getCurrentUserOrganizationId();
  
  if (!organizationId) {
    return { success: false, error: 'No organization found' };
  }

  const { error } = await supabase
    .from('projects')
    .insert({
      organization_id: organizationId,
      code: code.toUpperCase(),
      name,
      naming_convention_regex: namingConventionRegex,
    });

  if (error) {
    console.error('Error creating project:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Fetch all vendors (profiles with role 'vendor') for the current organization
 */
export async function getVendors(): Promise<Profile[]> {
  const supabase = await createClient();
  const organizationId = await getCurrentUserOrganizationId();
  
  if (!organizationId) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('role', 'vendor')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching vendors:', error);
    return [];
  }

  return data || [];
}

