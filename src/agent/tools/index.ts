import type OpenAI from 'openai';
import type { SkillGap } from '../../models/Analysis';

/**
 * Agent tool registry.
 *
 * Tools are defined in the OpenAI / Groq function shape. Each tool is the
 * channel through which the agent emits ONE structured deliverable — the
 * executor validates the arguments, records them into a shared `AgentResults`
 * accumulator, and returns a short acknowledgement string back to the model.
 *
 * This "tool as typed output channel" pattern is what powers the live agent
 * timeline in the UI: every deliverable arrives as an observable tool call.
 */

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;

export interface AgentResults {
  matchScore?: number;
  matchedKeywords?: string[];
  missingKeywords?: string[];
  summary?: string;
  tailoredResume?: string;
  tailoredChanges?: string;
  coverLetter?: string;
  skillGaps?: SkillGap[];
  questions?: { question: string; category: string }[];
  score?: number;
  feedback?: string;
  comparison?: {
    rankings: { resumeIndex: number; fitScore: number; strengths: string[]; weaknesses: string[] }[];
    bestResumeIndex: number;
    rationale: string;
  };
}

const fn = (
  name: string,
  description: string,
  parameters: Record<string, unknown>
): Tool => ({
  type: 'function',
  function: { name, description, parameters },
});

// ── Tool definitions ─────────────────────────────────────────────────────────

export const analysisTools: Tool[] = [
  fn('record_match_analysis', 'Record the ATS match analysis between the resume and the job description.', {
    type: 'object',
    properties: {
      matchScore: { type: 'integer', description: 'Overall ATS match score from 0 to 100.', minimum: 0, maximum: 100 },
      matchedKeywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Important keywords/skills from the job the candidate already has.',
      },
      missingKeywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Important keywords/skills from the job the candidate is missing or under-emphasizes.',
      },
      summary: { type: 'string', description: 'A 2-4 sentence assessment of overall fit.' },
    },
    required: ['matchScore', 'matchedKeywords', 'missingKeywords', 'summary'],
  }),
  fn('record_tailored_resume', 'Record a rewritten, job-tailored version of the resume.', {
    type: 'object',
    properties: {
      tailoredResume: {
        type: 'string',
        description: 'The full tailored resume text, rewritten to target this job. Use clear sections and quantified bullet points.',
      },
      changesSummary: { type: 'string', description: 'A brief bullet summary of the key changes made and why.' },
    },
    required: ['tailoredResume'],
  }),
  fn('record_cover_letter', 'Record a tailored cover letter for this specific job.', {
    type: 'object',
    properties: {
      coverLetter: {
        type: 'string',
        description: "The full cover letter, addressed to the company, specific to this role and the candidate's real experience.",
      },
    },
    required: ['coverLetter'],
  }),
  fn('record_skill_gaps', 'Record a prioritized roadmap of skills the candidate should develop for this role.', {
    type: 'object',
    properties: {
      gaps: {
        type: 'array',
        description: 'Prioritized list of skill gaps.',
        items: {
          type: 'object',
          properties: {
            skill: { type: 'string' },
            importance: { type: 'string', enum: ['critical', 'nice-to-have'] },
            howToLearn: { type: 'string', description: 'A concrete, actionable way to close this gap.' },
          },
          required: ['skill', 'importance', 'howToLearn'],
        },
      },
    },
    required: ['gaps'],
  }),
];

export const interviewQuestionTools: Tool[] = [
  fn('generate_interview_questions', 'Record the list of generated mock interview questions.', {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            question: { type: 'string' },
            category: {
              type: 'string',
              enum: ['behavioral', 'technical', 'role-specific', 'situational', 'general'],
            },
          },
          required: ['question', 'category'],
        },
      },
    },
    required: ['questions'],
  }),
];

