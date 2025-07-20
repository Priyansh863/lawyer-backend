import { Router } from "express";
import DocumentController from "../controllers/DocumentController";

const router = Router();

// POST /api/v1/document/upload
router.post("/upload", DocumentController.uploadDocument);
router.get("/list", DocumentController.listDocuments);

export default router;
