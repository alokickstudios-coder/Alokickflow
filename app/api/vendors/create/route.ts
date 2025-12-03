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

// Check which table to use and what columns are available
async function getVendorConfig(supabase: any) {
  // Try vendors table first
  const { data: vendorData, error: vendorError } = await supabase
    .from('vendors')
    .select('*')
    .limit(1);
  
  if (!vendorError) {
    // Check available columns by looking at the data structure or trying to select
    const columns = ['id', 'organization_id', 'full_name', 'created_at'];
    
    // Try to detect additional columns
    const { error: emailErr } = await supabase.from('vendors').select('email').limit(1);
    if (!emailErr) columns.push('email');
    
    const { error: phoneErr } = await supabase.from('vendors').select('phone').limit(1);
    if (!phoneErr) columns.push('phone');
    
    const { error: statusErr } = await supabase.from('vendors').select('status').limit(1);
    if (!statusErr) columns.push('status');
    
    const { error: scoreErr } = await supabase.from('vendors').select('trust_score').limit(1);
    if (!scoreErr) columns.push('trust_score');

    return { table: 'vendors', columns };
  }
  
  // Fallback to profiles
  return { table: 'profiles', columns: ['id', 'organization_id', 'full_name', 'role', 'created_at'] };
}

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, organizationId, phone, companyName, specialty, notes } = await request.json();

    if (!organizationId) {
      return NextResponse.json({ error: "Organization ID is required" }, { status: 400 });
    }

    if (!fullName?.trim()) {
      return NextResponse.json({ error: "Vendor name is required" }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const config = await getVendorConfig(supabase);
    console.log("Using vendor config:", config);

    if (config.table === 'vendors') {
      // Build insert object based on available columns
      const insertData: Record<string, any> = {
        organization_id: organizationId,
        full_name: fullName.trim(),
      };

      if (config.columns.includes('email') && email) {
        insertData.email = email.trim();
      }
      if (config.columns.includes('phone') && phone) {
        insertData.phone = phone.trim();
      }
      if (config.columns.includes('status')) {
        insertData.status = 'active';
      }
      if (config.columns.includes('trust_score')) {
        insertData.trust_score = 85;
      }

      const { data: vendor, error } = await supabase
        .from('vendors')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error("Vendor creation error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        vendor: {
          id: vendor.id,
          full_name: vendor.full_name,
          email: vendor.email || null,
          status: vendor.status || 'active',
          trust_score: vendor.trust_score || 85,
        },
        table: 'vendors'
      });
    } else {
      // Profiles table - needs auth user (will likely fail)
      return NextResponse.json({
        error: "Vendors table not properly configured",
        help: "Please run the SQL from supabase/vendors-schema.sql in your Supabase SQL Editor"
      }, { status: 500 });
    }
  } catch (error: any) {
    console.error("Vendor creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const config = await getVendorConfig(supabase);

    if (config.table === 'vendors') {
      const { data: vendors, error } = await supabase
        .from('vendors')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ vendors: vendors || [], table: 'vendors' });
    } else {
      const { data: vendors, error } = await supabase
        .from('profiles')
        .select('id, full_name, created_at')
        .eq('organization_id', organizationId)
        .eq('role', 'vendor')
        .order('created_at', { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ vendors: vendors || [], table: 'profiles' });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get("id");

    if (!vendorId) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const config = await getVendorConfig(supabase);

    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq('id', vendorId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "Vendor ID is required" }, { status: 400 });
    }

    const supabase = getAdminClient();
    if (!supabase) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const config = await getVendorConfig(supabase);

    const { data, error } = await supabase
      .from(config.table)
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, vendor: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
