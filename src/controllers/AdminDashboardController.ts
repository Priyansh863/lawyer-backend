import { Request, Response } from "express";
import { User } from "../models/user";
import Case from "../models/case";
import Meeting from "../models/meeting";
import Notification from "../models/Notification";
import Blog from "../models/blog";
import Post from "../models/Post";
import { Payment } from "../models/payment";
import Helper from "../utils/helper";


export default class AdminDashboardController {
  // Get admin dashboard statistics
  static async getDashboardStats(req: Request, res: Response) {
    try {
      // Get total users count
      const totalUsers = await User.countDocuments({ account_type: { $ne: 'admin' } });

      // Get regular users (clients) count
      const regularUsers = await User.countDocuments({ account_type: 'client' });

      // Get verified lawyers count
      const verifiedLawyers = await User.countDocuments({
        account_type: 'lawyer',
        is_verified: true
      });

      // Get today's blog/article count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const blogsToday = await Blog.countDocuments({
        created_at: { $gte: today, $lt: tomorrow }
      });

      const postsToday = await Post.countDocuments({
        created_at: { $gte: today, $lt: tomorrow }
      });

      const totalContentToday = blogsToday + postsToday;

      // Get total tokens transacted (using fallback value for now)
      const tokensTransacted = 1200; // Default fallback value

