import { z } from 'zod';
import { InterviewSession } from '../models/InterviewSession';
import { Resume } from '../models/Resume';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { runAgent } from '../agent/loop';
import { interviewQuestionTools, interviewScoreTools } from '../agent/tools/index';
import {
  SYSTEM_PROMPT,
  buildInterviewQuestionsPrompt,
  buildInterviewScorePrompt,
} from '../agent/prompts';
import { consumeCredit, addUsage } from '../middleware/usage';

const startSchema = z.object({
  jobTitle: z.string().max(160).optional(),
  jobDescription: z.string().max(20000).optional(),
  resumeId: z.string().optional(),
  count: z.number().int().min(3).max(10).optional(),
});

const answerSchema = z.object({
  answer: z.string().min(1, 'Answer cannot be empty'),
});

export const startInterview = asyncHandler(async (req, res) => {
  const { jobTitle, jobDescription, resumeId, count } = startSchema.parse(req.body);
  const user = req.user!;

  let resumeText = '';
  let resumeRef = null;
  if (resumeId) {
    const resume = await Resume.findOne({ _id: resumeId, user: user._id });
    if (!resume) throw ApiError.notFound('Resume not found');
    resumeText = resume.rawText;
    resumeRef = resume._id;
  }

  const { results, usage } = await runAgent({
    system: SYSTEM_PROMPT,
    userPrompt: buildInterviewQuestionsPrompt({
      jobTitle,
      jobDescription,
      resumeText,
      count: count ?? 5,
    }),
    tools: interviewQuestionTools,
    maxSteps: 3,
    temperature: 0.6,
  });

  const questions = results.questions ?? [];
  if (questions.length === 0) {
    throw ApiError.badRequest('The AI could not generate questions. Please try again.');
  }

  const session = await InterviewSession.create({
    user: user._id,
    resume: resumeRef,
    jobTitle: jobTitle || '',
    jobDescription: jobDescription || '',
    turns: questions.map((q) => ({ question: q.question, category: q.category })),
  });

  await consumeCredit(user);
  await addUsage(user, usage);
  res.status(201).json({ session, credits: user.credits, plan: user.plan });
});


export const answerQuestion = asyncHandler(async (req, res) => {
  const { answer } = answerSchema.parse(req.body);

  const session = await InterviewSession.findOne({
    _id: req.params.id,
    user: req.user!._id,
  });
  if (!session) throw ApiError.notFound('Interview session not found');

  const turn = session.turns.find(
    (t) => String((t as unknown as { _id: unknown })._id) === req.params.turnId
  );
  if (!turn) throw ApiError.notFound('Question not found in this session');

  const { results, usage } = await runAgent({
    system: SYSTEM_PROMPT,
    userPrompt: buildInterviewScorePrompt({
      question: turn.question,
      answer,
      jobTitle: session.jobTitle,
    }),
    tools: interviewScoreTools,
    maxSteps: 3,
    temperature: 0.3,
  });

  turn.answer = answer;
  turn.score = results.score ?? null;
  turn.feedback = results.feedback ?? '';
  turn.answeredAt = new Date();


  const scored = session.turns.filter((t) => typeof t.score === 'number');
  if (scored.length === session.turns.length) {
    const avg = scored.reduce((sum, t) => sum + (t.score ?? 0), 0) / scored.length;
    session.overallScore = Math.round(avg * 10) / 10;
    session.status = 'completed';
  }

  await session.save();
  await addUsage(req.user!, usage);
  res.json({ turn, session });
});


export const listInterviews = asyncHandler(async (req, res) => {
  const sessions = await InterviewSession.find({ user: req.user!._id })
    .sort({ createdAt: -1 })
    .select('jobTitle status overallScore createdAt turns');
  res.json({
    sessions: sessions.map((s) => ({
      id: s._id,
      jobTitle: s.jobTitle,
      status: s.status,
      overallScore: s.overallScore,
      questionCount: s.turns.length,
      createdAt: s.createdAt,
    })),
  });
});


export const getInterview = asyncHandler(async (req, res) => {
  const session = await InterviewSession.findOne({ _id: req.params.id, user: req.user!._id });
  if (!session) throw ApiError.notFound('Interview session not found');
  res.json({ session });
});
