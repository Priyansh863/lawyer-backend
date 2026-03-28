import { Request, Response } from 'express';
import Case from '../models/case';
import { User } from '../models/user';
import { Types } from 'mongoose';
import { NotificationService } from '../services/notificationService';

interface AuthRequest extends Request {
  user?: {
    _id: string;
    role: string;
  };
}

export class CaseController {
  /**
   * Get all cases with optional filtering
   */
  static async getAllCases(req: AuthRequest, res: Response) {
    try {
      const { clientId, lawyerId, status, page = 1, limit = 10, search } = req.query;
      
      const query: any = {};
      
      // Filter by client if clientId is provided
      if (clientId) {
        query.client_id = new Types.ObjectId(clientId as string);
      }
      
      // Filter by lawyer if lawyerId is provided
      if (lawyerId) {
        query.lawyer_id = new Types.ObjectId(lawyerId as string);
      }
      
      // Filter by status if provided
      if (status) {
        query.status = status;
      }
      
      // Search in title and description
      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { case_number: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (Number(page) - 1) * Number(limit);
      
      const cases = await Case.find(query)
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await Case.countDocuments(query);
      
      res.json({
        success: true,
        data: cases,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error fetching cases:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cases',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get cases for a specific client
   */
  static async getClientCases(req: AuthRequest, res: Response) {
    try {
      const { clientId } = req.params;
      
      if (!Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client ID'
        });
      }

      const cases = await Case.find({ client_id: new Types.ObjectId(clientId) })
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email')
        .sort({ created_at: -1 });

      res.json({
        success: true,
        data: cases
      });
    } catch (error) {
      console.error('Error fetching client cases:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch client cases',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get cases for a specific lawyer
   */
  static async getLawyerCases(req: AuthRequest, res: Response) {
    try {
      const { lawyerId } = req.params;
      const requesterId = req.user?._id;
      const requesterRole = req.user?.role || (req as any).role; // Try both req.user and req.role
      
      if (!Types.ObjectId.isValid(lawyerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid lawyer ID'
        });
      }

      const query: any = { lawyer_id: new Types.ObjectId(lawyerId) };

      // Security restriction: 
      // Clients/Users should only see their own cases with this lawyer
      if (requesterRole === 'client' || requesterRole === 'user') {
          query.client_id = new Types.ObjectId(requesterId);
      } 
      // If a lawyer is requesting and they are NOT the lawyer being queried, 
      // they should not see anything (unless they're an admin, handled next)
      else if (requesterRole === 'lawyer' && requesterId !== lawyerId) {
          query.lawyer_id = new Types.ObjectId(requesterId); // effectively blocking access
      }
      
      // Admins (and the lawyer themselves) see everything for that lawyer_id filter
      // Note: if requesterRole is 'admin', we don't add more filters to the lawyer_id query

      const cases = await Case.find(query)
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email')
        .sort({ created_at: -1 });

      res.json({
        success: true,
        data: cases
      });
    } catch (error) {
      console.error('Error fetching lawyer cases:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch lawyer cases',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get a single case by ID
   */
  static async getCaseById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = req.user?._id;
      const requesterRole = req.user?.role || (req as any).role;
      
      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid case ID'
        });
      }

      const caseData = await Case.findById(id)
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email');

      if (!caseData) {
        return res.status(404).json({
          success: false,
          message: 'Case not found'
        });
      }

      // Security Check: Only allow if requester is the client, the lawyer, or an admin
      const isClient = caseData.client_id && (caseData.client_id as any)._id.toString() === requesterId;
      const isLawyer = caseData.lawyer_id && (caseData.lawyer_id as any)._id.toString() === requesterId;
      const isAdmin = requesterRole === 'admin';

      if (!isClient && !isLawyer && !isAdmin) {
          return res.status(403).json({
              success: false,
              message: 'Access denied: You are not authorized to view this case'
          });
      }

      res.json({
        success: true,
        data: caseData
      });
    } catch (error) {
      console.error('Error fetching case:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch case',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create a new case
   */
  static async createCase(req: AuthRequest, res: Response) {
    try {
      console.log('Starting case creation');

      const {
        title,
        description,
        summary,
        key_points,
        client_id,
        lawyer_id,
        case_type,
        court_type,
        status = "pending",
        priority,
        expected_duration,
        est_duration,
        case_number: providedCaseNumber,
        case_identifier,
        files = []
      } = req.body;

      console.log('Received request body:', req.body);

      // Validate case_type and court_type

      // Check if client and lawyer exist
      const client = await User.findById(client_id);
      console.log('Found client:', client);

      const lawyer = await User.findById(lawyer_id);
      console.log('Found lawyer:', lawyer);

      if (!client) {
        console.log('Client not found');
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      if (!lawyer) {
        console.log('Lawyer not found');
        return res.status(404).json({
          success: false,
          message: 'Lawyer not found'
        });
      }

      let caseNumber = providedCaseNumber;
      
      if (!caseNumber) {
        const lastCase = await Case.findOne().sort({ created_at: -1 });
        console.log('Found last case for number generation:', lastCase);

        caseNumber = 'CASE-001';
        if (lastCase && lastCase.case_number) {
          const match = lastCase.case_number.match(/CASE-(\d+)/);
          if (match) {
            const lastNumber = parseInt(match[1]);
            caseNumber = `CASE-${String(lastNumber + 1).padStart(3, '0')}`;
          }
        }
      }

      const newCase = new Case({
        case_number: caseNumber,
        title,
        description,
        summary: summary || '',
        key_points: key_points || [],
        client_id: new Types.ObjectId(client_id),
        lawyer_id: new Types.ObjectId(lawyer_id),
        case_type,
        court_type,
        status,
        priority: priority || "medium",
        est_duration: est_duration || expected_duration || '',
        case_identifier,
        files,
        important_dates: []
      });

      const savedCase = await newCase.save();
      
      console.log('Saved new case:', savedCase);

      // Populate the saved case
      const populatedCase = await Case.findById(savedCase._id)
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email');

      // Send notifications for new case creation
      try {
        // Notify all lawyers about new case
        await NotificationService.notifyNewCaseCreated(
          savedCase,
          client_id
        );
        
        console.log('Notified lawyers about new case');

        // Also notify the specific assigned lawyer
        await NotificationService.createNotification({
          userId: lawyer_id,
          title: 'New Case Assigned',
          message: `You have been assigned a new case: "${title}"`,
          type: 'case_created',
          relatedId: savedCase._id,
          relatedType: 'case',
          redirectUrl: `/cases/${savedCase._id}`,
          priority: 'high',
          metadata: { caseNumber: savedCase.case_number },
          createdBy: client_id
        });

        console.log('Notified assigned lawyer about new case');

        // Notify the client about case creation confirmation
        await NotificationService.createNotification({
          userId: client_id,
          title: 'Case Created Successfully',
          message: `Your case "${title}" has been created and assigned to ${lawyer.first_name} ${lawyer.last_name}`,
          type: 'case_created',
          relatedId: savedCase._id,
          relatedType: 'case',
          redirectUrl: `/cases/${savedCase._id}`,
          priority: 'medium',
          metadata: { caseNumber: savedCase.case_number },
          createdBy: client_id
        });

        console.log('Notified client about case creation');

      } catch (notificationError) {
        console.error('Failed to send case creation notifications:', notificationError);
      }

      res.status(201).json({
        success: true,
        message: 'Case created successfully',
        data: populatedCase
      });
    } catch (error) {
      console.error('Error creating case:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create case',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update a case
   */
  static async updateCase(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updates = req.body;

      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid case ID'
        });
      }

      // Remove fields that shouldn't be updated directly
      delete updates._id;
      delete updates.__v;
      delete updates.created_at;
      // Allow case_number update? Usually no, but check if we should allow it once
      // delete updates.case_number;
      
      // Map expected_duration to est_duration if provided
      if (updates.expected_duration && !updates.est_duration) {
        updates.est_duration = updates.expected_duration;
      }

      const updatedCase = await Case.findByIdAndUpdate(
        id,
        { ...updates, updated_at: new Date() },
        { new: true, runValidators: true }
      )
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email');

      if (!updatedCase) {
        return res.status(404).json({
          success: false,
          message: 'Case not found'
        });
      }

      // Send notifications for case update
      try {
        // Notify both client and lawyer about case update
        const userIds = [updatedCase.client_id._id,updatedCase.lawyer_id];
      

        await NotificationService.createBulkNotifications(userIds, {
          title: 'Case Updated',
          message: `Case "${updatedCase.title}" has been updated with new information.`,
          type: 'case_status_changed',
          relatedId: updatedCase._id,
          relatedType: 'case',
          redirectUrl: `/cases/${updatedCase._id}`,
          priority: 'medium',
          metadata: { caseNumber: updatedCase.case_number },
          createdBy: req.user?._id || updatedCase.lawyer_id._id
        });
      } catch (notificationError) {
        console.error('Failed to send case update notifications:', notificationError);
      }

      res.json({
        success: true,
        message: 'Case updated successfully',
        data: updatedCase
      });
    } catch (error) {
      console.error('Error updating case:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update case',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete a case
   */
  static async deleteCase(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid case ID'
        });
      }

      const deletedCase = await Case.findByIdAndDelete(id);

      if (!deletedCase) {
        return res.status(404).json({
          success: false,
          message: 'Case not found'
        });
      }

      res.json({
        success: true,
        message: 'Case deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting case:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete case',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update case status
   */
  static async updateCaseStatus(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid case ID'
        });
      }

   

      const updatedCase = await Case.findByIdAndUpdate(
        id,
        { status, updated_at: new Date() },
        { new: true, runValidators: true }
      )
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email');

      if (!updatedCase) {
        return res.status(404).json({
          success: false,
          message: 'Case not found'
        });
      }

      // Send notifications for case status change
      try {
        await NotificationService.notifyCaseStatusChanged(
          updatedCase,
          status,
          req.user?._id || updatedCase.lawyer_id._id.toString()
        );
      } catch (notificationError) {
        console.error('Failed to send case status update notifications:', notificationError);
      }

      res.json({
        success: true,
        message: 'Case status updated successfully',
        data: updatedCase
      });
    } catch (error) {
      console.error('Error updating case status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update case status',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
