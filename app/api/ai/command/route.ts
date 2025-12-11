/**
 * AI Command Processing API
 * 
 * Processes natural language commands and returns intelligent responses.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";
import {
  parseNaturalLanguageCommand,
  predictQualityIssues,
  optimizeWorkflow,
  analyzeQualityPatterns,
  estimateCompletionTime,
  PLATFORM_SPECS,
  AUTO_FIX_SOLUTIONS,
} from "@/lib/ai/intelligence-engine";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) return null;
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = getAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    // Get user's organization
    const { data: profile } = await adminClient
      .from("profiles")
      .select("organization_id")
      .eq("id", user.id)
      .single();

    if (!profile?.organization_id) {
      return NextResponse.json({ error: "No organization found" }, { status: 400 });
    }

    const body = await request.json();
    const { command, parsed } = body;

    // Process based on intent
    let result: any = {
      success: true,
      message: "Command processed",
      data: null,
      actions: [],
    };

    const intent = parsed?.intent || "unknown";

    switch (intent) {
      case "query": {
        // Handle data queries
        const entities = parsed.entities || {};
        
        if (entities.status === "failed" || command.toLowerCase().includes("failed")) {
          const { data: jobs } = await adminClient
            .from("qc_jobs")
            .select("*, project:projects(id, code, name)")
            .eq("organisation_id", profile.organization_id)
            .or("status.eq.failed,result->status.eq.failed")
            .order("created_at", { ascending: false })
            .limit(50);

          result.message = `Found ${jobs?.length || 0} failed QC jobs`;
          result.data = {
            type: "qc_jobs",
            items: jobs || [],
            count: jobs?.length || 0,
          };
        } else if (entities.scope === "vendor" || command.toLowerCase().includes("vendor")) {
          const { data: vendors } = await adminClient
            .from("profiles")
            .select("*")
            .eq("organization_id", profile.organization_id)
            .eq("role", "vendor");

          result.message = `Found ${vendors?.length || 0} vendors`;
          result.data = {
            type: "vendors",
            items: vendors || [],
            count: vendors?.length || 0,
          };
        } else if (entities.scope === "project" || command.toLowerCase().includes("project")) {
          const { data: projects } = await adminClient
            .from("projects")
            .select("*")
            .eq("organization_id", profile.organization_id);

          result.message = `Found ${projects?.length || 0} projects`;
          result.data = {
            type: "projects",
            items: projects || [],
            count: projects?.length || 0,
          };
        }
        break;
      }

      case "analyze": {
        // Run compliance analysis
        const platform = parsed.entities?.platform || "netflix";
        const specs = PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS];

        if (specs) {
          // Get recent QC jobs for analysis
          const { data: jobs } = await adminClient
            .from("qc_jobs")
            .select("*, project:projects(id, code, name)")
            .eq("organisation_id", profile.organization_id)
            .eq("status", "completed")
            .order("created_at", { ascending: false })
            .limit(100);

          // Analyze compliance
          const complianceResults = (jobs || []).map((job: any) => {
            const result = job.result || job.result_json || {};
            const issues: any[] = [];

            // Check audio loudness
            const lufs = result.basicQC?.loudness?.lufs;
            if (lufs !== undefined && lufs !== null) {
              const target = specs.audio.loudness.target;
              const tolerance = specs.audio.loudness.tolerance;
              if (Math.abs(lufs - target) > tolerance) {
                issues.push({
                  type: "audio_loudness",
                  severity: Math.abs(lufs - target) > tolerance * 2 ? "critical" : "major",
                  message: `Audio loudness ${lufs.toFixed(1)} LUFS exceeds ${platform} target of ${target} LUFS`,
                  autoFixable: true,
                });
              }
            }

            return {
              file: job.file_name,
              project: job.project?.code,
              passed: issues.length === 0,
              issues,
            };
          });

          const passed = complianceResults.filter((r: any) => r.passed).length;
          const failed = complianceResults.filter((r: any) => !r.passed).length;

          result.message = `${platform.toUpperCase()} Compliance Analysis Complete`;
          result.data = {
            type: "compliance",
            platform,
            platformName: specs.name,
            totalAnalyzed: jobs?.length || 0,
            passed,
            failed,
            results: complianceResults.filter((r: any) => !r.passed).slice(0, 10),
            specs: specs,
          };
        }
        break;
      }

      case "predict": {
        // Run prediction analysis
        const { data: qcJobs } = await adminClient
          .from("qc_jobs")
          .select("*, project:projects(id, code, name)")
          .eq("organisation_id", profile.organization_id)
          .order("created_at", { ascending: false })
          .limit(200);

        // Analyze patterns
        const patterns = analyzeQualityPatterns(qcJobs || []);

        // Get active projects for prediction
        const { data: projects } = await adminClient
          .from("projects")
          .select("*")
          .eq("organization_id", profile.organization_id)
          .or("status.is.null,status.eq.active")
          .limit(10);

        const predictions = (projects || []).map((project: any) => {
          const projectJobs = (qcJobs || []).filter((j: any) => j.project_id === project.id);
          const previousIssues = projectJobs.filter((j: any) => 
            j.status === "failed" || j.result?.status === "failed"
          ).length;

          return {
            project: project.code,
            projectName: project.name,
            prediction: predictQualityIssues({
              vendorScore: 80, // Default
              projectComplexity: 6,
              deadlinePressure: 5,
              previousIssuesCount: previousIssues,
              contentType: "series",
              languagePair: "en-hi",
            }),
          };
        });

        result.message = "Quality Predictions Generated";
        result.data = {
          type: "predictions",
          patterns,
          predictions,
        };
        break;
      }

      case "fix": {
        // Get auto-fixable issues
        const { data: jobs } = await adminClient
          .from("qc_jobs")
          .select("*, project:projects(id, code, name)")
          .eq("organisation_id", profile.organization_id)
          .or("status.eq.failed,result->status.eq.failed")
          .order("created_at", { ascending: false })
          .limit(50);

        const autoFixableIssues: any[] = [];

        (jobs || []).forEach((job: any) => {
          const jobResult = job.result || job.result_json || {};
          const errors = jobResult.errors || [];

          errors.forEach((error: any) => {
            const errorType = error.type?.toLowerCase() || "";
            
            // Check if this error type has an auto-fix
            for (const [key, solution] of Object.entries(AUTO_FIX_SOLUTIONS)) {
              if (errorType.includes(key.replace(/_/g, " ")) || key.includes(errorType)) {
                if (solution.autoFixable) {
                  autoFixableIssues.push({
                    jobId: job.id,
                    file: job.file_name,
                    project: job.project?.code,
                    issue: solution.issue,
                    fix: solution.fixDescription,
                    estimatedTime: "estimatedTime" in solution ? solution.estimatedTime : "Unknown",
                  });
                }
              }
            }
          });
        });

        result.message = `Found ${autoFixableIssues.length} auto-fixable issues`;
        result.data = {
          type: "auto_fixes",
          issues: autoFixableIssues,
          totalIssues: autoFixableIssues.length,
        };
        result.actions = [
          { label: "Fix All", action: "fix_all" },
          { label: "Fix Critical Only", action: "fix_critical" },
        ];
        break;
      }

      case "compare": {
        result.message = "Visual comparison ready";
        result.data = {
          type: "comparison",
          available: true,
        };
        result.actions = [
          { label: "Open Diff Viewer", action: "open_diff_viewer" },
        ];
        break;
      }

      case "export": {
        const { data: projects } = await adminClient
          .from("projects")
          .select("id, code, name")
          .eq("organization_id", profile.organization_id)
          .limit(10);

        result.message = "Export options ready";
        result.data = {
          type: "export",
          projects: projects || [],
          formats: ["CSV", "Excel", "Google Sheets", "PDF Report"],
        };
        result.actions = [
          { label: "Export All", action: "export_all" },
          { label: "Choose Project", action: "choose_project" },
        ];
        break;
      }

      default: {
        result.message = parsed.suggestedResponse || "I understand. How can I help you with that?";
        result.data = {
          type: "general",
          parsed,
        };
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("AI Command error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
