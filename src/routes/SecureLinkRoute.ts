import { Router } from "express";
import SecureLinkController from "../controllers/SecureLinkController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Generate a secure upload link (lawyer only)
router.post("/generate", authenticateToken, SecureLinkController.generateSecureLink);

// Validate secure link (public - no auth required)
router.get("/validate/:token", SecureLinkController.validateSecureLink);

// Authenticate with password (public - no auth required)
router.post("/authenticate", SecureLinkController.authenticateSecureLink);

// Upload document through secure link (public - uses upload token)
router.post("/upload", SecureLinkController.uploadThroughSecureLink);

// Get lawyer's secure links (lawyer only)
router.get("/my-links", authenticateToken, SecureLinkController.getMySecureLinks);

// Update password for an existing active secure link (lawyer only)
router.patch("/:id/password", authenticateToken, SecureLinkController.updateSecureLinkPassword);

export default router;
