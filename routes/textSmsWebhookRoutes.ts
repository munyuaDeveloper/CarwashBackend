import express from 'express';
import textSmsCallbackController from '../controllers/textSmsCallbackController';

const router = express.Router();

/** Quick check that ngrok → backend routing works (open in browser or curl). */
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'textsms-webhook',
    timestamp: new Date().toISOString()
  });
});

/** Public webhook for TextSMS delivery reports (configure URL in TextSMS dashboard). */
router.post('/callback', textSmsCallbackController.handleDeliveryCallback);

export default router;
