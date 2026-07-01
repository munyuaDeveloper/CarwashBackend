import express from 'express';
import mpesaCallbackController from '../controllers/mpesaCallbackController';

const router = express.Router();

router.get('/health', mpesaCallbackController.health);
router.post('/stk-callback', mpesaCallbackController.handleStkCallback);

export default router;
