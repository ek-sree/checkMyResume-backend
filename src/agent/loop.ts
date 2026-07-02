import type OpenAI from 'openai';
import { llm, MODEL } from '../services/llm';
import { executors, type AgentResults } from './tools/index';
import { logger } from '../utils/logger';
import type { AgentStep } from '../models/Analysis';

type Tool = OpenAI.Chat.Completions.ChatCompletionTool;
type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export interface RunAgentOptions {
  system: string;
  userPrompt: string;
  tools: Tool[];
  onStep?: (step: AgentStep) => void;
  maxSteps?: number;
  temperature?: number;
  maxTokens?: number;
}

export interface RunAgentResult {
  results: AgentResults;
  steps: AgentStep[];
  finalText: string;
  usage: number;
}

/**
 * Runs the agentic tool-use loop against the LLM.
 *
 * The model reasons, then calls tools to emit structured deliverables. 
 * execute each tool locally, feed the result back, and repeat until the model
 * stops calling tools. Every step is surfaced through
 * onStep so callers can persist it and stream it live to the UI.
 */
export async function runAgent({
  system,
  userPrompt,
  tools,
  onStep = () => undefined,
  maxSteps = 10,
  temperature = 0.4,
  maxTokens = 6000,
}: RunAgentOptions): Promise<RunAgentResult> {
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: userPrompt },
  ];

  const results: AgentResults = {};
  const steps: AgentStep[] = [];
  let usage = 0;

  const emit = (step: Omit<AgentStep, 'at'>): void => {
    const stamped: AgentStep = { ...step, at: new Date() };
    steps.push(stamped);
    try {
      onStep(stamped);
    } catch (err) {
      logger.warn('onStep handler threw:', (err as Error).message);
    }
  };

  let finalText = '';

  for (let step = 0; step < maxSteps; step += 1) {
    const completion = await llm.chat.completions.create({
      model: MODEL,
      messages,
      tools,
      tool_choice: 'auto',
      temperature,
      max_tokens: maxTokens,
    });

    usage += completion.usage?.total_tokens ?? 0;

    const message = completion.choices[0]?.message;
    if (!message) break;

    messages.push(message);

    if (message.content) {
      emit({ type: 'thinking', text: message.content });
    }

    const toolCalls = message.tool_calls ?? [];
    if (toolCalls.length === 0) {
      finalText = message.content || finalText;
      break;
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      const name = call.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch (err) {
        logger.warn(`Failed to parse tool arguments for ${name}:`, (err as Error).message);
      }

      emit({ type: 'tool_call', tool: name, input: args });

      const executor = executors[name];
      let ack: string;
      if (!executor) {
        ack = `Unknown tool: ${name}`;
      } else {
        try {
          ack = executor(args, results);
        } catch (err) {
          logger.error(`Tool ${name} failed:`, (err as Error).message);
          ack = `Tool ${name} failed: ${(err as Error).message}`;
        }
      }

      emit({ type: 'tool_result', tool: name, output: ack });
      messages.push({ role: 'tool', tool_call_id: call.id, content: ack });
    }
  }

  if (finalText) {
    emit({ type: 'final', text: finalText });
  }

  return { results, steps, finalText, usage };
}