      res.status(200).json({
        success: true,
        data: {
          totalUsers,
          regularUsers,
          verifiedLawyers,
          contentToday: totalContentToday,
          tokensTransacted
        }
      });
    } catch (error) {
      console.error('Error fetching admin dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch dashboard statistics",
        error: error.message
      });
    }
  }

  // Get user roles distribution for chart (only clients and lawyers)
  static async getUserRolesDistribution(req: Request, res: Response) {
    try {
      const roleDistribution = await User.aggregate([
        {
          $match: { account_type: { $in: ['client', 'lawyer'] } }
        },
        {
          $group: {
            _id: "$account_type",
            count: { $sum: 1 }
          }
        }
      ]);

      // Calculate percentages
      const totalUsers = roleDistribution.reduce((sum, role) => sum + role.count, 0);
      const distributionWithPercentages = roleDistribution.map(role => ({
        role: role._id,
        count: role.count,
        percentage: Math.round((role.count / totalUsers) * 100)
      }));

      res.status(200).json({
        success: true,
        data: distributionWithPercentages
      });
    } catch (error) {
      console.error('Error fetching user roles distribution:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch user roles distribution",
        error: error.message
      });
    }
  }

  // Get recent activity from notifications (latest 5 records)
  static async getRecentActivity(req: Request, res: Response) {
    try {
      const recentNotifications = await Notification.find({})
        .populate('userId', 'first_name last_name account_type')
        .populate('createdBy', 'first_name last_name account_type')
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title message type createdAt userId createdBy');

      // Format the notifications for admin dashboard
      const formattedActivity = recentNotifications.map(notification => {
        const user = notification.userId as any;
        const creator = notification.createdBy as any;

        return {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          user: user ? {
            name: `${user.first_name} ${user.last_name}`,
            accountType: user.account_type,
            initials: `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`
          } : null,
          creator: creator ? {
            name: `${creator.first_name} ${creator.last_name}`,
            accountType: creator.account_type
          } : null
        };
      });

      res.status(200).json({
        success: true,
        data: formattedActivity
      });
    } catch (error) {
      console.error('Error fetching recent activity:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch recent activity",
        error: error.message
      });
    }
  }

  // Get all notifications for admin (paginated)
  static async getAllNotifications(req: Request, res: Response) {
    try {
      const { page = 1, limit = 20, type = 'all' } = req.query;

      const query: any = {};
      if (type !== 'all') {
        query.type = type;
      }

      const notifications = await Notification.find(query)
        .populate('userId', 'first_name last_name account_type')
        .populate('createdBy', 'first_name last_name account_type')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip((Number(page) - 1) * Number(limit));

      const total = await Notification.countDocuments(query);

      const formattedNotifications = notifications.map(notification => {
        const user = notification.userId as any;
        const creator = notification.createdBy as any;

        return {
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          isRead: notification.isRead,
          priority: notification.priority,
          user: user ? {
            id: user._id,
            name: `${user.first_name} ${user.last_name}`,
            accountType: user.account_type
          } : null,
          creator: creator ? {
            id: creator._id,
            name: `${creator.first_name} ${creator.last_name}`,
            accountType: creator.account_type
          } : null
        };
      });

      res.status(200).json({
        success: true,
        data: formattedNotifications,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching all notifications:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch notifications",
        error: error.message
      });
    }
  }

  // Get all users with search and filtering
  static async getAllUsers(req: Request, res: Response) {
    try {
      const { search = '', status = 'all', role = 'all' } = req.query;

      const query: any = {};

      // Search by name or email
      if (search) {
        query.$or = [
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      // Filter by role
      if (role !== 'all') {
        query.account_type = role;
      }

      // Filter by status (for lawyers)
      if (status !== 'all' && status === 'verified') {
        query.is_verified = true;
      } else if (status !== 'all' && status === 'pending') {
        query.is_verified = false;
      }

      const users = await User.find(query)
        .select('first_name last_name email account_type is_verified created_at profile_image is_active')
        .sort({ created_at: -1 });

      const formattedUsers = users.map(user => ({
        id: user._id,
        name: user.first_name ? `${user.first_name} ${user.last_name}` : 'N/A',
        email: user.email,
        is_active: user.is_active,
        is_verified: user.is_verified,
        role: user.account_type,
        status: user.account_type === 'lawyer' ? (user.is_verified ? 'verified' : 'pending') : 'active',
        registeredOn: user.created_at,
        avatar: user.profile_image || null,
        initials: user.first_name ? `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}` : 'N/A'
      }));

      console.log('Formatted Users:', formattedUsers);

      res.status(200).json({
        success: true,
        data: formattedUsers
      });
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch users",
        error: error.message
      });
    }
  }

  // Verify lawyer
  static async verifyLawyer(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.account_type !== 'lawyer') {
        return res.status(400).json({
          success: false,
          message: 'User is not a lawyer'
        });
      }

      user.is_verified = 1;
      await user.save();

      // Create notification for lawyer verification
      try {
        const notification = new Notification({
          userId: user._id,
          title: 'Lawyer Verification Approved',
          message: 'Your lawyer profile has been verified and approved by admin.',
          type: 'lawyer_verification',
          priority: 'high',
          createdBy: (req as any).user?.userId
        });
        await notification.save();
      } catch (notificationError) {
        console.log('Failed to create notification:', notificationError);
      }

      res.status(200).json({
        success: true,
        message: 'Lawyer verified successfully'
      });
    } catch (error) {
      console.error('Error verifying lawyer:', error);
      res.status(500).json({
        success: false,
        message: "Failed to verify lawyer",
        error: error.message
      });
    }
  }

  // Reject lawyer verification
  static async rejectLawyer(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { reason = 'Verification rejected by admin' } = req.body;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      if (user.account_type !== 'lawyer') {
        return res.status(400).json({
          success: false,
          message: 'User is not a lawyer'
        });
      }

      user.is_verified = 0;
      await user.save();

      // Create notification for lawyer rejection
      try {
        const notification = new Notification({
          userId: user._id,
          title: 'Lawyer Verification Rejected',
          message: reason,
          type: 'lawyer_verification',
          priority: 'high',
          createdBy: (req as any).user?.userId
        });
        await notification.save();
      } catch (notificationError) {
        console.log('Failed to create notification:', notificationError);
      }

      res.status(200).json({
        success: true,
        message: 'Lawyer verification rejected'
      });
    } catch (error) {
      console.error('Error rejecting lawyer:', error);
      res.status(500).json({
        success: false,
        message: "Failed to reject lawyer",
        error: error.message
      });
    }
  }

  // Get detailed user information
  static async getUserDetails(req: Request, res: Response) {
    try {
      const { userId } = req.params;

      const user = await User.findById(userId).select('-password -otp');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Get user's notifications
      const notifications = await Notification.find({ userId: user._id })
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('createdBy', 'first_name last_name account_type');

      // Get user's activity stats based on account type
      let activityStats = {};

      if (user.account_type === 'lawyer') {
        // For lawyers, get cases and meetings stats
        const totalCases = await Case.countDocuments({ lawyer_id: user._id });
        const activeCases = await Case.countDocuments({ lawyer_id: user._id, status: 'active' });
        const totalMeetings = await Meeting.countDocuments({ lawyer_id: user._id });
        const completedMeetings = await Meeting.countDocuments({ lawyer_id: user._id, status: 'completed' });

        activityStats = {
          totalCases,
          activeCases,
          totalMeetings,
          completedMeetings
        };
      } else if (user.account_type === 'client') {
        // For clients, get cases and meetings as client
        const totalCases = await Case.countDocuments({ client_id: user._id });
        const activeCases = await Case.countDocuments({ client_id: user._id, status: 'active' });
        const totalMeetings = await Meeting.countDocuments({ client_id: user._id });
        const completedMeetings = await Meeting.countDocuments({ client_id: user._id, status: 'completed' });

        activityStats = {
          totalCases,
          activeCases,
          totalMeetings,
          completedMeetings
        };
      }

      const userDetails = {
        id: user._id,
        personalInfo: {
          firstName: user.first_name,
          lastName: user.last_name,
          email: user.email,
          phone: user.phone,
          profileImage: user.profile_image,
          accountType: user.account_type,
          isActive: user.is_active,
          isVerified: user.is_verified,
          isProfileCompleted: user.is_profile_completed
        },
        accountDetails: {
          registeredOn: user.created_at,
          lastUpdated: user.updated_at,
          fcmToken: user.fcm_token ? 'Available' : 'Not Available'
        },
        activityStats,
        recentNotifications: notifications.map(notification => ({
          id: notification._id,
          title: notification.title,
          message: notification.message,
          type: notification.type,
          priority: notification.priority,
          isRead: notification.isRead,
          createdAt: (notification as any).createdAt,
          createdBy: notification.createdBy ? {
            name: `${(notification.createdBy as any).first_name} ${(notification.createdBy as any).last_name}`,
            accountType: (notification.createdBy as any).account_type
          } : null
        }))
      };

      res.status(200).json({
        success: true,
        data: userDetails
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Toggle user active status
  static async toggleUserActive(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { is_active } = req.body;

      if (typeof is_active !== 'number' || (is_active !== 0 && is_active !== 1)) {
        return res.status(400).json({
          success: false,
          message: 'is_active must be 0 or 1'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Prevent deactivating admin users
      if (user.account_type === 'admin') {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify admin user status'
        });
      }

      await User.findByIdAndUpdate(userId, {
        is_active,
        updated_at: new Date()
      });

      // Create notification for status change
      try {
        const notification = new Notification({
          userId: user._id,
          title: is_active === 1 ? 'Account Activated' : 'Account Deactivated',
          message: is_active === 1
            ? 'Your account has been activated by an administrator'
            : 'Your account has been deactivated by an administrator',
          type: 'account_status',
          priority: 'high',
          createdBy: (req as any).user?.userId
        });
        await notification.save();
      } catch (notificationError) {
        console.log('Failed to create notification:', notificationError);
      }

      res.status(200).json({
        success: true,
        message: `User ${is_active === 1 ? 'activated' : 'deactivated'} successfully`
      });
    } catch (error) {
      console.error('Error toggling user active status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user status',
        error: error.message
      });
    }
  }

  // Toggle user verified status
  static async toggleUserVerified(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const { is_verified } = req.body;

      if (typeof is_verified !== 'number' || (is_verified !== 0 && is_verified !== 1)) {
        return res.status(400).json({
          success: false,
          message: 'is_verified must be 0 or 1'
        });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Prevent modifying admin users
      if (user.account_type === 'admin') {
        return res.status(400).json({
          success: false,
          message: 'Cannot modify admin user verification status'
        });
      }

      await User.findByIdAndUpdate(userId, {
        is_verified,
        updated_at: new Date()
      });

      // Create notification for verification status change
      try {
        const notification = new Notification({
          userId: user._id,
          title: is_verified === 1 ? 'Account Verified' : 'Account Unverified',
          message: is_verified === 1
            ? 'Your account has been verified by an administrator'
            : 'Your account verification has been removed by an administrator',
          type: 'account_verification',
          priority: 'high',
          createdBy: (req as any).user?.userId
        });
        await notification.save();
      } catch (notificationError) {
        console.log('Failed to create notification:', notificationError);
      }

      res.status(200).json({
        success: true,
        message: `User ${is_verified === 1 ? 'verified' : 'unverified'} successfully`
      });
    } catch (error) {
      console.error('Error toggling user verified status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update user verification status',
        error: error.message
      });
    }
  }

  // Get pending lawyers for verification
  static async getPendingLawyers(req: Request, res: Response) {
    try {
      const { search = '', status = 'pending' } = req.query;

      const query: any = {
        account_type: 'lawyer'
      };

      if (status !== 'all') {
        if (status === 'pending') {
          query.is_verified = 0;
        } else if (status === 'verified') {
          query.is_verified = 1;
        }
      }

      if (search) {
        query.$or = [
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const lawyers = await User.find(query)
        .select('-password -otp')
        .sort({ created_at: -1 });

      const formattedLawyers = lawyers.map(lawyer => ({
        id: lawyer._id,
        lawyerId: lawyer._id,
        name: `${lawyer.first_name} ${lawyer.last_name}`,
        email: lawyer.email,
        phone: lawyer.phone,
        profileImage: lawyer.profile_image,
        areaOfPractice: (lawyer as any).area_of_practice || 'Not specified',
        experience: (lawyer as any).experience || 'Not specified',
        submittedOn: lawyer.created_at,
        status: lawyer.is_verified === 1 ? 'verified' : 'pending',
        isActive: lawyer.is_active,
        isProfileCompleted: lawyer.is_profile_completed,
        initials: `${lawyer.first_name?.[0] || ''}${lawyer.last_name?.[0] || ''}`
      }));

      res.status(200).json({
        success: true,
        data: formattedLawyers,
        total: formattedLawyers.length
      });
    } catch (error) {
      console.error('Error fetching pending lawyers:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Export users data
  static async exportUsers(req: Request, res: Response) {
    try {
      const { role = 'all' } = req.query;

      const query: any = {};
      if (role !== 'all') {
        query.account_type = role;
      }

      const users = await User.find(query)
        .select('first_name last_name email account_type is_verified created_at phone')
        .sort({ created_at: -1 });

      const exportData = users.map(user => ({
        Name: `${user.first_name} ${user.last_name}`,
        Email: user.email,
        Role: user.account_type,
        Status: user.account_type === 'lawyer' ? (user.is_verified ? 'Verified' : 'Pending') : 'Active',
        'Registered On': new Date(user.created_at).toLocaleDateString(),
        Phone: user.phone || 'N/A'
      }));

      res.status(200).json({
        success: true,
        data: exportData
      });
    } catch (error) {
      console.error('Error exporting users:', error);
      res.status(500).json({
        success: false,
        message: "Failed to export users",
        error: error.message
      });
    }
  }

  // Get all transactions without pagination
  static async getTransactions(req: Request, res: Response): Promise<void> {
    try {
      const {
        search = '',
        status = '',
        type = '',
        sortBy = 'date',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter: any = {};

      if (search) {
        filter.$or = [
          { 'user.first_name': { $regex: search, $options: 'i' } },
          { 'user.last_name': { $regex: search, $options: 'i' } },
          { 'user.email': { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        filter.status = status;
      }

      if (type) {
        filter.type = type;
      }

      // Get all transactions with user population
      const transactions = await Payment.find(filter)
        .populate('user', 'first_name last_name email')
        .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
        .lean();

      // Calculate statistics
      const totalTokensPurchased = await Payment.aggregate([
        { $match: { status: 'Success', type: 'Purchase' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tokensUsedToday = await Payment.aggregate([
        { $match: { createdAt: { $gte: today }, status: 'Success' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);

      const activeSubscriptions = await Payment.countDocuments({
        type: 'Subscription',
        status: 'Success'
      });

      const stats = {
        totalTokensPurchased: totalTokensPurchased[0]?.total || 0,
        tokensUsedToday: tokensUsedToday[0]?.total || 0,
        activeSubscriptions
      };

      res.status(200).json({
        success: true,
        data: {
          transactions,
          statistics: stats
        }
      });
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch transactions",
        error: error.message
      });
    }
  }

  // Get content monitoring data (Posts and Blogs) - All data without pagination
  static async getContentMonitoring(req: Request, res: Response) {
    try {
      const {
        search = '',
        status = '',
        type = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Build filter object
      const filter: any = {};

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      if (status) {
        filter.status = status;
      }

      let content: any[] = [];

      // Get Blogs
      if (!type || type === 'blog') {
        const blogs = await Blog.find(filter)
          .populate('author', 'first_name last_name email')
          .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
          .lean();

        const blogsWithType = blogs.map(blog => ({
          _id: blog._id,
          title: blog.title,
          author: blog.author,
          type: 'blog',
          status: blog.status,
          createdAt: blog.createdAt,
          snippet: blog.content?.substring(0, 100) + '...' || ''
        }));

        content = [...content, ...blogsWithType];
      }

      // Get Posts (AI Posts)
      if (!type || type === 'ai-post') {
        const posts = await Post.find(filter)
          .populate('author', 'first_name last_name email')
          .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
          .lean();

        const postsWithType = posts.map(post => ({
          _id: post._id,
          title: post.title,
          author: post.author,
          type: 'ai-post',
          status: post.status,
          createdAt: post.createdAt,
          snippet: post.content?.substring(0, 100) + '...' || ''
        }));

        content = [...content, ...postsWithType];
      }

      if (!type) {
        // Sort mixed content
        content.sort((a, b) => {
          const aDate = new Date(a[sortBy as string]);
          const bDate = new Date(b[sortBy as string]);
          return sortOrder === 'desc' ? bDate.getTime() - aDate.getTime() : aDate.getTime() - bDate.getTime();
        });
      }

      res.status(200).json({
        success: true,
        data: {
          content
        }
      });
    } catch (error) {
      console.error('Error fetching content:', error);
      res.status(500).json({
        success: false,
        message: "Failed to fetch content",
        error: error.message
      });
    }
  }

  // Get admin profile
  static async getAdminProfile(req: Request, res: Response) {
    try {
      const adminId = (req as any).user?.userId;

      const admin = await User.findById(adminId).select('-password');



      res.status(200).json({
        success: true,
        data: admin
      });
    } catch (error) {
      console.error('Error fetching admin profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch admin profile',
        error: error.message
      });
    }
  }

  // Update admin profile
  static async updateAdminProfile(req: Request, res: Response) {
    try {
      const adminId = (req as any).user?.userId;
      const { first_name, last_name, email, phone, profile_image } = req.body;

      const updatedAdmin = await User.findByIdAndUpdate(
        adminId,
        {
          first_name,
          last_name,
          email,
          phone,
          profile_image,
          updatedAt: new Date()
        },
        { new: true, select: '-password' }
      );

      if (!updatedAdmin) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedAdmin
      });
    } catch (error) {
      console.error('Error updating admin profile:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update admin profile',
        error: error.message
      });
    }
  }




  // Update content status (approve/flag/delete)
  static async updateContentStatus(req: Request, res: Response) {
    try {
      const { contentId } = req.params;
      const { status, type } = req.body;

      if (!['published', 'draft', 'flagged'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be published, draft, or flagged'
        });
      }

      let updatedContent;

      if (type.toLowerCase() === 'blog') {
        updatedContent = await Blog.findByIdAndUpdate(
          contentId,
          { status, updatedAt: new Date() },
          { new: true }
        );
      } else if (type.toLowerCase() === 'ai-post') {
        updatedContent = await Post.findByIdAndUpdate(
          contentId,
          { status, updatedAt: new Date() },
          { new: true }
        );
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid content type'
        });
      }

      if (!updatedContent) {
        return res.status(404).json({
          success: false,
          message: 'Content not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Content status updated successfully',
        data: updatedContent
      });
    } catch (error) {
      console.error('Error updating content status:', error);
      res.status(500).json({
        success: false,
        message: "Failed to update content status",
        error: error.message
      });
    }
  }
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
}
