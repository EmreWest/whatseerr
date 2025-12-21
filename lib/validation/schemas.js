/**
 * Zod schemas for input validation
 */

import { z } from 'zod';

// WAHA webhook event schemas
export const wahaWebhookSchema = z.object({
  event: z.string(),
  session: z.string().optional(),
  payload: z.any().optional()
});

export const wahaMessagePayloadSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string().optional(),
  body: z.string().optional(),
  fromMe: z.boolean().optional(),
  timestamp: z.number().optional(),
  type: z.string().optional()
});

export const wahaReactionPayloadSchema = z.object({
  from: z.string(),
  reaction: z.object({
    text: z.string(),
    messageId: z.string()
  })
});

// Seerr webhook schema
export const seerrWebhookSchema = z.object({
  notification_type: z.string(),
  event: z.string().optional(),
  subject: z.string().optional(),
  media: z.object({
    media_type: z.enum(['movie', 'tv']).optional(),
    tmdbId: z.number().optional()
  }).nullable().optional(),
  request: z.object({
    request_id: z.number().optional(),
    requestedBy_username: z.string().optional(),
    requestedBy_email: z.string().optional()
  }).nullable().optional(),
  notifyuser: z.object({
    email: z.string().optional()
  }).nullable().optional(),
  extra: z.array(z.object({
    name: z.string(),
    value: z.union([z.string(), z.number()])
  })).nullable().optional()
});

// Command input schemas
export const approvalCommandSchema = z.object({
  command: z.enum(['approve', 'decline']),
  requestId: z.string().regex(/^\d+$/, 'Request ID must be numeric')
});

export const searchCommandSchema = z.object({
  query: z.string().min(1).max(300),
  is4k: z.boolean().optional()
});

