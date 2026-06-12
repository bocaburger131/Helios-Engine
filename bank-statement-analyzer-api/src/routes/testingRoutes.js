import express from 'express';

const router = express.Router();

router.get('/auth-status', (_req, res) => {
  res.json({
    authDisabled: process.env.DISABLE_AUTH === 'true',
    apiKeyDisabled: process.env.DISABLE_API_KEY === 'true' ||
      (process.env.DISABLE_API_KEY_AUTH || '').toLowerCase() === 'true',
  });
});

export default router;
