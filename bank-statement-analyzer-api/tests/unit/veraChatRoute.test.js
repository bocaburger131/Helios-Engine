import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../src/middleware/auth.js', () => ({
  authenticateToken: (req, _res, next) => {
    req.user = { id: 'u1', email: 'test@example.com' };
    next();
  }
}));

const chatWithVera = vi.fn();

vi.mock('../../src/services/ai/gemini.js', () => ({
  chatWithVera: (...args) => chatWithVera(...args),
  VeraChatConfigError: class VeraChatConfigError extends Error {
    constructor(message) {
      super(message);
      this.code = 'VERA_CHAT_NO_KEY';
    }
  },
  VeraChatUpstreamError: class VeraChatUpstreamError extends Error {
    constructor(message) {
      super(message);
      this.code = 'VERA_CHAT_UPSTREAM';
    }
  }
}));

vi.mock('../../src/utils/logger.js', () => ({
  default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

describe('POST /api/vera/chat route', () => {
  let app;

  beforeEach(async () => {
    chatWithVera.mockReset();
    const veraRoutes = (await import('../../src/routes/veraRoutes.js')).default;
    app = express();
    app.use(express.json());
    app.use('/api/vera', veraRoutes);
  });

  it('returns 400 when message missing', async () => {
    const res = await request(app).post('/api/vera/chat').send({ dealContext: {} });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(chatWithVera).not.toHaveBeenCalled();
  });

  it('returns 200 with answer shape', async () => {
    chatWithVera.mockResolvedValue({
      answer: 'ADB looks stable.',
      model: 'gemini-2.5-flash',
      grounding: { used: false, sources: [] }
    });

    const res = await request(app)
      .post('/api/vera/chat')
      .send({
        message: 'What is ADB?',
        dealContext: { companyName: 'Acme' },
        history: []
      });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        answer: 'ADB looks stable.',
        model: 'gemini-2.5-flash',
        grounding: { used: false, sources: [] }
      }
    });
    expect(chatWithVera).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'What is ADB?',
        dealContext: { companyName: 'Acme' }
      })
    );
  });

  it('returns 503 when Gemini key missing', async () => {
    const { VeraChatConfigError } = await import('../../src/services/ai/gemini.js');
    chatWithVera.mockRejectedValue(new VeraChatConfigError('no key'));

    const res = await request(app).post('/api/vera/chat').send({ message: 'hi' });
    expect(res.status).toBe(503);
  });
});