export const compareTools: Tool[] = [
  fn(
    'record_resume_comparison',
    'Record the comparison of multiple resumes against one job, ranked by fit, with the best pick.',
    {
      type: 'object',
      properties: {
        rankings: {
          type: 'array',
          description: 'One entry per resume, using the 1-based resumeIndex it was given.',
          items: {
            type: 'object',
            properties: {
              resumeIndex: { type: 'integer', description: 'The 1-based index of the resume as labeled in the prompt.' },
              fitScore: { type: 'integer', minimum: 0, maximum: 100 },
              strengths: { type: 'array', items: { type: 'string' } },
              weaknesses: { type: 'array', items: { type: 'string' } },
            },
            required: ['resumeIndex', 'fitScore', 'strengths', 'weaknesses'],
          },
        },
        bestResumeIndex: { type: 'integer', description: 'The 1-based index of the best-fit resume for this job.' },
        rationale: { type: 'string', description: 'Why that resume is the best fit, and how the others compare.' },
      },
      required: ['rankings', 'bestResumeIndex', 'rationale'],
    }
  ),
];

export const interviewScoreTools: Tool[] = [
  fn('score_interview_answer', "Record the score and feedback for a candidate's interview answer.", {
    type: 'object',
    properties: {
      score: { type: 'integer', minimum: 0, maximum: 10 },
      feedback: { type: 'string', description: 'Specific, actionable feedback on the answer.' },
    },
    required: ['score', 'feedback'],
  }),
];

// ── Executors ────────────────────────────────────────────────────────────────

export type ToolExecutor = (args: Record<string, unknown>, results: AgentResults) => string;

export const executors: Record<string, ToolExecutor> = {
  record_match_analysis(args, results) {
    results.matchScore = clampInt(args.matchScore, 0, 100);
    results.matchedKeywords = asStringArray(args.matchedKeywords);
    results.missingKeywords = asStringArray(args.missingKeywords);
    results.summary = String(args.summary ?? '');
    return `Match analysis recorded (score ${results.matchScore}/100).`;
  },

  record_tailored_resume(args, results) {
    results.tailoredResume = String(args.tailoredResume ?? '');
    if (args.changesSummary) results.tailoredChanges = String(args.changesSummary);
    return 'Tailored resume recorded.';
  },

  record_cover_letter(args, results) {
    results.coverLetter = String(args.coverLetter ?? '');
    return 'Cover letter recorded.';
  },

  record_skill_gaps(args, results) {
    const gaps = Array.isArray(args.gaps) ? args.gaps : [];
    results.skillGaps = gaps.map((g: Record<string, unknown>) => ({
      skill: String(g.skill ?? ''),
      importance: g.importance === 'nice-to-have' ? 'nice-to-have' : 'critical',
      howToLearn: String(g.howToLearn ?? ''),
    }));
    return `Skill-gap roadmap recorded (${results.skillGaps.length} items).`;
  },

  generate_interview_questions(args, results) {
    const questions = Array.isArray(args.questions) ? args.questions : [];
    results.questions = questions.map((q: Record<string, unknown>) => ({
      question: String(q.question ?? ''),
      category: String(q.category ?? 'general'),
    }));
    return `Generated ${results.questions.length} questions.`;
  },

  score_interview_answer(args, results) {
    results.score = clampInt(args.score, 0, 10);
    results.feedback = String(args.feedback ?? '');
    return `Answer scored ${results.score}/10.`;
  },

  record_resume_comparison(args, results) {
    const rankings = Array.isArray(args.rankings) ? args.rankings : [];
    results.comparison = {
      rankings: rankings.map((r: Record<string, unknown>) => ({
        resumeIndex: clampInt(r.resumeIndex, 1, 99),
        fitScore: clampInt(r.fitScore, 0, 100),
        strengths: asStringArray(r.strengths),
        weaknesses: asStringArray(r.weaknesses),
      })),
      bestResumeIndex: clampInt(args.bestResumeIndex, 1, 99),
      rationale: String(args.rationale ?? ''),
    };
    return `Compared ${results.comparison.rankings.length} resumes; best is #${results.comparison.bestResumeIndex}.`;
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function clampInt(value: unknown, min: number, max: number): number {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v)).filter(Boolean);
}
