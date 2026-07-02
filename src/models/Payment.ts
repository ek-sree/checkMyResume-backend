import { Schema, model, type Types } from 'mongoose';
import type { Plan } from '../config/plans';


export interface IPayment {
  user: Types.ObjectId;
  plan: Plan;
  planName: string;
  amount: number;
  currency: string;
  status: 'paid';
  method: 'card' | 'upi' | 'demo';
  invoiceNumber: string;
  periodLabel: string; 
  providerReferenceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: String, required: true },
    planName: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, default: 'paid' },
    method: { type: String, enum: ['card', 'upi', 'demo'], default: 'card' },
    invoiceNumber: { type: String, required: true },
    periodLabel: { type: String, default: 'Monthly subscription' },
    providerReferenceId: { type: String, default: null },
  },
  { timestamps: true }
);

export const Payment = model<IPayment>('Payment', paymentSchema);
