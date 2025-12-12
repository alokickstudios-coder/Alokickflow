/**
 * Premium QC Report Module
 * 
 * Enhanced QC reports with AI insights using DeepSeek.
 * Gracefully falls back if not configured.
 */

import { isDeepseekConfigured, getQCProviderConfig } from '@/config/qcProviders';

export interface PremiumQCReport {
  summary: {
    overallStatus: 'passed' | 'failed' | 'needs_review';
    score: number; // 0-100
    totalIssues: number;
    criticalIssues: number;
  };
  aiInsights: {
    recommendations: string[];
    strengths: string[];
    areasForImprovement: string[];
  };
  detailedAnalysis: Array<{
    category: string;
    status: 'passed' | 'failed' | 'warning';
    details: string;
  }>;
  skipped?: boolean;
  skipReason?: string;
}

/**
 * Generate premium QC report with AI insights
 */
export async function generatePremiumReport(
  episodeId: string,
  basicQCResult: any,
  additionalQCResults: Record<string, any>
): Promise<PremiumQCReport> {
  if (!isDeepseekConfigured()) {
    console.log('[PremiumReport] DeepSeek not configured, generating basic report');
    return generateBasicReport(basicQCResult, additionalQCResults);
  }

  const config = getQCProviderConfig();

  try {
    if (config.llm.provider === 'deepseek') {
      return await generateDeepSeekReport(episodeId, basicQCResult, additionalQCResults);
    }
  } catch (error: any) {
    console.error('[PremiumReport] Error:', error.message);
    // Fall back to basic report on error
    return generateBasicReport(basicQCResult, additionalQCResults);
  }

  return generateBasicReport(basicQCResult, additionalQCResults);
}

/**
 * Generate report using DeepSeek API
 */
async function generateDeepSeekReport(
  episodeId: string,
  basicQCResult: any,
  additionalQCResults: Record<string, any>
): Promise<PremiumQCReport> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const baseUrl = process.env.DEEPSEEK_API_BASE_URL || 'https://api.deepseek.com';

  if (!apiKey) {
    return generateBasicReport(basicQCResult, additionalQCResults);
  }

  try {
    // Prepare QC data summary for LLM
    const qcSummary = {
      audio: {
        missing: basicQCResult?.audioMissing?.detected || false,
        loudness: basicQCResult?.loudness || {},
        silence: basicQCResult?.silence || {},
        missingDialogue: basicQCResult?.missingDialogue || {},
      },
      video: {
        glitches: additionalQCResults?.videoGlitch?.glitches || [],
        quality: basicQCResult?.visualQuality || {},
      },
      bgm: additionalQCResults?.bgm || {},
      lipSync: additionalQCResults?.lipSync || {},
      subtitles: basicQCResult?.subtitleTiming || {},
    };

    // Count issues
    const totalIssues = 
      (basicQCResult?.audioMissing?.detected ? 1 : 0) +
      (basicQCResult?.loudness?.status === 'failed' ? 1 : 0) +
      (basicQCResult?.silence?.segments?.length || 0) +
      (basicQCResult?.missingDialogue?.segments?.length || 0) +
      (basicQCResult?.subtitleTiming?.errors?.length || 0) +
      (additionalQCResults?.videoGlitch?.glitchCount || 0) +
      (additionalQCResults?.bgm?.issues?.length || 0) +
      (additionalQCResults?.lipSync?.detectedIssues?.length || 0);

    const criticalIssues = 
      (basicQCResult?.audioMissing?.detected ? 1 : 0) +
      (basicQCResult?.loudness?.status === 'failed' ? 1 : 0) +
      (additionalQCResults?.videoGlitch?.glitches?.filter((g: any) => g.severity === 'error').length || 0);

    // Calculate overall score
    const score = Math.max(0, Math.min(100, 100 - (totalIssues * 5) - (criticalIssues * 10)));

    // Call DeepSeek API
    const prompt = `You are a professional QC analyst. Analyze the following quality control results for a video episode and provide:

1. Overall status (passed/failed/needs_review)
2. Key strengths
3. Areas for improvement
4. Specific recommendations

QC Results Summary:
${JSON.stringify(qcSummary, null, 2)}

Provide a structured analysis in JSON format with:
- summary: { overallStatus, score, totalIssues, criticalIssues }
- aiInsights: { recommendations: [], strengths: [], areasForImprovement: [] }
- detailedAnalysis: [{ category, status, details }]

Be concise but thorough.`;

    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a professional video quality control analyst. Provide structured, actionable feedback.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API error: ${error}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '{}';

    // Parse JSON response (may be wrapped in markdown code blocks)
    let parsedContent: any;
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || content.match(/(\{[\s\S]*\})/);
      parsedContent = JSON.parse(jsonMatch ? jsonMatch[1] : content);
    } catch (parseError: any) {
      // If parsing fails, log and use basic report
      console.warn("[PremiumReport] AI response parse failed, using basic report:", parseError.message);
      return generateBasicReport(basicQCResult, additionalQCResults);
    }

    // Merge AI insights with calculated summary
    return {
      summary: parsedContent.summary || {
        overallStatus: score >= 70 ? 'passed' : score >= 50 ? 'needs_review' : 'failed',
        score,
        totalIssues,
        criticalIssues,
      },
      aiInsights: parsedContent.aiInsights || {
        recommendations: [],
        strengths: [],
        areasForImprovement: [],
      },
      detailedAnalysis: parsedContent.detailedAnalysis || [],
    };
  } catch (error: any) {
    console.error('[PremiumReport] DeepSeek error:', error.message);
    return generateBasicReport(basicQCResult, additionalQCResults);
  }
}

