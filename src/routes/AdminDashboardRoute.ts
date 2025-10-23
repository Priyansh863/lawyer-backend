import { Router } from "express";
import AdminDashboardController from "../controllers/AdminDashboardController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Admin dashboard statistics
router.get("/stats", authenticateToken, AdminDashboardController.getDashboardStats);

// User roles distribution for chart
router.get("/user-roles", authenticateToken, AdminDashboardController.getUserRolesDistribution);

// Recent activity (latest 5 notifications)
router.get("/recent-activity", authenticateToken, AdminDashboardController.getRecentActivity);

// All notifications for admin (paginated)
router.get("/notifications", authenticateToken, AdminDashboardController.getAllNotifications);

// User management routes
router.get('/users', authenticateToken, AdminDashboardController.getAllUsers);
router.get('/users/export', authenticateToken, AdminDashboardController.exportUsers);
router.get('/users/:userId', authenticateToken, AdminDashboardController.getUserDetails);
router.post('/users/:userId/verify', authenticateToken, AdminDashboardController.verifyLawyer);
router.post('/users/:userId/reject', authenticateToken, AdminDashboardController.rejectLawyer);
router.patch('/users/:userId/toggle-active', authenticateToken, AdminDashboardController.toggleUserActive);
router.patch('/users/:userId/toggle-verified', authenticateToken, AdminDashboardController.toggleUserVerified);

// Lawyer verification routes
router.get('/lawyers/pending', authenticateToken, AdminDashboardController.getPendingLawyers);

// Transaction management routes
router.get('/transactions', authenticateToken, AdminDashboardController.getTransactions);

// Content monitoring routes
router.get('/content', authenticateToken, AdminDashboardController.getContentMonitoring);
router.put('/content/:contentId/status', authenticateToken, AdminDashboardController.updateContentStatus);

// Admin profile routes
router.get('/profile', authenticateToken, AdminDashboardController.getAdminProfile);
router.put('/profile', authenticateToken, AdminDashboardController.updateAdminProfile);

export default router;
