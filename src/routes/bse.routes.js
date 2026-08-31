import { Router } from 'express';
import { bseController } from '../controllers/bse.controller.js';

const router = Router();

router.post('/corporate-announcements', (req, res) =>
  bseController.getCorporateAnnouncements(req, res),
);

export default router;
