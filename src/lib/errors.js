const { logger } = require('./logger');

/** Base class. `messageId` points at the user-facing text in docs/UI_UX_DESIGN.md section 9. */
class AppError extends Error {
  constructor(message, { code, status = 500, messageId } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.messageId = messageId;
  }
}

const defineError = (name, defaults) =>
  ({
    [name]: class extends AppError {
      constructor(message, options = {}) {
        super(message, { ...defaults, ...options });
      }
    },
  })[name];

const ValidationError = defineError('ValidationError', { code: 'VALIDATION', status: 400 });
const UnauthenticatedError = defineError('UnauthenticatedError', {
  code: 'UNAUTHENTICATED',
  status: 401,
  messageId: 'M-AUTH-EXPIRED',
});
const ForbiddenError = defineError('ForbiddenError', {
  code: 'FORBIDDEN',
  status: 403,
  messageId: 'M-FORBIDDEN',
});
const NotFoundError = defineError('NotFoundError', {
  code: 'NOT_FOUND',
  status: 404,
  messageId: 'M-NOT-FOUND',
});
const ConflictError = defineError('ConflictError', { code: 'CONFLICT', status: 409 });
const QueueUnavailableError = defineError('QueueUnavailableError', {
  code: 'QUEUE_UNAVAILABLE',
  status: 503,
  messageId: 'M-QUEUE-DOWN',
});
const CrawlError = defineError('CrawlError', { code: 'CRAWL_FAILED', messageId: 'M-FAIL-CRAWL' });
const IntegrationNotConfiguredError = defineError('IntegrationNotConfiguredError', {
  code: 'NOT_CONFIGURED',
  messageId: 'M-FAIL-CONFIG',
});
const AiResponseError = defineError('AiResponseError', { code: 'AI_FAILED', messageId: 'M-FAIL-AI' });
const PdfError = defineError('PdfError', { code: 'PDF_FAILED', messageId: 'M-PDF-MISSING' });

/**
 * Turns any thrown value into a safe HTTP response. Unknown errors never expose details.
 * @returns {{ status: number, body: { error: string, code: string } }}
 */
function toErrorResponse(err) {
  if (err instanceof AppError && err.status < 500) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  if (err instanceof QueueUnavailableError) {
    return { status: err.status, body: { error: err.message, code: err.code } };
  }
  // Log the error's code only. Messages can contain connection strings or user data.
  logger.error('unhandled_error', { code: err?.code || err?.errorCode || err?.name || 'unknown' });
  return { status: 500, body: { error: 'Something went wrong.', code: 'INTERNAL' } };
}

module.exports = {
  AppError,
  ValidationError,
  UnauthenticatedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  QueueUnavailableError,
  CrawlError,
  IntegrationNotConfiguredError,
  AiResponseError,
  PdfError,
  toErrorResponse,
};
