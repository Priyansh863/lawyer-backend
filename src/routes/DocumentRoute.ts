import { Router } from "express";
import DocumentController from "../controllers/DocumentController";

const router = Router();

// POST /api/v1/document/upload
router.post("/upload", DocumentController.uploadDocument);

// POST /api/v1/document/upload-enhanced - Enhanced upload for PDF, Image, Video
router.post("/upload-enhanced", DocumentController.uploadDocumentEnhanced);

// POST /api/v1/document/upload-with-ai
router.post("/upload-with-ai", DocumentController.uploadDocumentWithAI);

// POST /api/v1/document/upload-with-summary - Upload and return summary immediately
router.post("/upload-with-summary", DocumentController.uploadDocumentWithSummary);

// GET /api/v1/document/list
router.get("/list", DocumentController.listDocuments);

export default router;
