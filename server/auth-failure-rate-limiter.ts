import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

export const AUTH_BOUNDARY_PASSED = "authBoundaryPassed";

export function markAuthBoundaryPassed(res: Response): void {
  res.locals[AUTH_BOUNDARY_PASSED] = true;
}

export function createAuthFailureRateLimiter(
  windowMs: number,
  limit: number,
  isPublicPath: (path: string) => boolean,
) {
  return rateLimit({
    windowMs,
    limit,
    // Every request is provisionally counted before the auth boundary runs.
    // Release that count on finish unless the boundary itself withheld access.
    // HTTP status alone is deliberately insufficient: authorized workflow
    // reads can legitimately return 4xx/5xx and must not poison this bucket.
    skipSuccessfulRequests: true,
    requestWasSuccessful: (_req: Request, res: Response) =>
      res.locals[AUTH_BOUNDARY_PASSED] === true,
    skip: (req: Request) => isPublicPath(req.path),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "too_many_failed_auth_attempts" },
  });
}
