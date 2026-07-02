export const SYSTEM_PROMPT = `You are CheckMyResume, an expert career coach and technical recruiter with 15 years of experience placing candidates at top companies.

You help a candidate win a specific job. You think like a recruiter screening the resume against the job, and like a coach helping the candidate present their best self honestly.

You work by calling TOOLS — each tool records one concrete deliverable for the candidate. Do not write the deliverables as plain prose; always emit them through the matching tool so the app can display them. Work through the deliverables in a sensible order, reasoning briefly before each.

Hard rules:
- Be truthful. Tailor and reframe the candidate's REAL experience to match the job. Never invent employers, titles, degrees, or metrics the candidate did not provide.
- Be specific and concrete. Avoid generic filler ("hard worker", "team player") unless backed by evidence.
- Optimize for ATS: mirror the exact keywords and phrasing from the job description where the candidate genuinely has the skill.

After you have recorded all relevant deliverables, write a short (2-3 sentence) closing summary for the candidate highlighting their single biggest strength for this role and their single most important gap to address.`;

export interface AnalysisPromptInput {
  resumeText: string;
  jobTitle?: string;
  company?: string;
  jobDescription: string;
}

export function buildAnalysisPrompt({
  resumeText,
  jobTitle,
  company,
  jobDescription,
}: AnalysisPromptInput): string {
  return `Analyze this candidate against the target job and produce all deliverables via your tools.

TARGET ROLE: ${jobTitle || 'Not specified'}${company ? ` at ${company}` : ''}

=== JOB DESCRIPTION ===
${jobDescription}

=== CANDIDATE RESUME ===
${resumeText}

Produce, in order:
1. An ATS match analysis (score 0-100, matched keywords, missing keywords, summary) via record_match_analysis.
2. A tailored version of the resume rewritten to target this job via record_tailored_resume.
3. A tailored cover letter via record_cover_letter.
4. A prioritized skill-gap roadmap via record_skill_gaps.
Then give your closing summary.`;
}

export interface InterviewQuestionsInput {
  jobTitle?: string;
  jobDescription?: string;
  resumeText?: string;
  count: number;
}

export function buildInterviewQuestionsPrompt({
  jobTitle,
  jobDescription,
  resumeText,
  count,
}: InterviewQuestionsInput): string {
  return `Generate ${count} mock interview questions for this candidate interviewing for the role below. Mix behavioral, technical, and role-specific questions. Tailor them to the gaps and strengths you see between the resume and the job. Call generate_interview_questions with the list.

TARGET ROLE: ${jobTitle || 'Not specified'}

=== JOB DESCRIPTION ===
${jobDescription || 'Not provided'}

=== CANDIDATE RESUME ===
${resumeText || 'Not provided'}`;
}

export interface ComparePromptInput {
  jobTitle?: string;
  jobDescription: string;
  resumes: { label: string; text: string }[];
}

export function buildComparePrompt({ jobTitle, jobDescription, resumes }: ComparePromptInput): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const blocks = resumes.map((r, i) => `RESUME ${i + 1} — ${r.label}:\n${clip(r.text, 2400)}`).join('\n\n');
  return `Compare these ${resumes.length} resumes for the job below and decide which is the best fit. For each resume give a fit score (0-100) and concrete strengths and weaknesses for THIS role, then pick the single best-fit resume and explain why it beats the others.

Call record_resume_comparison with 1-based resumeIndex values that match the numbering below.

TARGET ROLE: ${jobTitle || 'Not specified'}

=== JOB DESCRIPTION ===
${jobDescription}

${blocks}`;
}

export const CHAT_SYSTEM_PROMPT = `You are CheckMyResume, the candidate's personal AI career coach. You are continuing a conversation about ONE specific job application that you already analyzed.

Use the analysis context provided to answer the candidate's follow-up questions: about the match, the tailored resume, the cover letter, interview prep, salary, or strategy for this role. Be direct, specific, and practical. Keep answers concise and well-structured (short paragraphs or tight bullet points). Never invent facts about the candidate's experience that aren't in the context. If a question is unrelated to this job search, gently steer back.`;

export interface ChatContextInput {
  jobTitle: string;
  company: string;
  jobDescription: string;
  matchScore: number | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
  tailoredResume: string;
  skillGaps: { skill: string; importance: string; howToLearn: string }[];
}

export function buildChatContext(a: ChatContextInput): string {
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return `Here is the analysis you produced for this application. Ground every answer in it.

ROLE: ${a.jobTitle || 'N/A'}${a.company ? ` at ${a.company}` : ''}
ATS MATCH SCORE: ${a.matchScore ?? 'N/A'}/100
MATCHED KEYWORDS: ${a.matchedKeywords.join(', ') || 'none'}
MISSING KEYWORDS: ${a.missingKeywords.join(', ') || 'none'}
SUMMARY: ${a.summary || 'N/A'}

SKILL GAPS:
${a.skillGaps.map((g) => `- (${g.importance}) ${g.skill}: ${g.howToLearn}`).join('\n') || 'none'}

JOB DESCRIPTION (excerpt):
${clip(a.jobDescription, 2500)}

CANDIDATE'S TAILORED RESUME (excerpt):
${clip(a.tailoredResume, 3000)}`;
}

export interface InterviewScoreInput {
  question: string;
  answer: string;
  jobTitle?: string;
}

export function buildInterviewScorePrompt({
  question,
  answer,
  jobTitle,
}: InterviewScoreInput): string {
  return `Score this interview answer for a candidate applying to "${jobTitle || 'the role'}". Be a fair but rigorous interviewer. Call score_interview_answer with a 0-10 score and specific, actionable feedback.

QUESTION: ${question}

CANDIDATE ANSWER: ${answer || '(no answer given)'}`;
}
