import { FastifyRequest, FastifyReply } from 'fastify';
import { validateTransaction } from '../../../src/api/middleware/validation';
import { ValidatedTransactionRequest } from '../../../src/api/middleware/validation';

describe('Validation middleware', () => {
  let mockRequest: Partial<FastifyRequest<{ Body: unknown }>>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      body: {},
    };

    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('valid transactions', () => {
    it('should validate a valid transaction', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100.50,
        currency: 'USD',
        description: 'Test transaction',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
      expect(mockRequest.body).toEqual({
        id: 'test-123',
        amount: 100.50,
        currency: 'USD',
        description: 'Test transaction',
        timestamp: expect.any(String),
      });
    });

    it('should validate transaction with different currencies', async () => {
      const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD'];

      for (const currency of currencies) {
        mockRequest.body = {
          id: `test-${currency}`,
          amount: 100,
          currency,
          description: 'Test transaction',
          timestamp: new Date().toISOString(),
        };

        await validateTransaction(
          mockRequest as FastifyRequest<{ Body: unknown }>,
          mockReply as FastifyReply
        );

        expect(mockReply.code).not.toHaveBeenCalled();
        (mockReply.code as jest.Mock).mockClear();
      }
    });

    it('should validate transaction with decimal amounts', async () => {
      mockRequest.body = {
        id: 'decimal-test',
        amount: 99.99,
        currency: 'USD',
        description: 'Decimal amount test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should validate transaction with large amounts', async () => {
      mockRequest.body = {
        id: 'large-amount',
        amount: 999999.99,
        currency: 'USD',
        description: 'Large amount test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should validate transaction with optional metadata', async () => {
      mockRequest.body = {
        id: 'metadata-test',
        amount: 100,
        currency: 'USD',
        description: 'Metadata test',
        timestamp: new Date().toISOString(),
        metadata: { source: 'test', version: 1 },
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).not.toHaveBeenCalled();
    });
  });

  describe('invalid transactions', () => {
    it('should reject transaction with missing id', async () => {
      mockRequest.body = {
        amount: 100,
        currency: 'USD',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
        })
      );
    });

    it('should reject transaction with empty id', async () => {
      mockRequest.body = {
        id: '',
        amount: 100,
        currency: 'USD',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with missing amount', async () => {
      mockRequest.body = {
        id: 'test-123',
        currency: 'USD',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with negative amount', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: -100,
        currency: 'USD',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          details: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining('positive'),
            }),
          ]),
        })
      );
    });

    it('should reject transaction with zero amount', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 0,
        currency: 'USD',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with missing currency', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with invalid currency length', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        currency: 'US', // Should be 3 characters
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with too long currency', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        currency: 'USDD', // Should be 3 characters
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with non-numeric amount', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: '100', // String instead of number
        currency: 'USD',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with missing description', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        currency: 'USD',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with empty description', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        currency: 'USD',
        description: '',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with missing timestamp', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        currency: 'USD',
        description: 'Test',
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject transaction with invalid timestamp format', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: 100,
        currency: 'USD',
        description: 'Test',
        timestamp: 'invalid-date',
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject completely empty body', async () => {
      mockRequest.body = {};

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });

    it('should reject null body', async () => {
      mockRequest.body = null;

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.code).toHaveBeenCalledWith(400);
    });
  });

  describe('error message formatting', () => {
    it('should include validation details in error response', async () => {
      mockRequest.body = {
        id: 'test-123',
        amount: -100,
        currency: 'US',
        description: 'Test',
        timestamp: new Date().toISOString(),
      };

      await validateTransaction(
        mockRequest as FastifyRequest<{ Body: unknown }>,
        mockReply as FastifyReply
      );

      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation failed',
          details: expect.any(Array),
        })
      );
    });
  });
});

