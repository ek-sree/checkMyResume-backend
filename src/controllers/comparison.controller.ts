import { z } from 'zod';
import { Comparison } from '../models/Comparison';
import { Resume } from '../models/Resume';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { runAgent } from '../agent/loop';
import { compareTools } from '../agent/tools/index';
import { SYSTEM_PROMPT, buildComparePrompt } from '../agent/prompts';
import { consumeCredit, addUsage } from '../middleware/usage';
import { cacheGet, cacheSet, cacheDel } from '../services/cache';
import { logger } from '../utils/logger';

const listKey = (userId: unknown) => `comparisons:${userId}`;

const compareSchema = z.object({
  resumeIds: z.array(z.string()).min(2).max(5),
  jobTitle: z.string().max(160).optional(),
  jobDescription: z.string().min(40, 'Job description is too short'),
});


export const runComparison = asyncHandler(async (req, res) => {
  const { resumeIds, jobTitle, jobDescription } = compareSchema.parse(req.body);
  const user = req.user!;

  const uniqueIds = [...new Set(resumeIds)];
  if (uniqueIds.length < 2) throw ApiError.badRequest('Select at least 2 different resumes.');

  const resumes = await Resume.find({ _id: { $in: uniqueIds }, user: user._id });
  if (resumes.length !== uniqueIds.length) throw ApiError.notFound('One or more resumes not found');

  // Preserve the user's selection order for stable 1-based indexing.
  const ordered = uniqueIds
    .map((id) => resumes.find((r) => String(r._id) === id))
    .filter((r): r is (typeof resumes)[number] => Boolean(r));

  const comparison = await Comparison.create({
    user: user._id,
    jobTitle: jobTitle || '',
    jobDescription,
    status: 'pending',
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  send({ type: 'start', comparisonId: comparison._id });

  try {
    const { results, steps, usage } = await runAgent({
      system: SYSTEM_PROMPT,
      userPrompt: buildComparePrompt({
        jobTitle,
        jobDescription,
        resumes: ordered.map((r) => ({ label: r.label, text: r.rawText })),
      }),
      tools: compareTools,
      onStep: (step) => send({ type: 'step', step }),
      maxSteps: 4,
      maxTokens: 4000,
    });

    const comp = results.comparison;
    if (comp) {
      comparison.rankings = comp.rankings
        .filter((r) => r.resumeIndex >= 1 && r.resumeIndex <= ordered.length)
        .map((r) => {
          const resume = ordered[r.resumeIndex - 1]!;
          return {
            resume: resume._id,
            label: resume.label,
            fitScore: r.fitScore,
            strengths: r.strengths,
            weaknesses: r.weaknesses,
          };
        });
      const best = comp.bestResumeIndex >= 1 && comp.bestResumeIndex <= ordered.length
        ? ordered[comp.bestResumeIndex - 1]!
        : null;
      comparison.bestResume = best ? best._id : null;
      comparison.bestLabel = best ? best.label : '';
      comparison.rationale = comp.rationale;
    }
    comparison.steps = steps;
    comparison.status = 'complete';
    await comparison.save();

    await consumeCredit(user);
    await addUsage(user, usage);
    await cacheDel(listKey(user._id));
    send({ type: 'done', comparison, credits: user.credits, plan: user.plan });
    res.end();
  } catch (err) {
    logger.error('Comparison failed:', (err as Error).message);
    comparison.status = 'failed';
    await comparison.save().catch(() => undefined);
    send({ type: 'error', message: 'The comparison failed. Please try again.' });
    res.end();
  }
});


export const listComparisons = asyncHandler(async (req, res) => {
  const key = listKey(req.user!._id);
  const cached = await cacheGet<unknown[]>(key);
  if (cached) return res.json({ comparisons: cached });

  const comparisons = await Comparison.find({ user: req.user!._id })
    .sort({ createdAt: -1 })
    .select('jobTitle bestLabel status createdAt rankings');
  const summaries = comparisons.map((c) => ({
    id: c._id,
    jobTitle: c.jobTitle,
    bestLabel: c.bestLabel,
    resumeCount: c.rankings.length,
    status: c.status,
    createdAt: c.createdAt,
  }));
  await cacheSet(key, summaries, 60);
  res.json({ comparisons: summaries });
});


export const getComparison = asyncHandler(async (req, res) => {
  const comparison = await Comparison.findOne({ _id: req.params.id, user: req.user!._id });
  if (!comparison) throw ApiError.notFound('Comparison not found');
  res.json({ comparison });
});
