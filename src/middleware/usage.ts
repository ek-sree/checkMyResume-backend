import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import type { HydratedDocument } from 'mongoose';
import type { IUser, IUserMethods } from '../models/User';
import { getPlan, type Feature } from '../config/plans';

type UserDoc = HydratedDocument<IUser, IUserMethods>;

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Refill a paid plan's monthly credit allotment if the billing period elapsed.
 * This makes the "/month" allowance real even without a Razor renewal webhook
 * (and complements the `invoice.paid` handler when Razorpayy is configured).
 */
export async function maybeRenewCredits(user: UserDoc): Promise<void> {
  const plan = getPlan(user.plan);
  if (plan.id === 'free' || plan.unlimitedCredits) return;
  if (user.creditsResetAt && Date.now() >= user.creditsResetAt.getTime()) {
    user.credits = plan.credits;
    user.creditsResetAt = new Date(Date.now() + MONTH_MS);
    await user.save();
  }
}

/**
 * Gate for any endpoint that spends an AI run. The credit is only decremented
 * AFTER a successful run so failures never cost a credit.
 */
export const requireCredits = asyncHandler(async (req, _res, next) => {
  const user = req.user;
  if (!user) throw ApiError.unauthorized();

  await maybeRenewCredits(user);

  if (!user.canRunAI()) {
    throw ApiError.payment('You have used all your credits. Upgrade your plan to continue.');
  }
  next();
});

/** Gate a route behind a plan feature (e.g. `compare`, `analytics`, `interviews`). */
export const requireFeature = (feature: Feature) =>
  asyncHandler(async (req, _res, next) => {
    const user = req.user;
    if (!user) throw ApiError.unauthorized();

    if (!getPlan(user.plan).features[feature]) {
      throw ApiError.payment(
        `Your ${getPlan(user.plan).name} plan doesn't include this feature. Upgrade to unlock it.`
      );
    }
    next();
  });

/** Decrement a credit after a successful AI run (unless the plan is unlimited). */
export async function consumeCredit(user: UserDoc): Promise<void> {
  if (getPlan(user.plan).unlimitedCredits) return;
  user.credits = Math.max(0, user.credits - 1);
  await user.save();
}

/** Record token usage + an AI run against the user (for admin analytics). */
export async function addUsage(user: UserDoc, tokens: number): Promise<void> {
  user.tokensUsed += tokens;
  user.aiRuns += 1;
  await user.save();
}
