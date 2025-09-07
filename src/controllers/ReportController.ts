import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Report from '../models/Report';
import Post from '../models/Post';

interface AuthRequest extends Request {
  user?: {
    id: string;
    userId: string;
    role: string;
  };
}

export class ReportController {
  // Create a new report
  static async createReport(req: any, res: Response) {
    try {
      const { postId, reason } = req.body;
      const userId = req?.id;

   

      if (reason.trim().length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Reason must be at least 10 characters long'
        });
      }

      // Check if post exists
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      // Check if user has already reported this post
      const existingReport = await Report.findOne({ userId, postId });
      if (existingReport) {
        return res.status(400).json({
          success: false,
          message: 'You have already reported this post'
        });
      }

      // Create the report
      const report = new Report({
        userId,
        postId,
        reason: reason.trim()
      });

      await report.save();

      res.status(201).json({
        success: true,
        message: 'Report submitted successfully. We will review it shortly.',
        data: {
          reportId: report._id,
          status: report.status
        }
      });
    } catch (error) {
      console.error('Error creating report:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user's reports
  static async getUserReports(req: any, res: Response) {
    try {
      const userId = req?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User not authenticated'
        });
      }

      const reports = await Report.find({ userId })
        .populate({
          path: 'postId',
          select: 'title slug author createdAt'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Report.countDocuments({ userId });

      res.status(200).json({
        success: true,
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting user reports:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Admin: Get all reports
  static async getAllReports(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const skip = (page - 1) * limit;

      // Build filter
      const filter: any = {};
      if (status && ['pending', 'reviewed', 'resolved', 'dismissed'].includes(status)) {
        filter.status = status;
      }

      const reports = await Report.find(filter)
        .populate({
          path: 'userId',
          select: 'first_name last_name email'
        })
        .populate({
          path: 'postId',
          select: 'title slug author createdAt'
        })
        .populate({
          path: 'reviewedBy',
          select: 'first_name last_name email'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Report.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          reports,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting all reports:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Admin: Update report status
  static async updateReportStatus(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role;
      const userId = req.user?.id;
      
      if (userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      const { reportId } = req.params;
      const { status, adminNotes } = req.body;

      if (!['reviewed', 'resolved', 'dismissed'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be: reviewed, resolved, or dismissed'
        });
      }

      const report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'Report not found'
        });
      }

      // Update report
      report.status = status;
      report.reviewedBy = new mongoose.Types.ObjectId(userId);
      report.reviewedAt = new Date();
      if (adminNotes) {
        report.adminNotes = adminNotes.trim();
      }

      await report.save();

      res.status(200).json({
        success: true,
        message: 'Report status updated successfully',
        data: {
          reportId: report._id,
          status: report.status,
          reviewedAt: report.reviewedAt
        }
      });
    } catch (error) {
      console.error('Error updating report status:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get report statistics (for admin dashboard)
  static async getReportStats(req: AuthRequest, res: Response) {
    try {
      const userRole = req.user?.role;
      if (userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      const stats = await Report.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]);

      const totalReports = await Report.countDocuments();
      const recentReports = await Report.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      });

      const formattedStats = {
        total: totalReports,
        recent: recentReports,
        byStatus: stats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {} as Record<string, number>)
      };

      res.status(200).json({
        success: true,
        data: formattedStats
      });
    } catch (error) {
      console.error('Error getting report stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
