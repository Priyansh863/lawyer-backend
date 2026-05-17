import express from 'express';
import { NotificationController } from '../controllers/notificationController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const notificationController = new NotificationController();

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all notifications for user
router.get('/', notificationController.getNotifications);

// Get unread notification count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark notification as read
router.patch('/:notificationId/read', notificationController.markAsRead);

// Mark all notifications as read
router.patch('/mark-all-read', notificationController.markAllAsRead);

// Delete notification
router.delete('/:notificationId', notificationController.deleteNotification);

// Create notification (admin/system use)
router.post('/', notificationController.createNotification);

export default router;
