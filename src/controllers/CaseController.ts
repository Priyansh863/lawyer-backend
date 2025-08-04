import { Request, Response } from 'express';
import Case from '../models/case';
import { User } from '../models/user';
import { Types } from 'mongoose';

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
      
      if (!Types.ObjectId.isValid(lawyerId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid lawyer ID'
        });
      }

      const cases = await Case.find({ lawyer_id: new Types.ObjectId(lawyerId) })
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
      const {
        title,
        description,
        summary,
        key_points,
        client_id,
        lawyer_id,
        status = 'Pending',
        files = []
      } = req.body;

      // Validate required fields
      if (!title || !description || !client_id || !lawyer_id) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: title, description, client_id, lawyer_id'
        });
      }

      // Validate ObjectIds
      if (!Types.ObjectId.isValid(client_id) || !Types.ObjectId.isValid(lawyer_id)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid client_id or lawyer_id'
        });
      }

      // Check if client and lawyer exist
      const client = await User.findById(client_id);
      const lawyer = await User.findById(lawyer_id);

      if (!client) {
        return res.status(404).json({
          success: false,
          message: 'Client not found'
        });
      }

      if (!lawyer) {
        return res.status(404).json({
          success: false,
          message: 'Lawyer not found'
        });
      }

      // Generate case number
      const lastCase = await Case.findOne().sort({ created_at: -1 });
      let caseNumber = 'CASE-001';
      
      if (lastCase && lastCase.case_number) {
        const lastNumber = parseInt(lastCase.case_number.split('-')[1]);
        caseNumber = `CASE-${String(lastNumber + 1).padStart(3, '0')}`;
      }

      const newCase = new Case({
        case_number: caseNumber,
        title,
        description,
        summary: summary || '',
        key_points: key_points || [],
        client_id: new Types.ObjectId(client_id),
        lawyer_id: new Types.ObjectId(lawyer_id),
        status,
        files,
        important_dates: []
      });

      const savedCase = await newCase.save();
      
      // Populate the saved case
      const populatedCase = await Case.findById(savedCase._id)
        .populate('client_id', 'first_name last_name email phone')
        .populate('lawyer_id', 'first_name last_name email');

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
      delete updates.case_number;

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

      if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be Pending, Approved, or Rejected'
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
