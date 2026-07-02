import { z } from 'zod';
import type OpenAI from 'openai';
import { asyncHandler } from '../utils/asyncHandler';
import { llm, MODEL } from '../services/llm';
import { logger } from '../utils/logger';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const SITE_PROMPT = `You are the friendly assistant for CheckMyResume AI, a website. Answer visitor questions ONLY about CheckMyResume — what it does, its features, pricing, and how to use it. Keep answers short, helpful, and concrete (a few sentences). If asked something unrelated to CheckMyResume or job-seeking, politely steer back.

ABOUT CHECKMYRESUME:
- An agentic AI career coach: you upload a resume and paste a job description, and an AI agent (using tool-calling) screens you like a recruiter — live, step by step.
- Features: ATS match score (0–100) with matched/missing keywords; resume tailoring; cover-letter generation; mock interviews (questions + answers scored 0–10 with feedback); resume comparison (pick 2–5 resumes, it names the best fit for a job); a grounded follow-up chat on each analysis; a personal analytics dashboard (score trends, most-missing skills).
- How to use: sign up free (1 AI run), add a resume (upload PDF/DOCX or paste), open Analyze, paste a job, and run. You can also Compare resumes and practice Mock Interviews.
- Pricing per month (INR): Free ₹0 — 1 run, 2 resumes. Starter ₹299 — 60 runs, 3 resumes. Pro ₹499 — 250 runs, 5 resumes, resume comparison. Premium ₹999 — unlimited runs, 15 resumes, analytics dashboard, unlimited follow-up chat.
- Sign in with email/password or Google. Built with Next.js, Express, MongoDB, Redis, and Groq.`;

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(1000),
      })
    )
    .min(1)
    .max(12),
});

export const assistantChat = asyncHandler(async (req, res) => {
  const { messages } = schema.parse(req.body);

  const llmMessages: ChatMessage[] = [
    { role: 'system', content: SITE_PROMPT },
    ...messages.map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const stream = await llm.chat.completions.create({
      model: MODEL,
      messages: llmMessages,
      temperature: 0.4,
      max_tokens: 500,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) send({ type: 'delta', text: delta });
    }
    send({ type: 'done' });
    res.end();
  } catch (err) {
    logger.error('Assistant failed:', (err as Error).message);
    send({ type: 'error', message: 'Sorry, I couldn’t respond right now. Please try again.' });
    res.end();
  }
});
