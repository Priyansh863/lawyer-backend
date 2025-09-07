import express from 'express';
import { ReportController } from '../controllers/ReportController';
import { authenticateToken } from '../middleware/auth';
import Auth from '../middlewares/auth';

const router = express.Router();

// Create a new report
router.post('/create', Auth, ReportController.createReport);

// Get user's reports
router.get('/user', Auth, ReportController.getUserReports);

// Admin routes
router.get('/admin/all', Auth, ReportController.getAllReports);
router.put('/admin/:reportId/status', Auth, ReportController.updateReportStatus);
router.get('/admin/stats', Auth, ReportController.getReportStats);

export default router;
