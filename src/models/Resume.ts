import { Schema, model, type Types } from 'mongoose';

export interface IResume {
  user: Types.ObjectId;
  label: string;
  sourceType: 'pdf' | 'docx' | 'text';
  rawText: string;
  structured: unknown | null;
  googleDriveId: string | null;
  name: string | null;
  webViewLink: string | null;
  webContentLink: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema<IResume>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: 'Untitled resume' },
    sourceType: { type: String, enum: ['pdf', 'docx', 'text'], required: true },
    rawText: { type: String, required: true },
    structured: { type: Schema.Types.Mixed, default: null },
    googleDriveId: { type: String, default: null },
    name: { type: String, default: null },
    webViewLink: { type: String, default: null },
    webContentLink: { type: String, default: null }
  },
  { timestamps: true }
);

export const Resume = model<IResume>('Resume', resumeSchema);
