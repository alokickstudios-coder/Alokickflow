import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: { stageId: string } }
) {
  const supabase = createClient();

  const { data: stage, error } = await supabase
    .from('project_stages')
    .select('*')
    .eq('id', params.stageId)
    .single();

  if (error) {
    console.error('Error fetching project stage:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(stage);
}

export async function PUT(
  request: Request,
  { params }: { params: { stageId: string } }
) {
  const supabase = createClient();
  const { name, status, stage_order } = await request.json();

  const updateData: { name?: string; status?: string; stage_order?: number } = {};
  if (name) updateData.name = name;
  if (status) updateData.status = status;
  if (stage_order !== undefined) updateData.stage_order = stage_order;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: stage, error } = await supabase
    .from('project_stages')
    .update(updateData)
    .eq('id', params.stageId)
    .select()
    .single();

  if (error) {
    console.error('Error updating project stage:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(stage);
}

export async function DELETE(
  request: Request,
  { params }: { params: { stageId: string } }
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('project_stages')
    .delete()
    .eq('id', params.stageId);

  if (error) {
    console.error('Error deleting project stage:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ message: 'Project stage deleted successfully' });
}
