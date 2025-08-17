import express from 'express';
import * as PolicyController from '../controllers/PolicyController';
import { createPolicyValidation, updatePolicyValidation } from '../validationSchema/additionalValidations';

const router = express.Router();

router.post('/', createPolicyValidation, PolicyController.createPolicy);
router.get('/', PolicyController.getAllPolicies);
router.get('/:id', PolicyController.getPolicyById);
router.put('/:id', updatePolicyValidation, PolicyController.updatePolicy);
router.delete('/:id', PolicyController.deletePolicy);

export default router;
