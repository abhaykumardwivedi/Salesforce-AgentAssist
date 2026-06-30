import { badRequest } from '../utils/httpError.js';

export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path?.join('.') || 'request';
      next(badRequest(`${field}: ${issue?.message || 'Invalid value.'}`));
      return;
    }
    req[source] = result.data;
    next();
  };
}
