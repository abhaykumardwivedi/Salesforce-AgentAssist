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

export const passwordResetRequestSchema = z.object({
  email: z.string().trim().email('A valid email is required.').max(150),
});

export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required.'),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
});

export const emailVerifySchema = z.object({
  token: z.string().min(1, 'Verification token is required.'),
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

export const ticketMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message body is required.').max(5000),
  isInternal: z.boolean().optional(),
});

export const ticketAssignSchema = z.object({
  userId: z.coerce.number().int().positive().nullable(),
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

export const kbArticleSchema = z.object({
  title: z.string().trim().min(3, 'Article title is required.').max(200),
  content: z.string().trim().min(10, 'Article content is too short.').max(20000),
  category: z.string().trim().max(60).optional().nullable(),
  status: z.enum(['PUBLISHED', 'DRAFT']).optional(),
});

export const kbSearchSchema = z.object({
  q: z.string().trim().min(1, 'A search query is required.').max(1000),
});

export const aiAnswerSchema = z.object({
  question: z.string().trim().min(1, 'A question is required.').max(1000),
});

export const draftReplySchema = z.object({
  tone: z.enum(['FRIENDLY', 'FORMAL', 'EMPATHETIC', 'CONCISE']).optional(),
  instructions: z.string().trim().max(500).optional(),
  language: z.string().trim().max(40).optional(),
});

export const translateSchema = z.object({
  targetLanguage: z.string().trim().min(2).max(40).optional(),
});

export const monthlyLimitSchema = z.object({
  limit: z.coerce.number().int().min(0).max(1000000).nullable(),
});

export const automationRuleSchema = z.object({
  name: z.string().trim().min(2, 'Rule name is required.').max(150),
  triggerEvent: z.enum(['TICKET_CREATED', 'CUSTOMER_MESSAGE']),
  conditionField: z.enum(['category', 'priority', 'sentiment', 'subject', 'description', 'language']).optional().nullable(),
  conditionOp: z.enum(['EQUALS', 'CONTAINS']).optional().nullable(),
  conditionValue: z.string().trim().max(200).optional().nullable(),
  actionType: z.enum(['SET_PRIORITY', 'SET_STATUS', 'ADD_NOTE', 'ASSIGN_USER']),
  actionValue: z.string().trim().max(200).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const automationRuleUpdateSchema = automationRuleSchema.partial();

export const widgetAskSchema = z.object({
  question: z.string().trim().min(1, 'A question is required.').max(1000),
});

export const widgetEscalateSchema = z.object({
  name: z.string().trim().min(1, 'Your name is required.').max(150),
  email: z.string().trim().email('A valid email is required.').max(150),
  subject: z.string().trim().min(1, 'A subject is required.').max(200),
  message: z.string().trim().min(1, 'A message is required.').max(5000),
});

export const bulkImportSchema = z.object({
  rows: z.array(z.any()).min(1, 'Provide at least one row.').max(1000, 'A maximum of 1000 rows per import.'),
});

export const copilotSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1, 'At least one message is required.')
    .max(30),
});

export const copilotActionSchema = z.object({
  type: z.enum(['SEND_REPLY', 'ADD_NOTE', 'SET_STATUS', 'ASSIGN', 'CREATE_SALESFORCE_CASE']),
  ticketId: z.coerce.number().int().positive(),
  body: z.string().trim().max(5000).optional(),
  isInternal: z.boolean().optional(),
  status: z.enum(STATUSES).optional(),
  userId: z.coerce.number().int().positive().nullable().optional(),
});
