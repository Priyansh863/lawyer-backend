import express from 'express';
import { CaseController } from '../controllers/CaseController';
import authenticate from '../middlewares/authenticate';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Case routes
router.get('/list', CaseController.getAllCases);
router.get('/client/:clientId', CaseController.getClientCases);
router.get('/lawyer/:lawyerId', CaseController.getLawyerCases);
router.get('/:id', CaseController.getCaseById);
router.post('/create', CaseController.createCase);
router.put('/:id', CaseController.updateCase);
router.put('/:id/status', CaseController.updateCaseStatus);
router.delete('/:id', CaseController.deleteCase);

export default router;
