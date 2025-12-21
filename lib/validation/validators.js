/**
 * Validation utilities using Zod schemas
 */

import * as schemas from './schemas.js';
import { ValidationError } from '../errors/custom-errors.js';

/**
 * Validates WAHA webhook data
 */
export function validateWahaWebhook(data) {
  try {
    return schemas.wahaWebhookSchema.parse(data);
  } catch (error) {
    throw new ValidationError(`Invalid WAHA webhook: ${error.message}`, 'webhook', data);
  }
}

/**
 * Validates WAHA message payload
 */
export function validateWahaMessage(payload) {
  try {
    return schemas.wahaMessagePayloadSchema.parse(payload);
  } catch (error) {
    throw new ValidationError(`Invalid WAHA message: ${error.message}`, 'message', payload);
  }
}

/**
 * Validates WAHA reaction payload
 */
export function validateWahaReaction(payload) {
  try {
    return schemas.wahaReactionPayloadSchema.parse(payload);
  } catch (error) {
    throw new ValidationError(`Invalid WAHA reaction: ${error.message}`, 'reaction', payload);
  }
}

/**
 * Validates Seerr webhook data
 */
export function validateSeerrWebhook(data) {
  try {
    return schemas.seerrWebhookSchema.parse(data);
  } catch (error) {
    throw new ValidationError(`Invalid Seerr webhook: ${error.message}`, 'seerr_webhook', data);
  }
}

/**
 * Validates approval command input
 */
export function validateApprovalCommand(input) {
  try {
    return schemas.approvalCommandSchema.parse(input);
  } catch (error) {
    throw new ValidationError(`Invalid approval command: ${error.message}`, 'approval', input);
  }
}

/**
 * Validates search command input
 */
export function validateSearchCommand(input) {
  try {
    return schemas.searchCommandSchema.parse(input);
  } catch (error) {
    throw new ValidationError(`Invalid search command: ${error.message}`, 'search', input);
  }
}

