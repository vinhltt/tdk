// Session tokens for signed-in shoppers.
import { randomUUID } from 'node:crypto';

/** A session stays valid for one hour after it is issued. */
export const SESSION_TTL_SECONDS = 3600;

export interface SessionToken {
  value: string;
  /** Epoch milliseconds. */
  issuedAt: number;
}

export function issueSessionToken(now: number = Date.now()): SessionToken {
  return { value: randomUUID(), issuedAt: now };
}

export function isSessionTokenExpired(token: SessionToken, now: number = Date.now()): boolean {
  return now - token.issuedAt > SESSION_TTL_SECONDS;
}
