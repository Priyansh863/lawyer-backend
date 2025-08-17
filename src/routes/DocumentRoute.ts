import { Router } from "express";
import DocumentController from "../controllers/DocumentController";
import Auth from "../middlewares/auth";

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
router.get("/list", Auth,DocumentController.listDocuments);

// POST /api/v1/document/accessible - Get documents accessible by current user (own + shared)
router.post("/accessible", DocumentController.getAccessibleDocuments);

// GET /api/v1/document/client/:clientId - Get all documents for a specific client
router.get("/client/:clientId", DocumentController.getClientDocuments);

// GET /api/v1/document/:id - Get document by ID
router.get("/:id", DocumentController.getDocumentById);

// PUT /api/v1/document/:id/status - Update document status
router.put("/:id/status", DocumentController.updateDocumentStatus);

// DELETE /api/v1/document/:id - Delete document
router.delete("/:id", DocumentController.deleteDocument);

// === DOCUMENT SHARING & PRIVACY ROUTES ===

// POST /api/v1/document/:documentId/share - Share document with lawyers
router.post("/:documentId/share", DocumentController.shareDocument);

// POST /api/v1/document/:documentId/unshare - Unshare document from lawyer
router.post("/:documentId/unshare", DocumentController.unshareDocument);

// PUT /api/v1/document/:documentId/privacy - Update document privacy
router.put("/:documentId/privacy", DocumentController.updateDocumentPrivacy);

// POST /api/v1/document/lawyers-for-sharing - Get lawyers available for sharing
router.post("/lawyers-for-sharing", DocumentController.getLawyersForSharing);

// POST /api/v1/document/:documentId/sharing-details - Get document sharing details
router.post("/:documentId/sharing-details", DocumentController.getDocumentSharingDetails);

router.post("/users-for-sharing", DocumentController.getUsersForSharing);

// Add this line in DocumentRoute.ts after line 26:
router.get("/case/:caseId", DocumentController.getCaseDocuments);


export default router;
