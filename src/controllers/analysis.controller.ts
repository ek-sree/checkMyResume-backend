import { z } from 'zod';
import { Analysis } from '../models/Analysis';
import { Resume } from '../models/Resume';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { runAgent } from '../agent/loop';
import { analysisTools } from '../agent/tools/index';
import { SYSTEM_PROMPT, buildAnalysisPrompt } from '../agent/prompts';
import { consumeCredit, addUsage } from '../middleware/usage';
import { cacheGet, cacheSet, cacheDel } from '../services/cache';
import { sendAnalysisReadyEmail } from '../services/email';
import { logger } from '../utils/logger';

const listKey = (userId: unknown) => `analyses:${userId}`;

const analyzeSchema = z.object({
  resumeId: z.string().min(1),
  jobTitle: z.string().max(160).optional(),
  company: z.string().max(160).optional(),
  jobDescription: z.string().min(40, 'Job description is too short'),
});


export const runAnalysis = asyncHandler(async (req, res) => {
  const { resumeId, jobTitle, company, jobDescription } = analyzeSchema.parse(req.body);
  const user = req.user!;

  const resume = await Resume.findOne({ _id: resumeId, user: user._id });
  if (!resume) throw ApiError.notFound('Resume not found');

  const analysis = await Analysis.create({
    user: user._id,
    resume: resume._id,
    jobTitle: jobTitle || '',
    company: company || '',
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

  send({ type: 'start', analysisId: analysis._id });

  try {
    const { results, steps, finalText, usage } = await runAgent({
      system: SYSTEM_PROMPT,
      userPrompt: buildAnalysisPrompt({
        resumeText: resume.rawText,
        jobTitle,
        company,
        jobDescription,
      }),
      tools: analysisTools,
      onStep: (step) => send({ type: 'step', step }),
    });

    analysis.matchScore = results.matchScore ?? null;
    analysis.matchedKeywords = results.matchedKeywords ?? [];
    analysis.missingKeywords = results.missingKeywords ?? [];
    analysis.summary = results.summary || finalText || '';
    analysis.tailoredResume = results.tailoredResume ?? '';
    analysis.coverLetter = results.coverLetter ?? '';
    analysis.skillGaps = results.skillGaps ?? [];
    analysis.steps = steps;
    analysis.status = 'complete';
    await analysis.save();

    await consumeCredit(user);
    await addUsage(user, usage);
    await cacheDel(listKey(user._id));
    void sendAnalysisReadyEmail(user.email, user.name, analysis.jobTitle, analysis.matchScore).catch(
      () => undefined
    );

    send({ type: 'done', analysis, credits: user.credits, plan: user.plan });
    res.end();
  } catch (err) {
    logger.error('Analysis run failed:', (err as Error).message);
    analysis.status = 'failed';
    await analysis.save().catch(() => undefined);
    send({ type: 'error', message: 'The AI run failed. Please try again.' });
    res.end();
  }
});

export const listAnalyses = asyncHandler(async (req, res) => {
  const key = listKey(req.user!._id);
  const cached = await cacheGet<unknown[]>(key);
  if (cached) return res.json({ analyses: cached });

  const analyses = await Analysis.find({ user: req.user!._id })
    .sort({ createdAt: -1 })
    .select('jobTitle company matchScore status createdAt');
  await cacheSet(key, analyses, 60);
  res.json({ analyses });
});


export const getAnalysis = asyncHandler(async (req, res) => {
  const analysis = await Analysis.findOne({ _id: req.params.id, user: req.user!._id });
  if (!analysis) throw ApiError.notFound('Analysis not found');
  res.json({ analysis });
});