/**
 * Generate basic report without AI (fallback)
 */
function generateBasicReport(
  basicQCResult: any,
  additionalQCResults: Record<string, any>
): PremiumQCReport {
  const totalIssues = 
    (basicQCResult?.audioMissing?.detected ? 1 : 0) +
    (basicQCResult?.loudness?.status === 'failed' ? 1 : 0) +
    (basicQCResult?.silence?.segments?.length || 0) +
    (basicQCResult?.missingDialogue?.segments?.length || 0) +
    (basicQCResult?.subtitleTiming?.errors?.length || 0) +
    (additionalQCResults?.videoGlitch?.glitchCount || 0) +
    (additionalQCResults?.bgm?.issues?.length || 0);

  const criticalIssues = 
    (basicQCResult?.audioMissing?.detected ? 1 : 0) +
    (basicQCResult?.loudness?.status === 'failed' ? 1 : 0);

  const score = Math.max(0, Math.min(100, 100 - (totalIssues * 5) - (criticalIssues * 10)));

  const recommendations: string[] = [];
  const strengths: string[] = [];
  const improvements: string[] = [];

  if (!basicQCResult?.audioMissing?.detected) {
    strengths.push('Audio track is present');
  } else {
    improvements.push('Audio track is missing - critical issue');
  }

  if (basicQCResult?.loudness?.status === 'passed') {
    strengths.push('Loudness compliance meets EBU R128 standards');
  } else if (basicQCResult?.loudness?.status === 'failed') {
    improvements.push(`Loudness compliance issue: ${basicQCResult.loudness.message}`);
    recommendations.push('Adjust audio levels to meet EBU R128 standards (-23 LUFS ± 1 LU)');
  }

  if (basicQCResult?.visualQuality?.status === 'passed') {
    strengths.push('Video quality meets standards');
  } else {
    improvements.push('Video quality issues detected');
    recommendations.push('Review video resolution, bitrate, and codec settings');
  }

  return {
    summary: {
      overallStatus: score >= 70 ? 'passed' : score >= 50 ? 'needs_review' : 'failed',
      score,
      totalIssues,
      criticalIssues,
    },
    aiInsights: {
      recommendations,
      strengths,
      areasForImprovement: improvements,
    },
    detailedAnalysis: [
      {
        category: 'Audio Quality',
        status: basicQCResult?.audioMissing?.detected ? 'failed' : 'passed',
        details: basicQCResult?.audioMissing?.detected 
          ? 'Audio track is missing' 
          : 'Audio track is present',
      },
      {
        category: 'Loudness Compliance',
        status: basicQCResult?.loudness?.status || 'warning',
        details: basicQCResult?.loudness?.message || 'Loudness analysis completed',
      },
      {
        category: 'Video Quality',
        status: basicQCResult?.visualQuality?.status || 'warning',
        details: basicQCResult?.visualQuality?.issues?.map((i: any) => i.message).join(', ') || 'No issues detected',
      },
    ],
  };
}
