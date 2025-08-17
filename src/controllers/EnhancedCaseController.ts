import { Request, Response } from "express";
import Case, { CaseStatus } from "../models/case";
import UserDocument from "../models/user_documents";
import { User } from "../models/user";
import mongoose from "mongoose";

export default class EnhancedCaseController {
  /**
   * Create a new case
   */
  static async createCase(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        case_number,
        title,
        description,
        summary,
        key_points = [],
        important_dates = [],
        client_id,
        lawyer_id
      } = req.body;

      const userId = req.user?._id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Validate required fields
      if (!case_number || !title || !description || !client_id || !lawyer_id) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: case_number, title, description, client_id, lawyer_id"
        });
      }

      // Verify client and lawyer exist
      const [client, lawyer] = await Promise.all([
        User.findOne({ _id: client_id, account_type: 'client' }).session(session),
        User.findOne({ _id: lawyer_id, account_type: 'lawyer' }).session(session)
      ]);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: "Client not found"
        });
      }

      if (!lawyer) {
        return res.status(404).json({
          success: false,
          message: "Lawyer not found"
        });
      }

      // Check if case number already exists
      const existingCase = await Case.findOne({ case_number }).session(session);
      if (existingCase) {
        return res.status(400).json({
          success: false,
          message: "Case number already exists"
        });
      }

      // Create the case
      const newCase = await Case.create([{
        case_number,
        title,
        description,
        summary,
        key_points,
        important_dates,
        client_id,
        lawyer_id,
        status: CaseStatus.OPEN,
        status_history: [{
          status: CaseStatus.OPEN,
          changed_at: new Date(),
          changed_by: userId,
          notes: "Case created"
        }],
        documents: [],
        created_by: userId,
        updated_by: userId
      }], { session });

      await session.commitTransaction();
      session.endSession();

      // Populate the created case
      const populatedCase = await Case.findById(newCase[0]._id)
        .populate('client_id', 'first_name last_name email')
        .populate('lawyer_id', 'first_name last_name email')
        .populate('created_by', 'first_name last_name email');

      return res.status(201).json({
        success: true,
        message: "Case created successfully",
        case: populatedCase
      });

    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();
      console.error("Create case error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create case"
      });
    }
  }

  /**
   * Update case status (lawyers only)
   */
  static async updateCaseStatus(req: Request, res: Response) {
    try {
      const { caseId } = req.params;
      const { status, notes } = req.body;
      const userId = req.user?._id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Only lawyers can update case status
      if (userRole !== 'lawyer') {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can update case status"
        });
      }

      // Validate status
      if (!Object.values(CaseStatus).includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Valid statuses: ${Object.values(CaseStatus).join(', ')}`
        });
      }

      // Find the case and verify lawyer has access
      const caseDoc = await Case.findOne({
        _id: caseId,
        lawyer_id: userId
      });

      if (!caseDoc) {
        return res.status(404).json({
          success: false,
          message: "Case not found or you don't have permission to update it"
        });
      }

      // Don't update if status is the same
      if (caseDoc.status === status) {
        return res.status(400).json({
          success: false,
          message: "Case is already in the specified status"
        });
      }

      // Update case status and add to history
      caseDoc.status = status;
      caseDoc.status_history.push({
        status,
        changed_at: new Date(),
        changed_by: userId,
        notes: notes || `Status changed to ${status}`
      });
      caseDoc.updated_by = userId;

      await caseDoc.save();

      // Populate and return updated case
      const updatedCase = await Case.findById(caseId)
        .populate('client_id', 'first_name last_name email')
        .populate('lawyer_id', 'first_name last_name email')
        .populate('status_history.changed_by', 'first_name last_name email')
        .populate('documents');

      return res.status(200).json({
        success: true,
        message: "Case status updated successfully",
        case: updatedCase
      });

    } catch (error: any) {
      console.error("Update case status error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update case status"
      });
    }
  }

  /**
   * Get case details with documents
   */
  static async getCaseById(req: Request, res: Response) {
    try {
      const { caseId } = req.params;
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Find case and verify user has access
      const caseDoc = await Case.findOne({
        _id: caseId,
        $or: [
          { client_id: userId },
          { lawyer_id: userId }
        ]
      })
      .populate('client_id', 'first_name last_name email account_type')
      .populate('lawyer_id', 'first_name last_name email account_type')
      .populate('status_history.changed_by', 'first_name last_name email')
      .populate({
        path: 'documents',
        populate: {
          path: 'uploaded_by',
          select: 'first_name last_name email account_type'
        }
      });

      if (!caseDoc) {
        return res.status(404).json({
          success: false,
          message: "Case not found or access denied"
        });
      }

      return res.status(200).json({
        success: true,
        case: caseDoc,
        permissions: {
          can_update_status: caseDoc.lawyer_id._id.toString() === userId.toString(),
          can_add_documents: true,
          can_view_all_documents: true
        }
      });

    } catch (error: any) {
      console.error("Get case by ID error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get case"
      });
    }
  }

  /**
   * List cases for a user with filtering
   */
  static async listCases(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const userRole = req.user?.role;
      
      const {
        page = 1,
        limit = 10,
        status,
        search,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const skip = (Number(page) - 1) * Number(limit);
      const sort: any = { [sortBy as string]: sortOrder === 'asc' ? 1 : -1 };

      // Build query based on user role
      let query: any = {
        $or: [
          { client_id: userId },
          { lawyer_id: userId }
        ]
      };

      // Apply filters
      if (status) {
        query.status = status;
      }

      if (search) {
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { case_number: { $regex: search, $options: 'i' } },
            { title: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } }
          ]
        });
      }

      const [cases, total] = await Promise.all([
        Case.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .populate('client_id', 'first_name last_name email account_type')
          .populate('lawyer_id', 'first_name last_name email account_type')
          .select('-status_history') // Exclude detailed history for list view
          .lean(),
        Case.countDocuments(query)
      ]);

      // Add permissions to each case
      const casesWithPermissions = cases.map(caseDoc => ({
        ...caseDoc,
        permissions: {
          can_update_status: caseDoc.lawyer_id._id.toString() === userId.toString(),
          can_view_details: true,
          can_add_documents: true
        }
      }));

      return res.status(200).json({
        success: true,
        cases: casesWithPermissions,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit)
        }
      });

    } catch (error: any) {
      console.error("List cases error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to list cases"
      });
    }
  }

  /**
   * Get case status history
   */
  static async getCaseStatusHistory(req: Request, res: Response) {
    try {
      const { caseId } = req.params;
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Find case and verify access
      const caseDoc = await Case.findOne({
        _id: caseId,
        $or: [
          { client_id: userId },
          { lawyer_id: userId }
        ]
      })
      .populate('status_history.changed_by', 'first_name last_name email account_type')
      .select('case_number title status status_history');

      if (!caseDoc) {
        return res.status(404).json({
          success: false,
          message: "Case not found or access denied"
        });
      }

      return res.status(200).json({
        success: true,
        case: {
          _id: caseDoc._id,
          case_number: caseDoc.case_number,
          title: caseDoc.title,
          current_status: caseDoc.status
        },
        status_history: caseDoc.status_history.sort((a, b) => 
          new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
        )
      });

    } catch (error: any) {
      console.error("Get case status history error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get case status history"
      });
    }
  }

  /**
   * Update case details (basic info, not status)
   */
  static async updateCaseDetails(req: Request, res: Response) {
    try {
      const { caseId } = req.params;
      const {
        title,
        description,
        summary,
        key_points,
        important_dates
      } = req.body;
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Find case and verify user has access (both lawyer and client can update details)
      const caseDoc = await Case.findOne({
        _id: caseId,
        $or: [
          { client_id: userId },
          { lawyer_id: userId }
        ]
      });

      if (!caseDoc) {
        return res.status(404).json({
          success: false,
          message: "Case not found or access denied"
        });
      }

      // Update fields if provided
      if (title) caseDoc.title = title;
      if (description) caseDoc.description = description;
      if (summary) caseDoc.summary = summary;
      if (key_points) caseDoc.key_points = key_points;
      if (important_dates) caseDoc.important_dates = important_dates;
      
      caseDoc.updated_by = userId;
      await caseDoc.save();

      // Return updated case
      const updatedCase = await Case.findById(caseId)
        .populate('client_id', 'first_name last_name email')
        .populate('lawyer_id', 'first_name last_name email');

      return res.status(200).json({
        success: true,
        message: "Case details updated successfully",
        case: updatedCase
      });

    } catch (error: any) {
      console.error("Update case details error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update case details"
      });
    }
  }

  /**
   * Get case statistics for dashboard
   */
  static async getCaseStatistics(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      const query = {
        $or: [
          { client_id: userId },
          { lawyer_id: userId }
        ]
      };

      // Get case counts by status
      const statusCounts = await Case.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]);

      // Get recent cases
      const recentCases = await Case.find(query)
        .sort({ updated_at: -1 })
        .limit(5)
        .populate('client_id', 'first_name last_name')
        .populate('lawyer_id', 'first_name last_name')
        .select('case_number title status updated_at');

      // Format status counts
      const statistics = {
        total_cases: statusCounts.reduce((sum, item) => sum + item.count, 0),
        status_breakdown: statusCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {} as Record<string, number>),
        recent_cases: recentCases
      };

      return res.status(200).json({
        success: true,
        statistics
      });

    } catch (error: any) {
      console.error("Get case statistics error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get case statistics"
      });
    }
  }
}
