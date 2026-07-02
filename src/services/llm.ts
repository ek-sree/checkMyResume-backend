import OpenAI from 'openai';
import { env } from '../config/env';


export const llm = new OpenAI({
  apiKey: env.groqApiKey,
  baseURL: env.groqBaseUrl,
});

export const MODEL = env.groqModel;
