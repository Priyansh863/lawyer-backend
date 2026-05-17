import { Router } from "express";
import AIController from "../controllers/AIController";

const router = Router();

// POST /api/v1/ai/process-document
router.post("/process-document", AIController.processDocument);

// POST /api/v1/ai/process-batch
router.post("/process-batch", AIController.processBatchDocuments);

// GET /api/v1/ai/status/:documentId
router.get("/status/:documentId", AIController.getDocumentStatus);

// POST /api/v1/ai/generate-post
router.post("/generate-post", AIController.generatePost);

export default router;
