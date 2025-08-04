import { Router } from "express";
import DocumentController from "../controllers/DocumentController";

const router = Router();

// POST /api/v1/document/upload
router.post("/upload", DocumentController.uploadDocument);

// POST /api/v1/document/upload-with-ai
router.post("/upload-with-ai", DocumentController.uploadDocumentWithAI);

// POST /api/v1/document/upload-with-summary - Upload and return summary immediately
router.post("/upload-with-summary", DocumentController.uploadDocumentWithSummary);

// GET /api/v1/document/list
router.get("/list", DocumentController.listDocuments);

// GET /api/v1/document/client/:clientId - Get all documents for a specific client
router.get("/client/:clientId", DocumentController.getClientDocuments);

// GET /api/v1/document/:id - Get document by ID
router.get("/:id", DocumentController.getDocumentById);

// PUT /api/v1/document/:id/status - Update document status
router.put("/:id/status", DocumentController.updateDocumentStatus);

// DELETE /api/v1/document/:id - Delete document
router.delete("/:id", DocumentController.deleteDocument);

export default router;
