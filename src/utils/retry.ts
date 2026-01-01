/**
 * Calculate exponential backoff delay in milliseconds
 * @param attemptNumber - The current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds (default: 1000ms)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(attemptNumber: number, baseDelayMs: number = 1000): number {
    return baseDelayMs * Math.pow(2, attemptNumber);
  }
  
  /**
   * Sleep for a given number of milliseconds
   */
  export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  /**
   * Retry a function with exponential backoff
   * @param fn - Function to retry (should return a Promise)
   * @param maxRetries - Maximum number of retries
   * @param baseDelayMs - Base delay in milliseconds
   * @returns Result of the function or throws the last error
   */
  export async function retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 5,
    baseDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error;
  
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
  
        if (attempt < maxRetries) {
          const delay = calculateBackoffDelay(attempt, baseDelayMs);
          await sleep(delay);
        }
      }
    }
  
    throw lastError!;
  }
  
  