import { Schema, model, type Types } from 'mongoose';
import type { AgentStep } from './Analysis';

export interface CompareRanking {
  resume: Types.ObjectId;
  label: string;
  fitScore: number;
  strengths: string[];
  weaknesses: string[];
}

export interface IComparison {
  user: Types.ObjectId;
  jobTitle: string;
  jobDescription: string;
  rankings: CompareRanking[];
  bestResume: Types.ObjectId | null;
  bestLabel: string;
  rationale: string;
  steps: AgentStep[];
  status: 'pending' | 'complete' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const comparisonSchema = new Schema<IComparison>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    jobTitle: { type: String, default: '' },
    jobDescription: { type: String, required: true },
    rankings: {
      type: [
        {
          _id: false,
          resume: { type: Schema.Types.ObjectId, ref: 'Resume' },
          label: String,
          fitScore: { type: Number, min: 0, max: 100 },
          strengths: [String],
          weaknesses: [String],
        },
      ],
      default: [],
    },
    bestResume: { type: Schema.Types.ObjectId, ref: 'Resume', default: null },
    bestLabel: { type: String, default: '' },
    rationale: { type: String, default: '' },
    steps: { type: Schema.Types.Mixed, default: [] },
    status: { type: String, enum: ['pending', 'complete', 'failed'], default: 'pending' },
  },
  { timestamps: true }
);

export const Comparison = model<IComparison>('Comparison', comparisonSchema);
