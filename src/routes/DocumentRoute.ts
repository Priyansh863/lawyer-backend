import { Router } from "express";
import DocumentController from "../controllers/DocumentController";
import Auth from "../middlewares/auth";

const router = Router();

// POST /api/v1/document/upload
router.post("/upload", Auth, DocumentController.uploadDocument);

// POST /api/v1/document/create-folder - Create a folder entry (no file upload)
router.post("/create-folder", Auth, DocumentController.createFolder);

// POST /api/v1/document/upload-enhanced - Enhanced upload for PDF, Image, Video
router.post("/upload-enhanced", Auth, DocumentController.uploadDocumentEnhanced);

// POST /api/v1/document/upload-with-ai
router.post("/upload-with-ai", Auth, DocumentController.uploadDocumentWithAI);

// POST /api/v1/document/upload-with-summary - Upload and return summary immediately
router.post("/upload-with-summary", Auth, DocumentController.uploadDocumentWithSummary);

// GET /api/v1/document/list
router.get("/list", Auth, DocumentController.listDocuments);

// GET /api/v1/document/sync - Desktop app sync (must be before /:id route)
router.get("/sync", Auth, DocumentController.syncDocuments);
router.post("/sync-local-state", Auth, DocumentController.syncLocalState);
router.post("/bulk-delete", Auth, DocumentController.bulkDeleteDocuments);
router.patch("/bulk-assign-case", Auth, DocumentController.bulkAssignCase);

// POST /api/v1/document/accessible - Get documents accessible by current user (own + shared)
router.post("/accessible", Auth, DocumentController.getAccessibleDocuments);

// GET /api/v1/document/client/:clientId - Get all documents for a specific client
router.get("/client/:clientId", Auth, DocumentController.getClientDocuments);

// GET /api/v1/document/lawyer/:clientId - Get client documents visible to the authenticated lawyer
router.get("/lawyer/:clientId", Auth, DocumentController.getLawyerDocuments);

// GET /api/v1/document/case/:caseId - Get documents for a specific case
router.get("/case/:caseId", Auth, DocumentController.getCaseDocuments);

// POST /api/v1/document/generate-secure-link - Generate a secure link
router.post("/generate-secure-link", Auth, DocumentController.generateSecureLink);

// GET /api/v1/document/:id/view - View document (decompressed base64)
router.get("/:id/view", Auth, DocumentController.viewDocument);
router.get("/view/:id", Auth, DocumentController.viewDocument);

// GET /api/v1/document/:id/download - Download document (decompressed base64)
router.get("/:id/download", Auth, DocumentController.downloadDocument);
router.get("/download/:id", Auth, DocumentController.downloadDocument);

// GET /api/v1/document/:id - Get document by ID
router.get("/:id", Auth, DocumentController.getDocumentById);

// PUT /api/v1/document/:id/status - Update document status
router.put("/:id/status", Auth, DocumentController.updateDocumentStatus);

// PATCH /api/v1/document/:id/storage-type - Update document storage type
router.patch("/:id/storage-type", Auth, DocumentController.updateStorageType);

// PATCH /api/v1/document/:id/remove-cloud - Remove cloud access from document
router.patch("/:id/remove-cloud", Auth, DocumentController.removeFromCloud);
router.delete("/:id/cloud", Auth, DocumentController.removeFromCloud);
router.delete("/:id/local", Auth, DocumentController.removeFromLocal);
router.patch("/:id/remove-app", Auth, DocumentController.removeFromApp);

// DELETE /api/v1/document/:id - Delete document
router.delete("/:id", Auth, DocumentController.deleteDocument);

// === DOCUMENT SHARING & PRIVACY ROUTES ===

// POST /api/v1/document/:documentId/share - Share document with lawyers
router.post("/:documentId/share", Auth, DocumentController.shareDocument);

// POST /api/v1/document/:documentId/unshare - Unshare document from lawyer
router.post("/:documentId/unshare", Auth, DocumentController.unshareDocument);

// PUT /api/v1/document/:documentId/privacy - Update document privacy
router.put("/:documentId/privacy", Auth, DocumentController.updateDocumentPrivacy);

// POST /api/v1/document/lawyers-for-sharing - Get lawyers available for sharing
router.post("/lawyers-for-sharing", Auth, DocumentController.getLawyersForSharing);

// POST /api/v1/document/:documentId/sharing-details - Get document sharing details
router.post("/:documentId/sharing-details", Auth, DocumentController.getDocumentSharingDetails);

router.post("/users-for-sharing", Auth, DocumentController.getUsersForSharing);

export default router;
