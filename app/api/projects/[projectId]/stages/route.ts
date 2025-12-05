import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const supabase = createClient();

  const { data: stages, error } = await supabase
    .from('project_stages')
    .select('*')
    .eq('project_id', params.projectId)
    .order('stage_order', { ascending: true });

  if (error) {
    console.error('Error fetching project stages:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(stages);
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  const supabase = createClient();
  const { name, stage_order } = await request.json();

  if (!name || stage_order === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const { data: stage, error } = await supabase
    .from('project_stages')
    .insert([
      {
        project_id: params.projectId,
        name,
        stage_order,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating project stage:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(stage);
}
