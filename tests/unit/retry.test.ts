import { calculateBackoffDelay, sleep, retryWithBackoff } from '../../src/utils/retry';

describe('Retry utilities', () => {
  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff correctly', () => {
      expect(calculateBackoffDelay(0, 1000)).toBe(1000);
      expect(calculateBackoffDelay(1, 1000)).toBe(2000);
      expect(calculateBackoffDelay(2, 1000)).toBe(4000);
      expect(calculateBackoffDelay(3, 1000)).toBe(8000);
    });

    it('should work with custom base delay', () => {
      expect(calculateBackoffDelay(0, 500)).toBe(500);
      expect(calculateBackoffDelay(1, 500)).toBe(1000);
    });
  });

  describe('sleep', () => {
    it('should sleep for the specified duration', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(150);
    });
  });

  describe('retryWithBackoff', () => {
    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await retryWithBackoff(fn, 3);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail 1'))
        .mockRejectedValueOnce(new Error('fail 2'))
        .mockResolvedValue('success');
      
      const result = await retryWithBackoff(fn, 3, 10);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const error = new Error('always fails');
      const fn = jest.fn().mockRejectedValue(error);
      
      await expect(retryWithBackoff(fn, 2, 10)).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });
  });
});

