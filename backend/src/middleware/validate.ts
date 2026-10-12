import { type NextFunction, type Request, type Response } from 'express';
import { type ZodType  } from 'zod';

type ValidationOptions = { body?: ZodType; params?: ZodType; query?: ZodType };

/**
 * Creates a middleware to validate multiple parts of a request against Zod schemas
 * @param schemas Object containing optional Zod schemas for body, params, and query
 * @returns Express middleware that validates the specified parts of the request
 */
export const validate = (schemas: ValidationOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        const validatedBody = schemas.body.parse(req.body);
        req.body = validatedBody as Request['body'];
      }

      if (schemas.params) {
        const validatedParams = schemas.params.parse(req.params);
        req.params = validatedParams as Request['params'];
      }

      if (schemas.query) {
        const validatedQuery = schemas.query.parse(req.query);
        req.query = validatedQuery as Request['query'];
      }

      next();
    } catch (error) {
      res.status(500).json({
      message: 'Failed to fetch chat',
      error: error instanceof Error ? error.message : 'Unknown error',
    });  
    }
  };
};