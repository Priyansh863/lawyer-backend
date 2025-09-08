import express from 'express';
import { AIReporterController } from '../controllers/AIReporterController';
import Auth from '../middlewares/auth';

const router = express.Router();

// Middleware to ensure user is AI Reporter
const ensureAIReporter = (req: any, res: any, next: any) => {
  if (req.role !== 'ai_reporter') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. AI Reporter role required.'
    });
  }
  // Add user object for controller access
  req.user = {
    id: req.id,
    account_type: req.role
  };
  next();
};

// AI Reporter Settings Routes
router.get('/settings', Auth, ensureAIReporter, AIReporterController.getSettings);
router.put('/settings', Auth, ensureAIReporter, AIReporterController.updateSettings);

// Article Management Routes
router.get('/articles', Auth, ensureAIReporter, AIReporterController.getGeneratedArticles);
router.get('/articles/:id', Auth, ensureAIReporter, AIReporterController.getArticleById);
router.post('/articles/generate', Auth, ensureAIReporter, AIReporterController.generateArticle);
router.put('/articles/:articleId/publish', Auth, ensureAIReporter, AIReporterController.publishArticle);
router.put('/articles/:articleId/archive', Auth, ensureAIReporter, AIReporterController.archiveArticle);
router.delete('/articles/:articleId', Auth, ensureAIReporter, AIReporterController.deleteArticle);

// Dashboard and Stats
router.get('/dashboard/stats', Auth, ensureAIReporter, AIReporterController.getDashboardStats);

// Utility Routes
router.get('/lawyers', Auth, ensureAIReporter, AIReporterController.getAvailableLawyers);

export default router;
