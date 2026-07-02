import { env } from './env';

export type Plan = 'free' | 'starter' | 'pro' | 'premium';
export type Feature = 'compare' | 'analytics' | 'interviews';

export interface PlanDef {
  id: Plan;
  name: string;
  price: number; 
  tagline: string;
  credits: number; 
  unlimitedCredits: boolean;
  maxResumes: number;
  chatLimit: number;
  unlimitedChat: boolean;
  features: Record<Feature, boolean>;
  priority: boolean; 
  highlights: string[];
  razorpayPlanId: string;
}


export const PLANS: Record<Plan, PlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    price: 0,
    tagline: 'Try it out',
    credits: 1,
    unlimitedCredits: false,
    maxResumes: 2,
    chatLimit: 2,
    unlimitedChat: false,
    features: { compare: false, analytics: false, interviews: false },
    priority: false,
    highlights: ['1 AI run', '2 resumes', 'ATS match, tailoring & cover letters', '2 follow-up questions / analysis'],
    razorpayPlanId: '',
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price: 299,
    tagline: 'For an active job hunt',
    credits: 60,
    unlimitedCredits: false,
    maxResumes: 3,
    chatLimit: 12,
    unlimitedChat: false,
    features: { compare: false, analytics: false, interviews: true },
    priority: false,
    highlights: ['60 AI runs / month', '3 resumes', 'Everything in Free', 'Mock interviews', '12 follow-up questions / analysis'],
    razorpayPlanId: env.razorpay.starterPlanId,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price: 499,
    tagline: 'Most popular',
    credits: 250,
    unlimitedCredits: false,
    maxResumes: 5,
    chatLimit: 40,
    unlimitedChat: false,
    features: { compare: true, analytics: false, interviews: true },
    priority: false,
    highlights: ['250 AI runs / month', '5 resumes', 'Everything in Starter', 'Resume comparison (best-fit picker)', '40 follow-up questions / analysis'],
    razorpayPlanId: env.razorpay.proPlanId,
  },
  premium: {
    id: 'premium',
    name: 'Premium',
    price: 999,
    tagline: 'Everything, unlimited',
    credits: 1000,
    unlimitedCredits: false,
    maxResumes: 15,
    chatLimit: 100,
    unlimitedChat: false,
    features: { compare: true, analytics: true, interviews: true },
    priority: true,
    highlights: ['1000 AI runs', '15 resumes', 'Everything in Pro', 'Personal analytics dashboard', '100 follow-up chat', 'Priority processing (no rate limits)'],
    razorpayPlanId: env.razorpay.premiumPlanId,
  },
};

export const PAID_PLANS: Plan[] = ['starter', 'pro', 'premium'];

export function getPlan(plan: Plan): PlanDef {
  return PLANS[plan] ?? PLANS.free;
}

export function planFromPriceId(priceId: string): Plan | null {
  const match = (Object.values(PLANS) as PlanDef[]).find((p) => p.razorpayPlanId && p.razorpayPlanId === priceId);
  return match ? match.id : null;
}
