import { Schema, model, type Types } from 'mongoose';

export type StepType = 'thinking' | 'tool_call' | 'tool_result' | 'final';

export interface AgentStep {
  type: StepType;
  tool?: string;
  input?: unknown;
  output?: unknown;
  text?: string;
  at: Date;
}

export interface SkillGap {
  skill: string;
  importance: 'critical' | 'nice-to-have';
  howToLearn: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  at: Date;
}


export interface IAnalysis {
  user: Types.ObjectId;
  resume: Types.ObjectId;
  jobTitle: string;
  company: string;
  jobDescription: string;
  matchScore: number | null;
  matchedKeywords: string[];
  missingKeywords: string[];
  summary: string;
  tailoredResume: string;
  coverLetter: string;
  skillGaps: SkillGap[];
  steps: AgentStep[];
  chat: ChatTurn[];
  status: 'pending' | 'complete' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const stepSchema = new Schema<AgentStep>(
  {
    type: { type: String, enum: ['thinking', 'tool_call', 'tool_result', 'final'] },
    tool: String,
    input: Schema.Types.Mixed,
    output: Schema.Types.Mixed,
    text: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const analysisSchema = new Schema<IAnalysis>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resume: { type: Schema.Types.ObjectId, ref: 'Resume', required: true },

    jobTitle: { type: String, default: '' },
    company: { type: String, default: '' },
    jobDescription: { type: String, required: true },

    matchScore: { type: Number, min: 0, max: 100, default: null },
    matchedKeywords: { type: [String], default: [] },
    missingKeywords: { type: [String], default: [] },
    summary: { type: String, default: '' },

    tailoredResume: { type: String, default: '' },
    coverLetter: { type: String, default: '' },
    skillGaps: {
      type: [
        {
          _id: false,
          skill: String,
          importance: { type: String, enum: ['critical', 'nice-to-have'] },
          howToLearn: String,
        },
      ],
      default: [],
    },

    steps: { type: [stepSchema], default: [] },
    chat: {
      type: [
        {
          _id: false,
          role: { type: String, enum: ['user', 'assistant'] },
          content: String,
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

export const Analysis = model<IAnalysis>('Analysis', analysisSchema);
