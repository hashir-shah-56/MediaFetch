import { Router } from 'express';
import { downloadController } from '../controllers/download.controller.js';

const router = Router();

router.post('/download', downloadController.downloadMedia);

export default router;
