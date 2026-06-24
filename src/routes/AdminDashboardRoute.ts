import { Router } from "express";
import AdminDashboardController from "../controllers/AdminDashboardController";
import AdminDocumentPermissionController from "../controllers/AdminDocumentPermissionController";
import { authenticateToken, requireAdmin } from "../middleware/auth";

const router = Router();

router.use(authenticateToken, requireAdmin);

// Admin dashboard statistics
router.get("/stats", AdminDashboardController.getDashboardStats);

// User roles distribution for chart
router.get("/user-roles", AdminDashboardController.getUserRolesDistribution);

// Recent activity (latest 5 notifications)
router.get("/recent-activity", AdminDashboardController.getRecentActivity);

// All notifications for admin (paginated)
router.get("/notifications", AdminDashboardController.getAllNotifications);

// User management routes
router.get('/users', AdminDashboardController.getAllUsers);
router.get('/users/export', AdminDashboardController.exportUsers);
router.get('/users/:userId', AdminDashboardController.getUserDetails);
router.post('/users/:userId/verify', AdminDashboardController.verifyLawyer);
router.post('/users/:userId/reject', AdminDashboardController.rejectLawyer);
router.patch('/users/:userId/toggle-active', AdminDashboardController.toggleUserActive);
router.patch('/users/:userId/toggle-verified', AdminDashboardController.toggleUserVerified);

// Lawyer verification routes
router.get('/lawyers/pending', AdminDashboardController.getPendingLawyers);

// Transaction management routes
router.get('/transactions', AdminDashboardController.getTransactions);

// Content monitoring routes
router.get('/content', AdminDashboardController.getContentMonitoring);
router.put('/content/:contentId/status', AdminDashboardController.updateContentStatus);

// Admin profile routes
router.get('/profile', AdminDashboardController.getAdminProfile);
router.put('/profile', AdminDashboardController.updateAdminProfile);

// Document permission management
router.get('/documents', AdminDocumentPermissionController.listDocuments);
router.get('/documents/:id/access', AdminDocumentPermissionController.getDocumentAccess);
router.post('/documents/:id/access/grant', AdminDocumentPermissionController.grantAccess);
router.post('/documents/:id/access/revoke', AdminDocumentPermissionController.revokeAccess);
router.patch('/documents/:id/privacy', AdminDocumentPermissionController.updatePrivacy);
router.get('/documents/:id/access-check', AdminDocumentPermissionController.accessCheck);

export default router;
