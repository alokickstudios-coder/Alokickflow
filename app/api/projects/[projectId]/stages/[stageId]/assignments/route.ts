import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: { stageId: string } }
) {
  const supabase = createClient();
  const { assignee_id } = await request.json();

  if (!assignee_id) {
    return NextResponse.json({ error: 'Missing required field: assignee_id' }, { status: 400 });
  }

  const { data: assignment, error } = await supabase
    .from('project_stage_assignments')
    .insert([
      {
        stage_id: params.stageId,
        assignee_id,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating project stage assignment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(assignment);
}

export async function DELETE(
  request: Request,
  { params }: { params: { stageId: string } }
) {
  const supabase = createClient();
  const { assignee_id } = await request.json();

  if (!assignee_id) {
    return NextResponse.json({ error: 'Missing required field: assignee_id' }, { status: 400 });
  }

  const { error } = await supabase
    .from('project_stage_assignments')
    .delete()
    .eq('stage_id', params.stageId)
    .eq('assignee_id', assignee_id);

  if (error) {
    console.error('Error deleting project stage assignment:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Project stage assignment deleted successfully' });
}
