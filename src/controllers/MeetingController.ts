import { Request, Response } from "express";
import Meeting, { EMeetingStatus, EMeetingType } from "../models/meeting";
import { User } from "../models/user";
import Case from "../models/case";
import mongoose from 'mongoose';

// Interface for populated user fields
interface PopulatedUser {
  _id: string;
  first_name: string;
  last_name: string;
  email: string;
  account_type: string;
}

// Interface for populated meeting
interface PopulatedMeeting {
  _id: string;
  lawyer_id: PopulatedUser;
  client_id: PopulatedUser;
  meeting_title: string;
  meeting_description?: string;
  meeting_type: EMeetingType;
  start_time: Date;
  end_time: Date;
  duration_minutes: number;
  timezone: string;
  meeting_link?: string;
  location?: string;
  status: EMeetingStatus;
  initiated_by: 'lawyer' | 'client';
  approved_by?: PopulatedUser;
  approved_at?: Date;
  rejection_reason?: string;
  cancellation_reason?: string;
  notes?: string;
  case_id?: string;
  agenda_items?: string[];
  created_at: Date;
  updated_at: Date;
}

export default class MeetingController {
  /**
   * Create a new meeting request
   * - If client creates: goes to lawyer for approval (pending status)
   * - If lawyer creates: auto-approved (approved status)
   */
  static async createMeetingRequest(req: Request, res: Response) {
    try {
      const { 
        clientId, 
        lawyerId, 
        meetingLink, 
        meeting_title, 
        meeting_description, 
        requested_date, 
        requested_time 
      } = req.body;
      
      const userId = (req as any).user?.userId || (req as any).user?._id;

      const user= await User.findById(userId).select('first_name last_name email account_type');

     

 
      // Determine meeting status based on who creates it
      let status = EMeetingStatus.PENDING_APPROVAL;
      let approval_date = null;
      
      // If lawyer creates the meeting, it's auto-approved
      if (user.account_type === 'lawyer') {
        // Lawyer can create meetings with any client
        status = EMeetingStatus.APPROVED;
        approval_date = new Date();
      }
      // If client creates the meeting, it needs lawyer approval
      else if (user.account_type === 'client') {
        // Client can create meetings with any lawyer
        status = EMeetingStatus.PENDING_APPROVAL;
      }
     

      // Create the meeting request
      const meeting = await Meeting.create({
        lawyer_id: lawyerId,
        client_id: clientId,
        meeting_title: meeting_title || 'Video Consultation',
        meeting_description: meeting_description || '',
        requested_date: requested_date ? new Date(requested_date) : new Date(),
        requested_time: requested_time || '',
        meeting_link: meetingLink || '',
        status: status,
        approval_date: approval_date,
        created_by: userId
      });

      // Populate lawyer and client details for response
      const populatedMeeting = await Meeting.findById(meeting._id)
        .populate('lawyer_id', 'first_name last_name email account_type charges')
        .populate('client_id', 'first_name last_name email account_type')
        .populate('created_by', 'first_name last_name email account_type');

      const message = status === EMeetingStatus.APPROVED 
        ? "Meeting created and approved successfully" 
        : "Meeting request created successfully and sent for approval";

      return res.status(201).json({
        success: true,
        message: message,
        data: populatedMeeting
      });

    } catch (error: any) {
      console.error("Create meeting request error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create meeting request"
      });
    }
  }

  /**
   * Approve a meeting request (lawyer only)
   * @param req.params.meetingId (string)
   * @param req.body.meeting_link (string)
   * @param req.body.notes (string) - Optional
   */
  static async approveMeeting(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;


      console.log("approveMeeting", meetingId);

   

      // Find the meeting and verify it belongs to this lawyer
      const meeting = await Meeting.findOne({
        _id: meetingId,
        status: EMeetingStatus.PENDING_APPROVAL
      });

    

      // Update meeting to approved status
      const updatedMeeting = await Meeting.findByIdAndUpdate(
        meetingId,
        {
          status: EMeetingStatus.APPROVED,

          approval_date: new Date()
        },
        { new: true }
      ).populate('lawyer_id', 'first_name last_name email account_type')
       .populate('client_id', 'first_name last_name email account_type');

      return res.status(200).json({
        success: true,
        message: "Meeting approved successfully",
        data: updatedMeeting
      });

    } catch (error: any) {
      console.error("Approve meeting error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to approve meeting"
      });
    }
  }

  /**
   * Reject a meeting request (lawyer only)
   * @param req.params.meetingId (string)
   * @param req.body.rejection_reason (string)
   */
  static async rejectMeeting(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const { rejection_reason } = req.body;
      const lawyer_id = (req as any).user._id;

      // Validate required fields
      if (!rejection_reason) {
        return res.status(400).json({
          success: false,
          message: "rejection_reason is required"
        });
      }

      let query: any = {
        lawyer_id: lawyer_id,
        status: EMeetingStatus.PENDING_APPROVAL
      };

      // Find the meeting and verify it belongs to this lawyer
      const meeting = await Meeting.findOne(query);

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting request not found or already processed"
        });
      }

      // Update meeting to rejected status
      const updatedMeeting = await Meeting.findByIdAndUpdate(
        meetingId,
        { 
          status: EMeetingStatus.REJECTED,
          rejection_reason: rejection_reason || 'No reason provided'
        },
        { new: true }
      ).populate('lawyer_id', 'first_name last_name email account_type')
       .populate('client_id', 'first_name last_name email account_type');

      return res.status(200).json({
        success: true,
        message: "Meeting rejected successfully",
        data: updatedMeeting
      });

    } catch (error: any) {
      console.error("Reject meeting error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to reject meeting"
      });
    }
  }

  /**
   * Get pending meeting requests for a lawyer
   * @param req.query.status (string) - Optional: filter by status
   */
  static async getPendingMeetings(req: Request, res: Response) {
    try {
      const lawyer_id = (req as any).user._id;
      const { status } = req.query;

      let query: any = { lawyer_id };
      if (status) {
        query.status = status;
      } else {
        query.status = EMeetingStatus.PENDING_APPROVAL;
      }

      const meetings = await Meeting.find(query)
        .populate('lawyer_id', 'first_name last_name email account_type charges')
        .populate('client_id', 'first_name last_name email account_type')
        .populate('created_by', 'first_name last_name email account_type')
        .sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: meetings
      });

    } catch (error: any) {
      console.error("Get pending meetings error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get pending meetings"
      });
    }
  }

  /**
   * List all meetings for a user (lawyer or client)
   * @param req.query.status (string) - Optional: filter by status
   */
  static async listMeetings(req: Request, res: Response) {
    try {
      console.log("listMeetings",req.body,(req as any).user);
      const user_id = (req as any).user.userId;
      const { status } = req.query;

      console.log(user_id,"user_iduser_iduser_iduser_iduser_iduser_id");

      let query: any = {
        $or: [

          { lawyer_id: user_id },
          { client_id: user_id }
        ]
      };

      if (status) {
        query.status = status;
      }

      const meetings = await Meeting.find(query)
        .populate('lawyer_id', 'first_name last_name email account_type charges')
        .populate('client_id', 'first_name last_name email account_type')
        .populate('created_by', 'first_name last_name email account_type')
        .sort({ createdAt: -1 });

      return res.status(200).json({
        success: true,
        data: meetings
      });

    } catch (error: any) {
      console.error("List meetings error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to list meetings"
      });
    }
  }

  /**
   * Get a specific meeting by ID
   * @param req.params.meetingId (string)
   */
  static async getMeeting(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const user_id = (req as any).user.userId || (req as any).user._id;

      // Find meeting where user is either lawyer or client
      const meeting = await Meeting.findOne({
        _id: meetingId,
        $or: [
          { lawyer_id: user_id },
          { client_id: user_id }
        ]
      }).populate('lawyer_id', 'first_name last_name email account_type')
       .populate('client_id', 'first_name last_name email account_type');

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found"
        });
      }

      return res.status(200).json({
        success: true,
        data: meeting
      });

    } catch (error: any) {
      console.error("Get meeting error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get meeting"
      });
    }
  }

  /**
   * Update meeting status (for active, completed, cancelled)
   * @param req.params.meetingId (string)
   * @param req.body.status (string)
   */
  static async updateMeetingStatus(req: Request, res: Response) {
    try {
      // Get meetingId from params or body for flexibility
      const meetingId = req.params.meetingId || req.body.meetingId;
      const { status } = req.body;
      const user_id = (req as any).user.userId || (req as any).user._id;

      // Validate meetingId
      if (!meetingId) {
        return res.status(400).json({
          success: false,
          message: "Meeting ID is required"
        });
      }

      // Validate status
      const allowedStatuses = [EMeetingStatus.ACTIVE, EMeetingStatus.COMPLETED, EMeetingStatus.CANCELLED];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Invalid status. Allowed: active, completed, cancelled"
        });
      }

      // Find meeting where user is either lawyer or client
      const meeting = await Meeting.findOne({
        _id: meetingId,
        $or: [
          { lawyer_id: user_id },
          { client_id: user_id }
        ]
      });

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found"
        });
      }

 

      const updatedMeeting = await Meeting.findByIdAndUpdate(
        meetingId,
        { status },
        { new: true }
      ).populate('lawyer_id', 'first_name last_name email account_type')
       .populate('client_id', 'first_name last_name email account_type');

      return res.status(200).json({
        success: true,
        message: "Meeting status updated successfully",
        data: updatedMeeting
      });

    } catch (error: any) {
      console.error("Update meeting status error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update meeting status"
      });
    }
  }
}
