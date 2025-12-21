/**
 * Custom error classes for the bot
 */

export class CommandError extends Error {
  constructor(message, command = null) {
    super(message);
    this.name = 'CommandError';
    this.command = command;
  }
}

export class ValidationError extends Error {
  constructor(message, field = null, value = null) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

export class StateError extends Error {
  constructor(message, operation = null) {
    super(message);
    this.name = 'StateError';
    this.operation = operation;
  }
}

export class APIError extends Error {
  constructor(message, statusCode = null, endpoint = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

