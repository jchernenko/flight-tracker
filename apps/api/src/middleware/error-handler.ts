import type { ErrorHandler, NotFoundHandler } from 'hono';
import type { ApiFailure } from '@flight/shared';
import { AppError } from '../utils/errors.js';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json<ApiFailure>({ success: false, error: err.message }, err.status);
  }
  console.error(err);
  return c.json<ApiFailure>({ success: false, error: 'Internal server error' }, 500);
};

export const apiNotFound: NotFoundHandler = (c) =>
  c.json<ApiFailure>({ success: false, error: 'Not found' }, 404);
