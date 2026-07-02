import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { sendContactEmail } from '../services/email';
import { ContactMessage } from '../models/ContactMessage';

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  message: z.string().min(5, 'Message is too short').max(4000),
});

export const submitContact = asyncHandler(async (req, res) => {
  const data = schema.parse(req.body);
  await ContactMessage.create(data);
  await sendContactEmail(data);
  res.json({ ok: true });
});
