import { z } from 'zod';

const SEGMENTS = ['NORMAL', 'PREMIUM', 'HIGH_VALUE', 'AT_RISK'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const ROLES = ['OWNER', 'ADMIN', 'AGENT'];

export const signupSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name is required.').max(150),
  fullName: z.string().trim().min(2, 'Full name is required.').max(150),
  email: z.string().trim().email('A valid email is required.').max(150),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email('A valid email is required.').max(150),
  password: z.string().min(1, 'Password is required.').max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required.'),
});

export const customerSchema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required.').max(150),
  email: z.string().trim().email('A valid email is required.').max(150),
  phone: z.string().trim().max(30).optional().nullable(),
  companyName: z.string().trim().max(150).optional().nullable(),
  segment: z.enum(SEGMENTS).optional(),
  customerSegment: z.enum(SEGMENTS).optional(),
});

export const ticketSchema = z.object({
  customerId: z.coerce.number().int().positive('Customer ID is required.'),
  subject: z.string().trim().min(1, 'Subject is required.').max(200),
  description: z.string().trim().min(1, 'Description is required.').max(5000),
});

export const ticketStatusSchema = z.object({
  status: z.enum(STATUSES),
});

export const userCreateSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(150),
  email: z.string().trim().email('A valid email is required.').max(150),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  role: z.enum(ROLES).optional(),
});

export const userUpdateSchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export const openAiIntegrationSchema = z.object({
  apiKey: z.string().trim().min(10, 'A valid OpenAI API key is required.').max(300),
  model: z.string().trim().max(100).optional(),
  embeddingModel: z.string().trim().max(100).optional(),
});

export const salesforceCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required.'),
  state: z.string().optional(),
});
