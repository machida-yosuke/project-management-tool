import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// Thrown from the data layer so routes stay thin; Hono's default error handler returns `res` as-is.
export function apiError(status: ContentfulStatusCode, error: string): HTTPException {
  return new HTTPException(status, { res: Response.json({ error }, { status }) });
}
