import { Router } from 'express';
import { mediaController } from '../controllers/media.controller.js';

const router = Router();

router.post('/analyze', mediaController.analyzeMedia);

export default router;
