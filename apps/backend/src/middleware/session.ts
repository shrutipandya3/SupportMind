// middleware/session.ts
import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { createHttpError } from './errorHandler.js'; // adjust to your error handler file name

declare global {
  namespace Express {
    interface Request {
      sessionId?: string;
    }
  }
}

const COOKIE = 'sid';
const isProd = process.env.NODE_ENV === 'production';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax', // 'lax' is fine for localhost:5173 -> localhost:3000
  maxAge: 1000 * 60 * 60 * 24 * 365,
  path: '/',
} as const;

// 1. Runs on every request: read and validate only, never creates
export const readSession: RequestHandler = (req, _res, next) => {
  const sid = req.cookies?.[COOKIE];
  if (typeof sid === 'string' && UUID_RE.test(sid)) {
    req.sessionId = sid;
  }
  next();
};

// 2. For routes that need an existing session
export const requireSession: RequestHandler = (req, _res, next) => {
  if (!req.sessionId) {
    next(createHttpError(401, 'Session not found. Start a new chat first.'));
    return;
  }
  next();
};

// 2b. For routes that work with or without a session (no error if missing)
export const optionalSession: RequestHandler = (_req, _res, next) => {
  // readSession already ran and populated req.sessionId if a cookie was present.
  // Nothing extra to do — just continue.
  next();
};

// 3. For the route(s) that start a conversation: creates the session if missing
export const ensureSession: RequestHandler = (req, res, next) => {
  if (!req.sessionId) {
    req.sessionId = randomUUID();
    res.cookie(COOKIE, req.sessionId, cookieOptions);
  }
  next();
};

// 4. Helper for controllers: returns the session ID as a plain string
export function getSessionId(req: { sessionId?: string | undefined }): string {
  if (!req.sessionId) {
    throw new Error('Session middleware missing on this route');
  }
  return req.sessionId;
}