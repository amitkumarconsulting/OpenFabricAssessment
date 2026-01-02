import { PostingService } from '../../../src/services/postingService';
import { Transaction } from '../../../src/models/transaction';
import { createMockPostingService, MockPostingService } from '../../helpers/mockPostingService';

// Mock fetch globally
global.fetch = jest.fn();

describe('PostingService', () => {
  let postingService: PostingService;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    postingService = new PostingService();
    mockFetch.mockClear();
  });

  describe('getTransaction', () => {
    it('should return transaction when it exists', async () => {
      const transactionId = 'test-123';
      const mockResponse = {
        id: transactionId,
        amount: 100,
        currency: 'USD',
        status: 'completed',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await postingService.getTransaction(transactionId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(transactionId);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/transactions/${transactionId}`),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should return null when transaction does not exist', async () => {
      const transactionId = 'non-existent';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      const result = await postingService.getTransaction(transactionId);

      expect(result).toBeNull();
    });

    it('should throw error on non-404 errors', async () => {
      const transactionId = 'test-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(postingService.getTransaction(transactionId)).rejects.toThrow(
        'Failed to get transaction'
      );
    });

    it('should handle timeout', async () => {
      const transactionId = 'test-timeout';

      // Mock AbortController
      const abortController = {
        signal: { aborted: false },
        abort: jest.fn(),
      };
      global.AbortController = jest.fn(() => abortController) as any;

      // Mock fetch to never resolve (simulating timeout)
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              const error = new Error('Timeout');
              error.name = 'AbortError';
              reject(error);
            }, 10);
          })
      );

      // Set a very short timeout
      postingService = new PostingService();
      Object.defineProperty(postingService, 'timeout', { value: 5, writable: true });

      await expect(postingService.getTransaction(transactionId)).rejects.toThrow('Timeout');
    });
  });

  describe('postTransaction', () => {
    it('should post transaction successfully', async () => {
      const transaction: Transaction = {
        id: 'post-test',
        amount: 100.50,
        currency: 'USD',
        description: 'Test transaction',
        timestamp: new Date().toISOString(),
      };

      const mockResponse = {
        id: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'completed',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await postingService.postTransaction(transaction);

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/transactions'),
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(transaction),
        })
      );
    });

    it('should throw error on failed POST', async () => {
      const transaction: Transaction = {
        id: 'post-fail',
        amount: 100,
        currency: 'USD',
        description: 'Failed transaction test',
        timestamp: new Date().toISOString(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(postingService.postTransaction(transaction)).rejects.toThrow(
        'Failed to post transaction'
      );
    });

    it('should handle timeout', async () => {
      const transaction: Transaction = {
        id: 'post-timeout',
        amount: 100,
        currency: 'USD',
        description: 'Timeout test transaction',
        timestamp: new Date().toISOString(),
      };

      // Mock AbortController
      const abortController = {
        signal: { aborted: false },
        abort: jest.fn(),
      };
      global.AbortController = jest.fn(() => abortController) as any;

      // Mock fetch to never resolve
      mockFetch.mockImplementationOnce(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => {
              const error = new Error('Timeout');
              error.name = 'AbortError';
              reject(error);
            }, 10);
          })
      );

      // Set a very short timeout
      postingService = new PostingService();
      Object.defineProperty(postingService, 'timeout', { value: 5, writable: true });

      await expect(postingService.postTransaction(transaction)).rejects.toThrow('Timeout');
    });
  });

  describe('cleanup', () => {
    it('should cleanup successfully', async () => {
      const mockResponse = { count: 5 };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as Response);

      const result = await postingService.cleanup();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/cleanup'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should throw error on failed cleanup', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      await expect(postingService.cleanup()).rejects.toThrow('Failed to cleanup');
    });
  });
});

