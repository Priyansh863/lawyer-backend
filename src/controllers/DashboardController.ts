import { Request, Response } from "express";
import Case, { CaseStatus } from "../models/case";
import Meeting, { EMeetingStatus } from "../models/meeting";
import Notification from "../models/Notification";
import UserDocument, { DocumentStatus } from "../models/user_documents";
import UserActivity from "../models/user_activity";
import { UserTokenBalance } from "../models/token";
import mongoose from "mongoose";

export default class DashboardController {
  /**
   * Existing summary method
   */
  static async getSummary(req: Request, res: Response) {
    try {
      const userId = req["id"];
      const userObjectId = new mongoose.Types.ObjectId(userId);

      const caseSummary = await Case.aggregate([
        {
          $match: {
            $or: [{ lawyer_id: userObjectId }, { client_id: userObjectId }]
          }
        },
        {
          $group: {
            _id: "$status",
            total: { $sum: 1 }
          }
        }
      ]);

      let activeCases = 0;
      let inactiveCases = 0;

      caseSummary.forEach((item) => {
        if (!["dismissal", "rejection", "withdrawal", "suspension", "closure", "full_win", "full_loss", "partial_win", "partial_loss"].includes(item._id)) {
          activeCases += item.total;
        } else {
          inactiveCases += item.total;
        }
      });

      res.status(200).json({
        success: true,
        data: [
          { title: "Active Cases", value: activeCases, icon: "FileText" },
          { title: "Inactive Cases", value: inactiveCases, icon: "FileArchive" },
        ],
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to fetch dashboard summary", error });
    }
  }

  /**
   * Unified dashboard stats endpoint
   * GET /api/dashboard/stats
   */
  static async getStats(req: Request, res: Response) {
    try {
      const userId = req["id"];
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const userObjectId = new mongoose.Types.ObjectId(userId);

      // Define "today" range
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date();
      endOfDay.setHours(23, 59, 59, 999);

      // Fetch all stats in parallel
      const [
        ongoingCasesCount,
        todayConsultationsCount,
        unreadNotificationsCount,
        unreviewedDocumentsCount,
        latestActivities,
        notifActivities,
        tokenData
      ] = await Promise.all([
        // 1. Ongoing Cases
        Case.countDocuments({
          $or: [{ lawyer_id: userObjectId }, { client_id: userObjectId }],
          status: { $in: [CaseStatus.IN_PROGRESS, CaseStatus.PENDING] }
        }),

        // 2. Today's Consultations
        Meeting.countDocuments({
          $and: [
            { $or: [{ lawyer_id: userObjectId }, { client_id: userObjectId }] },
            {
              $or: [
                { requested_date: { $gte: startOfDay, $lte: endOfDay } },
                { scheduled_date: { $gte: startOfDay, $lte: endOfDay } },
                { start_time: { $gte: startOfDay, $lte: endOfDay } }
              ]
            }
          ]
        }),

        // 3. Unread Notifications
        Notification.countDocuments({
          userId: userObjectId,
          isRead: false
        }),

        // 4. Unreviewed Documents
        UserDocument.countDocuments({
          $or: [{ uploaded_by: userObjectId }, { shared_with: userObjectId }],
          status: DocumentStatus.PENDING
        }),

        // 5. Activities (Combine UserActivity and Notifications as fallback)
        UserActivity.find({ user_id: userObjectId })
          .sort({ created_at: -1 })
          .limit(10)
          .populate('user_id', 'first_name last_name email'),

        Notification.find({ userId: userObjectId })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('createdBy', 'first_name last_name email'),

        // 6. Tokens
        UserTokenBalance.findOne({ user_id: userObjectId })
      ]);

      // Process and combine activities
      const processedActivities = latestActivities.map((activity: any) => {
        let type = 'client';
        const name = activity.activity_name.toLowerCase();
        if (name.includes('document') || name.includes('file')) type = 'document';
        else if (name.includes('consultation') || name.includes('meeting') || name.includes('appointment')) type = 'consultation';

        const user = activity.user_id && typeof activity.user_id === 'object'
          ? `${(activity.user_id as any).first_name || ''} ${(activity.user_id as any).last_name || ''}`.trim()
          : 'System';

        return {
          type,
          title: activity.activity_name,
          user: user || 'Anonymous',
          time: activity.created_at,
          source: 'activity'
        };
      });

      // Process notifications into activities
      const processedNotifications = notifActivities.map((notif: any) => {
        let type = 'client';
        const relType = notif.relatedType;
        if (relType === 'document') type = 'document';
        else if (['meeting', 'chat'].includes(relType)) type = 'consultation';

        const user = notif.createdBy && typeof notif.createdBy === 'object'
          ? `${(notif.createdBy as any).first_name || ''} ${(notif.createdBy as any).last_name || ''}`.trim()
          : 'System';

        return {
          type,
          title: notif.title,
          user: user || 'Anonymous',
          time: notif.createdAt || notif.created_at,
          source: 'notification'
        };
      });

      // Combine and sort by time, limit to 10
      const combinedActivities = [...processedActivities, ...processedNotifications]
        .filter(item => item.time) // Ensure time exists
        .sort((a, b) => {
          const timeA = a.time instanceof Date ? a.time.getTime() : new Date(a.time).getTime();
          const timeB = b.time instanceof Date ? b.time.getTime() : new Date(b.time).getTime();
          return timeB - timeA;
        })
        .slice(0, 10)
        .map(item => ({
          ...item,
          time: item.time instanceof Date ? item.time.toISOString() : new Date(item.time).toISOString()
        }));

      const formattedActivities = combinedActivities;

      // Token logic
      const tokenBalance = tokenData ? (tokenData as any).current_balance : 0;
      const tokenValueUSD = tokenBalance * 0.01; // Assuming 0.01 per token as default

      res.status(200).json({
        success: true,
        stats: {
          ongoingCases: ongoingCasesCount,
          todayConsultations: todayConsultationsCount,
          unreadNotifications: unreadNotificationsCount,
          unreviewedDocuments: unreviewedDocumentsCount
        },
        activities: formattedActivities,
        tokens: {
          balance: tokenBalance,
          valueUSD: tokenValueUSD
        }
      });
    } catch (error: any) {
      console.error("Dashboard stats error:", error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard stats",
        error: error.message
      });
    }
  }
}

