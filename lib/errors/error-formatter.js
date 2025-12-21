/**
 * Error formatting utilities for consistent, traceable error messages
 */

/**
 * Gets error details object for structured logging
 * @param {Error|any} err - Error object
 * @param {string} operation - Operation being performed
 * @returns {Object} Error details object
 */
export function getErrorDetails(err, operation = null) {
  const details = {
    errorType: err?.name || err?.constructor?.name || 'UnknownError',
    errorMessage: err?.message || String(err) || 'No error message available',
  };

  if (operation) {
    details.operation = operation;
  }

  if (err?.stack) {
    details.stack = err?.stack;
  }

  // Include additional error properties if available
  if (err?.code) {
    details.code = err.code;
  }

  if (err?.statusCode) {
    details.statusCode = err.statusCode;
  }

  if (err?.endpoint) {
    details.endpoint = err.endpoint;
  }

  // Include HTTP response details if available (for axios/fetch errors)
  if (err?.response) {
    details.responseStatus = err.response.status;
    if (err.response.data) {
      details.responseBody = err.response.data;
    }
  }

  return details;
}

