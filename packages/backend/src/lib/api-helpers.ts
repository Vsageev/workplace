// API helpers for consistent response shapes and common patterns

import type { ListResponse } from 'shared';
import { env } from '../config/env.js';

/**
 * Create a standardized API list response
 * Ensures all list endpoints return consistent shapes
 */
export function apiListResponse<T>(
  entries: T[],
  total: number,
  limit?: number,
  offset?: number
): ListResponse<T> {
  const response: ListResponse<T> = { entries, total };
  if (limit !== undefined) response.limit = limit;
  if (offset !== undefined) response.offset = offset;
  return response;
}

/**
 * Safe handler wrapper that catches errors and returns consistent format
 */
export async function safeHandler<T>(
  handler: () => Promise<T>
): Promise<{ data?: T; error?: string }> {
  try {
    const data = await handler();
    return { data };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Unknown error';
    return { error };
  }
}

/**
 * Simple in-memory rate limiter
 * Use for development-speed rate limiting without external dependencies
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();

  constructor(
    public maxRequests: number,
    public windowMs: number
  ) {}

  /**
   * Check if request is allowed
   * @param key - Identifier (e.g., userId, agentId, IP)
   * @returns true if allowed, false if rate limited
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    const timestamps = this.requests.get(key) || [];
    const recentTimestamps = timestamps.filter(t => t > windowStart);

    if (recentTimestamps.length >= this.maxRequests) {
      return false;
    }

    recentTimestamps.push(now);
    this.requests.set(key, recentTimestamps);

    // Cleanup old entries periodically
    if (recentTimestamps.length % 10 === 0) {
      this.requests.set(key, recentTimestamps.filter(t => t > windowStart));
    }

    return true;
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }

  /**
   * Update rate limiter config and clear existing windows
   */
  reconfigure(maxRequests: number, windowMs: number): void {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests.clear();
  }
}

/**
 * Create a rate limiter for agent prompt execution
 * Defaults come from env, can be overridden at runtime via settings API
 */
export function createAgentRateLimiter(): RateLimiter {
  return new RateLimiter(
    env.RATE_LIMIT_AGENT_PROMPT_MAX,
    env.RATE_LIMIT_AGENT_PROMPT_WINDOW_S * 1000,
  );
}
