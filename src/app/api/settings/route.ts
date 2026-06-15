import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { hasSession, unauthorized } from '@/lib/auth';
import { getConfig, setConfig } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const ConfigPatchSchema = z.object({
  minConfidenceForBrief: z.enum(['low', 'medium', 'high']).optional(),
  maxRiskForTitleIdeas: z.coerce.number().min(0).max(10).optional(),
  showEntities: z.boolean().optional(),
  watchTopics: z.array(z.string()).optional(),
  ignoredTopics: z.array(z.string()).optional(),
  verificationRules: z.string().optional(),
});

/**
 * GET /api/settings — app config plus environment *status* (booleans only —
 * secret values never leave the server).
 */
export async function GET(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  return Response.json({
    config: getConfig(),
    env: {
      appPasswordSet: Boolean(process.env.APP_PASSWORD),
      ingestTokenSet: Boolean(process.env.INGEST_TOKEN),
      demoMode: process.env.DEMO_MODE !== 'false',
      llmKeySet: Boolean(
        process.env.OPENAI_API_KEY ||
          process.env.ANTHROPIC_API_KEY ||
          process.env.GEMINI_API_KEY ||
          process.env.OPENROUTER_API_KEY,
      ),
    },
  });
}

export async function PUT(req: NextRequest) {
  if (!hasSession(req)) return unauthorized();
  const body = await req.json().catch(() => null);
  const parsed = ConfigPatchSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'invalid payload' }, { status: 400 });
  }
  return Response.json({ config: setConfig(parsed.data) });
}
