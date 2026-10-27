import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

// Extend the base Error interface to optionally include a status code
export interface CustomError extends Error {
  statusCode?: number;
}

/** Creates an error that errorHandler will turn into a response with the given status */
export const createHttpError = (statusCode: number, message: string): CustomError => {
  const error: CustomError = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// 404 Not Found Handler
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(createHttpError(404, `Not Found - ${req.originalUrl}`));
};

interface NormalizedError {
  statusCode: number;
  message: string;
}

/** Maps known error types to a status code and a client-safe message */
const normalizeError = (err: CustomError): NormalizedError => {
  // Zod request validation failed (body / params / query)
  if (err instanceof ZodError) {
    const message = err.issues.map((issue) => issue.message).join(', ');
    return { statusCode: 400, message: message || 'Validation failed' };
  }

  // Mongoose schema validation failed (e.g. required field missing)
  if (err instanceof mongoose.Error.ValidationError) {
    const message = Object.values(err.errors)
      .map((fieldError) => fieldError.message)
      .join(', ');
    return { statusCode: 400, message: message || 'Validation failed' };
  }

  // Mongoose could not cast a value (e.g. malformed ObjectId)
  if (err instanceof mongoose.Error.CastError) {
    return { statusCode: 400, message: `Invalid value for field "${err.path}"` };
  }

  const statusCode = err.statusCode || 500;
  const isProduction = process.env.NODE_ENV === 'production';

  // Unknown server errors: hide internal details in production
  if (statusCode >= 500 && isProduction) {
    return { statusCode, message: 'Internal Server Error' };
  }

  return { statusCode, message: err.message || 'Internal Server Error' };
};

// Global Error Handling Middleware (Express recognizes 4 arguments as an error handler)
export const errorHandler = (
  err: CustomError,
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Response already started (e.g. mid-SSE stream): let Express close the connection
  if (res.headersSent) {
    next(err);
    return;
  }

  const { statusCode, message } = normalizeError(err);

  // Full stack for server errors, one-line log for client errors
  if (statusCode >= 500) {
    console.error(err.stack || err);
  } else {
    console.warn(`[${statusCode}] ${message}`);
  }

  res.status(statusCode).json({
    status: 'error',
    message,
    // Include stack trace only in development mode
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};