import { Schema, model, type Types } from 'mongoose';

export interface InterviewTurn {
  question: string;
  category: string;
  answer: string;
  score: number | null;
  feedback: string;
  answeredAt?: Date;
}


export interface IInterviewSession {
  user: Types.ObjectId;
  resume: Types.ObjectId | null;
  jobTitle: string;
  jobDescription: string;
  turns: InterviewTurn[];
  overallScore: number | null;
  overallFeedback: string;
  status: 'active' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

const turnSchema = new Schema<InterviewTurn>({
  question: { type: String, required: true },
  category: { type: String, default: 'general' },
  answer: { type: String, default: '' },
  score: { type: Number, min: 0, max: 10, default: null },
  feedback: { type: String, default: '' },
  answeredAt: Date,
});

const interviewSchema = new Schema<IInterviewSession>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    resume: { type: Schema.Types.ObjectId, ref: 'Resume', default: null },
    jobTitle: { type: String, default: '' },
    jobDescription: { type: String, default: '' },
    turns: { type: [turnSchema], default: [] },
    overallScore: { type: Number, min: 0, max: 10, default: null },
    overallFeedback: { type: String, default: '' },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
  },
  { timestamps: true }
);

export const InterviewSession = model<IInterviewSession>('InterviewSession', interviewSchema);
