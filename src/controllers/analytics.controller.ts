import { asyncHandler } from '../utils/asyncHandler';
import { Analysis } from '../models/Analysis';
import { InterviewSession } from '../models/InterviewSession';
import { Resume } from '../models/Resume';
import { Comparison } from '../models/Comparison';
import { cacheGet, cacheSet } from '../services/cache';


export const getAnalytics = asyncHandler(async (req, res) => {
  const userId = req.user!._id;
  const key = `analytics:${userId}`;
  const cached = await cacheGet<unknown>(key);
  if (cached) return res.json(cached);

  const [analyses, interviews, resumeCount, comparisonCount] = await Promise.all([
    Analysis.find({ user: userId, status: 'complete' })
      .sort({ createdAt: 1 })
      .select('jobTitle company matchScore missingKeywords createdAt'),
    InterviewSession.find({ user: userId }).select('overallScore status createdAt'),
    Resume.countDocuments({ user: userId }),
    Comparison.countDocuments({ user: userId }),
  ]);

  const scores = analyses
    .map((a) => a.matchScore)
    .filter((s): s is number => typeof s === 'number');
  const avgMatch = scores.length ? Math.round(scores.reduce((s, n) => s + n, 0) / scores.length) : null;
  const bestMatch = scores.length ? Math.max(...scores) : null;

  const scoreHistory = analyses.slice(-12).map((a) => ({
    date: a.createdAt,
    score: a.matchScore,
    label: a.jobTitle || a.company || 'Role',
  }));

  const iScores = interviews
    .map((i) => i.overallScore)
    .filter((s): s is number => typeof s === 'number');
  const avgInterview = iScores.length
    ? Math.round((iScores.reduce((s, n) => s + n, 0) / iScores.length) * 10) / 10
    : null;

  const freq = new Map<string, number>();
  for (const a of analyses) {
    for (const k of a.missingKeywords ?? []) {
      const kw = k.trim();
      if (kw) freq.set(kw, (freq.get(kw) ?? 0) + 1);
    }
  }
  const topMissing = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([keyword, count]) => ({ keyword, count }));

  const payload = {
    totals: {
      analyses: analyses.length,
      interviews: interviews.length,
      resumes: resumeCount,
      comparisons: comparisonCount,
    },
    avgMatch,
    bestMatch,
    avgInterview,
    scoreHistory,
    topMissing,
  };

  await cacheSet(key, payload, 60);
  res.json(payload);
});
