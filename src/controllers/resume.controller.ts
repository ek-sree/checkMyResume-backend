import { z } from 'zod';
import { Resume } from '../models/Resume';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { parseResumeFile } from '../services/resumeParser';
import { cacheGet, cacheSet, cacheDel } from '../services/cache';
import { getPlan, type Plan } from '../config/plans';
import { Readable } from 'stream';

const listKey = (userId: unknown) => `resumes:${userId}`;

async function assertResumeQuota(user: { _id: unknown; plan: Plan }): Promise<void> {
  const max = getPlan(user.plan).maxResumes;
  const count = await Resume.countDocuments({ user: user._id });
  if (count >= max) {
    throw ApiError.badRequest(
      `Your plan allows up to ${max} resumes. Delete one or upgrade to add more.`
    );
  }
}

const textSchema = z.object({
  label: z.string().max(120).optional(),
  text: z.string().min(30, 'Resume text is too short'),
});

function summarize(resume: { _id: unknown; label: string; sourceType: string; rawText: string; createdAt: Date }) {
  return {
    id: resume._id,
    label: resume.label,
    sourceType: resume.sourceType,
    excerpt: resume.rawText.slice(0, 180),
    createdAt: resume.createdAt,
  };
}

export const uploadResumeFile = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('No file uploaded');
  await assertResumeQuota(req.user!);
  console.log(`Uploading resume body ${req.file}`);
  console.log(`Uploading resume ${req.file.originalname}`);
  const stream = Readable.from(req.file.buffer);
  const { rawText, sourceType } = await parseResumeFile(req.file);
  const label = (req.body?.label as string) || req.file.originalname || 'Uploaded resume';

   
  const resume = await Resume.create({
    user: req.user!._id,
    label,
    sourceType,
    rawText,
  });

  await cacheDel(listKey(req.user!._id));
  res.status(201).json({ resume: summarize(resume) });
});


export const createResumeFromText = asyncHandler(async (req, res) => {
  const { label, text } = textSchema.parse(req.body);
  await assertResumeQuota(req.user!);

  const resume = await Resume.create({
    user: req.user!._id,
    label: label || 'Pasted resume',
    sourceType: 'text',
    rawText: text.trim(),
  });

  await cacheDel(listKey(req.user!._id));
  res.status(201).json({ resume: summarize(resume) });
});


export const listResumes = asyncHandler(async (req, res) => {
  const key = listKey(req.user!._id);
  const cached = await cacheGet<ReturnType<typeof summarize>[]>(key);
  if (cached) return res.json({ resumes: cached });

  const resumes = await Resume.find({ user: req.user!._id }).sort({ createdAt: -1 });
  const summaries = resumes.map(summarize);
  await cacheSet(key, summaries, 120);
  res.json({ resumes: summaries });
});


export const getResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOne({ _id: req.params.id, user: req.user!._id });
  if (!resume) throw ApiError.notFound('Resume not found');
  res.json({ resume });
});


export const deleteResume = asyncHandler(async (req, res) => {
  const resume = await Resume.findOneAndDelete({ _id: req.params.id, user: req.user!._id });
  if (!resume) throw ApiError.notFound('Resume not found');
  await cacheDel(listKey(req.user!._id));
  res.json({ ok: true });
});
