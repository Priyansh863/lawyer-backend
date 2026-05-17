import express from 'express';
import * as ContentMonitoringController from '../controllers/ContentMonitoringController';
import { createContentValidation, updateContentValidation } from '../validationSchema/additionalValidations';

const router = express.Router();

router.post('/', createContentValidation, ContentMonitoringController.createContent);
router.get('/', ContentMonitoringController.getAllContents);
router.get('/:id', ContentMonitoringController.getContentById);
router.put('/:id', updateContentValidation, ContentMonitoringController.updateContent);
router.delete('/:id', ContentMonitoringController.deleteContent);

export default router;
