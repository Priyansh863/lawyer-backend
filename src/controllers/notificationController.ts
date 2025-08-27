import { Request, Response } from 'express';
import Notification from '../models/Notification';

export class NotificationController {
  // Get all notifications for a user
  async getNotifications(req: any, res: Response) {
    try {
      const userId = req.user?.userId;
      console.log(userId,"userIduserIduserIduserIduserIduserIduserId");
      const { page = 1, limit = 20, unreadOnly = false } = req.query;

      const query: any = { userId };
      if (unreadOnly === 'true') {
        query.isRead = false;
      }

      const notifications = await Notification.find(query)
        .populate('createdBy', 'first_name last_name account_type')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.getUnreadCount(userId);

      res.json({
        success: true,
        notifications,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        },
        unreadCount
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  // Get unread notification count
  async getUnreadCount(req: any, res: Response) {
    try {
      const userId = req.user?.userId;
      const count = await Notification.getUnreadCount(userId);

      res.json({
        success: true,
        count
      });
    } catch (error) {
      console.error('Error fetching unread count:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch unread count'
      });
    }
  }

  // Mark notification as read
  async markAsRead(req: any, res: Response) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.userId;

      const notification = await Notification.findOne({
        _id: notificationId,
        userId
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.markAsRead();

      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  }

  // Mark all notifications as read
  async markAllAsRead(req: any, res: Response) {
    try {
      const userId = req.user?.userId;
      await Notification.markAllAsRead(userId);

      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mark all notifications as read'
      });
    }
  }

  // Delete notification
  async deleteNotification(req: any, res: Response) {
    try {
      const { notificationId } = req.params;
      const userId = req.user?.userId;

      const result = await Notification.findOneAndDelete({
        _id: notificationId,
        userId
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      res.json({
        success: true,
        message: 'Notification deleted'
      });
    } catch (error) {
      console.error('Error deleting notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }
  }

  // Create notification (admin/system use)
  async createNotification(req: any, res: Response) {
    try {
      const {
        userId,
        title,
        message,
        type,
        relatedId,
        relatedType,
        redirectUrl,
        priority = 'medium',
        metadata = {}
      } = req.body;

      const notification = new Notification({
        userId,
        title,
        message,
        type,
        relatedId,
        relatedType,
        redirectUrl,
        priority,
        metadata,
        createdBy: req.user?.userId
      });

      await notification.save();

      res.status(201).json({
        success: true,
        notification,
        message: 'Notification created successfully'
      });
    } catch (error) {
      console.error('Error creating notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create notification'
      });
    }
  }
}
