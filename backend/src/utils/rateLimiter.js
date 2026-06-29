const attempts = new Map();

const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

export const rateLimitLogin = (email) => {
  const now = Date.now();
  const key = `login_${email}`;

  if (!attempts.has(key)) {
    attempts.set(key, []);
  }

  const userAttempts = attempts.get(key);
  const recentAttempts = userAttempts.filter((time) => now - time < RATE_LIMIT_WINDOW);

  if (recentAttempts.length >= MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfter: Math.ceil((recentAttempts[0] + RATE_LIMIT_WINDOW - now) / 1000),
    };
  }

  recentAttempts.push(now);
  attempts.set(key, recentAttempts);

  return { allowed: true };
};
