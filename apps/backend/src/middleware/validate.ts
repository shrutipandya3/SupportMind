import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type ValidationOptions = { body?: ZodType; params?: ZodType; query?: ZodType };

/**
 * Creates a middleware to validate multiple parts of a request against Zod schemas.
 * Any failure (ZodError or otherwise) is forwarded to the global errorHandler.
 * @param schemas Object containing optional Zod schemas for body, params, and query
 */
export const validate = (schemas: ValidationOptions) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body) as Request['body'];
      }

      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as Request['params'];
      }

      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as Request['query'];
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};