/**
 * Operational error with an attached HTTP status code.
 * Throw these anywhere in the request lifecycle; the global error
 * middleware translates them into clean JSON responses.
 */
export class ApiError extends Error {
  statusCode: number;
  details?: unknown;
  isOperational = true;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Not authenticated') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'Not allowed') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Resource not found') {
    return new ApiError(404, msg);
  }
  static payment(msg = 'Payment required') {
    return new ApiError(402, msg);
  }
}
