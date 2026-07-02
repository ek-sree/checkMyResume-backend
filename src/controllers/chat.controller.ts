import { z } from 'zod';
import type OpenAI from 'openai';
import { Analysis } from '../models/Analysis';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { llm, MODEL } from '../services/llm';
import { CHAT_SYSTEM_PROMPT, buildChatContext } from '../agent/prompts';
import { getPlan } from '../config/plans';
import { addUsage } from '../middleware/usage';
import { logger } from '../utils/logger';

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

const chatSchema = z.object({ message: z.string().min(1).max(2000) });


export const chatAboutAnalysis = asyncHandler(async (req, res) => {
  const { message } = chatSchema.parse(req.body);
  const user = req.user!;

  const analysis = await Analysis.findOne({ _id: req.params.id, user: user._id });
  if (!analysis) throw ApiError.notFound('Analysis not found');

  const plan = getPlan(user.plan);
  const askedSoFar = analysis.chat.filter((t) => t.role === 'user').length;
  if (!plan.unlimitedChat && askedSoFar >= plan.chatLimit) {
    throw ApiError.payment(
      `You've used your ${plan.chatLimit} follow-up questions for this analysis on the ${plan.name} plan. Upgrade for more.`
    );
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    {
      role: 'system',
      content: buildChatContext({
        jobTitle: analysis.jobTitle,
        company: analysis.company,
        jobDescription: analysis.jobDescription,
        matchScore: analysis.matchScore,
        matchedKeywords: analysis.matchedKeywords,
        missingKeywords: analysis.missingKeywords,
        summary: analysis.summary,
        tailoredResume: analysis.tailoredResume,
        skillGaps: analysis.skillGaps,
      }),
    },
    ...analysis.chat.map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    { role: 'user', content: message },
  ];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let answer = '';
  let usageTokens = 0;
  try {
    const stream = await llm.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.5,
      max_tokens: 1200,
      stream: true,
      stream_options: { include_usage: true },
    });

    for await (const chunk of stream) {
      if (chunk.usage) usageTokens += chunk.usage.total_tokens ?? 0;
      const delta = chunk.choices[0]?.delta?.content;
      if (delta) {
        answer += delta;
        send({ type: 'delta', text: delta });
      }
    }

    analysis.chat.push({ role: 'user', content: message, at: new Date() });
    analysis.chat.push({ role: 'assistant', content: answer, at: new Date() });
    await analysis.save();
    await addUsage(user, usageTokens);

    const used = analysis.chat.filter((t) => t.role === 'user').length;
    const remaining = plan.unlimitedChat ? null : Math.max(0, plan.chatLimit - used);
    send({ type: 'done', remaining });
    res.end();
  } catch (err) {
    logger.error('Chat failed:', (err as Error).message);
    send({ type: 'error', message: 'The chat response failed. Please try again.' });
    res.end();
  }
});
