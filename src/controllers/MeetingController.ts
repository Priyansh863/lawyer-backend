import { Request, Response } from "express";
import Meeting, { EMeetingStatus, EMeetingType } from "../models/meeting";
import { User } from "../models/user";
import Case from "../models/case";
import { UserTokenBalance, TokenTransaction, ETransactionType, ETransactionStatus } from "../models/token";
import mongoose from 'mongoose';
import { NotificationService } from '../services/notificationService';

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
        requested_time,
        consultation_type = 'paid',
        hourly_rate,
        custom_fee = false,
        meeting_type = 'video'
      } = req.body;
      
      const userId = (req as any).user?.userId || (req as any).user?._id;

      // Validate required fields
      if (!clientId || !lawyerId || !requested_date || !requested_time) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: clientId, lawyerId, requested_date, requested_time"
        });
      }

      const user = await User.findById(userId).select('first_name last_name email account_type');

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      // Determine the actual rate to use
      const lawyer = await User.findById(lawyerId).select('charges first_name last_name');
      if (!lawyer) {
        return res.status(404).json({
          success: false,
          message: "Lawyer not found"
        });
      }

      let actualRate = 0;
      if (consultation_type === 'free') {
        actualRate = 0;
      } else if (custom_fee && hourly_rate !== undefined) {
        actualRate = hourly_rate;
      } else {
        // Use lawyer's default rate
        actualRate = lawyer.charges || 0;
      }

      // If client is creating meeting, check token balance for paid consultations
      if (user.account_type === 'client' && consultation_type === 'paid' && actualRate > 0) {
        // Check client's token balance
        const clientTokenBalance = await UserTokenBalance.findOne({ user_id: clientId });
        if (!clientTokenBalance || clientTokenBalance.current_balance < actualRate) {
          return res.status(200).json({
            success: false,
            message: `Insufficient tokens for video meeting. Required: ${actualRate}, Available: ${clientTokenBalance?.current_balance || 0}`,
            requiredTokens: actualRate,
            currentBalance: clientTokenBalance?.current_balance || 0,
            lawyerCharges: lawyer.charges,
            customRate: custom_fee ? hourly_rate : null,
            lawyerName: `${lawyer.first_name} ${lawyer.last_name}`
          });
        }
      }

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
        meeting_type: meeting_type || 'video',
        meeting_link: meetingLink || '',
        status: status,
        approved_at: approval_date,
        initiated_by: user.account_type,
        consultation_type: consultation_type,
        hourly_rate: actualRate,
        custom_fee: custom_fee,
        requested_date: new Date(requested_date),
        requested_time: requested_time,
        created_by: userId,
        updated_by: userId,
        timezone: 'UTC',
        duration_minutes: 60
      });

      // If client created meeting and it's auto-approved (or if lawyer created), deduct tokens
      let tokenInfo = null;
      if (user.account_type === 'client' && status === EMeetingStatus.APPROVED && consultation_type === 'paid' && actualRate > 0) {
        if (actualRate > 0) {
          try {
            // Deduct tokens from client's balance
            const updatedBalance = await (UserTokenBalance as any).useTokens(clientId, actualRate);
            
            // Create transaction record
            await TokenTransaction.create({
              user_id: clientId,
              type: ETransactionType.usage,
              amount: -actualRate,
              description: `${consultation_type === 'free' ? 'Free' : 'Video'} meeting scheduled with ${lawyer.first_name} ${lawyer.last_name}${custom_fee ? ' (Custom Rate)' : ''}`,
              category: 'Video Consultation',
              status: ETransactionStatus.completed,
              reference_id: meeting._id.toString(),
              metadata: {
                lawyerId: lawyerId,
                lawyerName: `${lawyer.first_name} ${lawyer.last_name}`,
                consultationType: consultation_type,
                customRate: custom_fee,
                hourlyRate: actualRate,
                sessionId: meeting._id.toString(),
              }
            });

            tokenInfo = {
              tokensDeducted: actualRate,
              remainingBalance: updatedBalance.current_balance,
              lawyerCharges: lawyer.charges,
              customRate: custom_fee ? actualRate : null
            };
          } catch (tokenError: any) {
            // If token deduction fails, delete the created meeting
            await Meeting.findByIdAndDelete(meeting._id);
            return res.status(400).json({
              success: false,
              message: tokenError.message || 'Failed to deduct tokens for meeting'
            });
          }
        }
      }

      // Populate lawyer and client details for response
      const populatedMeeting = await Meeting.findById(meeting._id)
        .populate('lawyer_id', 'first_name last_name email account_type charges')
        .populate('client_id', 'first_name last_name email account_type')

      // Send notifications for meeting request
      try {
        if (user.account_type === 'client') {
          // Notify lawyer about new meeting request
          await NotificationService.createNotification({
            userId: lawyerId,
            title: 'New Meeting Request',
            message: `${user.first_name} ${user.last_name} has requested a video consultation with you.`,
            type: 'video_consultation_started',
            relatedId: meeting._id,
            relatedType: 'meeting',
            redirectUrl: `/meetings/${meeting._id}`,
            priority: 'high',
            createdBy: userId
          });

          // Notify client about meeting request submission
          await NotificationService.createNotification({
            userId: clientId,
            title: 'Meeting Request Submitted',
            message: `Your meeting request has been sent to the lawyer for approval.`,
            type: 'video_consultation_started',
            relatedId: meeting._id,
            relatedType: 'meeting',
            redirectUrl: `/meetings/${meeting._id}`,
            priority: 'medium',
            createdBy: userId
          });
        } else if (user.account_type === 'lawyer') {
          // Notify client about lawyer-created meeting (auto-approved)
          await NotificationService.createNotification({
            userId: clientId,
            title: 'Meeting Scheduled',
            message: `${user.first_name} ${user.last_name} has scheduled a video consultation with you.`,
            type: 'video_consultation_started',
            relatedId: meeting._id,
            relatedType: 'meeting',
            redirectUrl: `/meetings/${meeting._id}`,
            priority: 'high',
            createdBy: userId
          });
        }
      } catch (notificationError) {
        console.error('Failed to send meeting request notifications:', notificationError);
      }

      const message = status === EMeetingStatus.APPROVED 
        ? (tokenInfo ? "Meeting created and approved successfully. Tokens deducted." : "Meeting created and approved successfully")
        : "Meeting request created successfully and sent for approval";

      return res.status(201).json({
        success: true,
        message: message,
        data: {
          ...populatedMeeting.toObject(),
          tokenInfo
        }
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

    

      // Get lawyer info for token deduction
      const lawyer = await User.findById(meeting.lawyer_id).select('charges first_name last_name');
      if (!lawyer) {
        return res.status(404).json({
          success: false,
          message: "Lawyer not found"
        });
      }

      // Check if client has sufficient tokens before approving
      const tokensRequired = lawyer.charges || 0;
      let tokenInfo = null;
      
      if (tokensRequired > 0) {
        const clientTokenBalance = await UserTokenBalance.findOne({ user_id: meeting.client_id });
        if (!clientTokenBalance || clientTokenBalance.current_balance < tokensRequired) {
          return res.status(200).json({
            success: false,
            message: `Cannot approve meeting. Client has insufficient tokens. Required: ${tokensRequired}, Available: ${clientTokenBalance?.current_balance || 0}`,
            requiredTokens: tokensRequired,
            currentBalance: clientTokenBalance?.current_balance || 0
          });
        }

        // Deduct tokens from client's balance
        try {
          const updatedBalance = await (UserTokenBalance as any).useTokens(meeting.client_id.toString(), tokensRequired);
          
          // Create transaction record
          await TokenTransaction.create({
            user_id: meeting.client_id,
            type: ETransactionType.usage,
            amount: -tokensRequired,
            description: `Video meeting approved with ${lawyer.first_name} ${lawyer.last_name}`,
            category: 'Video Consultation',
            status: ETransactionStatus.completed,
            reference_id: meetingId,
            metadata: {
              lawyerId: meeting.lawyer_id,
              lawyerName: `${lawyer.first_name} ${lawyer.last_name}`,
              consultationType: 'video',
              sessionId: meetingId,
              approvedAt: new Date()
            }
          });

          tokenInfo = {
            tokensDeducted: tokensRequired,
            remainingBalance: updatedBalance.current_balance,
            lawyerCharges: lawyer.charges
          };
        } catch (tokenError: any) {
          return res.status(400).json({
            success: false,
            message: tokenError.message || 'Failed to deduct tokens for meeting approval'
          });
        }
      }

      // Update meeting to approved status
      const updatedMeeting = await Meeting.findByIdAndUpdate(
        meetingId,
        {
          status: EMeetingStatus.APPROVED,
          approval_date: new Date()
        },
        { new: true }
      ).populate('lawyer_id', 'first_name last_name email account_type charges')
       .populate('client_id', 'first_name last_name email account_type');

      // Send notification for video consultation approval
      try {
        await NotificationService.notifyVideoConsultationStarted(updatedMeeting, meeting.lawyer_id.toString());
      } catch (notificationError) {
        console.error('Failed to send video consultation notification:', notificationError);
      }

      return res.status(200).json({
        success: true,
        message: tokenInfo ? "Meeting approved successfully. Tokens deducted from client." : "Meeting approved successfully",
        data: {
          ...updatedMeeting.toObject(),
          tokenInfo
        }
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

      // Send notification for meeting rejection
      try {
        await NotificationService.createNotification({
          userId: updatedMeeting.client_id._id,
          title: 'Meeting Request Rejected',
          message: `Your meeting request has been rejected. Reason: ${rejection_reason}`,
          type: 'video_consultation_started',
          relatedId: meetingId,
          relatedType: 'meeting',
          redirectUrl: `/meetings/${meetingId}`,
          priority: 'high',
          metadata: { rejectionReason: rejection_reason },
          createdBy: lawyer_id
        });
      } catch (notificationError) {
        console.error('Failed to send meeting rejection notification:', notificationError);
      }

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
        .sort({ requested_date: -1, created_at: -1 });

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

      // Send notifications for meeting status changes
      try {
        if (status === EMeetingStatus.ACTIVE) {
          // Notify both participants that meeting has started
          const otherUserId = updatedMeeting.client_id._id.toString() === user_id.toString() 
            ? updatedMeeting.lawyer_id._id 
            : updatedMeeting.client_id._id;

          await NotificationService.createNotification({
            userId: otherUserId,
            title: 'Meeting Started',
            message: `Your video consultation has started. Join now!`,
            type: 'video_consultation_started',
            relatedId: meetingId,
            relatedType: 'meeting',
            redirectUrl: `/meetings/${meetingId}`,
            priority: 'high',
            createdBy: user_id
          });
        } else if (status === EMeetingStatus.COMPLETED) {
          // Notify both participants that meeting has ended
          const userIds = [updatedMeeting.client_id._id, updatedMeeting.lawyer_id._id];
          await NotificationService.createBulkNotifications(userIds, {
            title: 'Meeting Completed',
            message: `Your video consultation has been completed.`,
            type: 'video_consultation_started',
            relatedId: meetingId,
            relatedType: 'meeting',
            redirectUrl: `/meetings/${meetingId}`,
            priority: 'medium',
            createdBy: user_id
          });
        } else if (status === EMeetingStatus.CANCELLED) {
          // Notify the other participant about cancellation
          const otherUserId = updatedMeeting.client_id._id.toString() === user_id.toString() 
            ? updatedMeeting.lawyer_id._id 
            : updatedMeeting.client_id._id;

          await NotificationService.createNotification({
            userId: otherUserId,
            title: 'Meeting Cancelled',
            message: `Your video consultation has been cancelled.`,
            type: 'video_consultation_started',
            relatedId: meetingId,
            relatedType: 'meeting',
            redirectUrl: `/meetings/${meetingId}`,
            priority: 'high',
            createdBy: user_id
          });
        }
      } catch (notificationError) {
        console.error('Failed to send meeting status update notifications:', notificationError);
      }

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

  /**
   * Update meeting details (date, time, rates, etc.)
   * @param req.params.meetingId (string)
   * @param req.body - Fields to update
   */
  static async updateMeeting(req: Request, res: Response) {
    try {
      const { meetingId } = req.params;
      const updateData = req.body;
      const user_id = (req as any).user.userId || (req as any).user._id;

      // Validate meetingId
      if (!meetingId) {
        return res.status(400).json({
          success: false,
          message: "Meeting ID is required"
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
          message: "Meeting not found or you don't have permission to edit this meeting"
        });
      }

      // Check if meeting can be edited (only pending or approved meetings)
      const editableStatuses = [EMeetingStatus.PENDING_APPROVAL, EMeetingStatus.APPROVED];
      if (!editableStatuses.includes(meeting.status)) {
        return res.status(400).json({
          success: false,
          message: "Meeting cannot be edited in its current status"
        });
      }

      // Handle custom rate changes for paid consultations
      if (updateData.hasOwnProperty('hourly_rate') || updateData.hasOwnProperty('consultation_type')) {
        const lawyer = await User.findById(meeting.lawyer_id).select('charges first_name last_name');
        if (!lawyer) {
          return res.status(404).json({
            success: false,
            message: "Lawyer not found"
          });
        }

        const newConsultationType = updateData.consultation_type || meeting.consultation_type;
        let newRate = 0;

        if (newConsultationType === 'free') {
          newRate = 0;
        } else if (updateData.custom_fee && updateData.hourly_rate !== undefined) {
          newRate = updateData.hourly_rate;
        } else if (!updateData.custom_fee) {
          newRate = lawyer.charges || 0;
        } else {
          newRate = meeting.hourly_rate; // Keep existing rate
        }

        updateData.hourly_rate = newRate;

        // If changing to a paid consultation or increasing rate, check client token balance
        if (newConsultationType === 'paid' && newRate > 0) {
          const currentPaidAmount = meeting.consultation_type === 'paid' ? meeting.hourly_rate : 0;
          const rateDifference = newRate - currentPaidAmount;

          if (rateDifference > 0) {
            const clientTokenBalance = await UserTokenBalance.findOne({ user_id: meeting.client_id });
            if (!clientTokenBalance || clientTokenBalance.current_balance < rateDifference) {
              return res.status(400).json({
                success: false,
                message: `Insufficient tokens for rate change. Additional tokens needed: ${rateDifference}, Available: ${clientTokenBalance?.current_balance || 0}`
              });
            }
          }
        }
      }

      // Parse dates if provided
      if (updateData.requested_date) {
        updateData.requested_date = new Date(updateData.requested_date);
      }
      if (updateData.scheduled_date) {
        updateData.scheduled_date = new Date(updateData.scheduled_date);
      }

      // Update the meeting using the model method
      const updatedMeeting = await (meeting as any).updateDetails(user_id, updateData);

      // Populate the updated meeting for response
      const populatedMeeting = await Meeting.findById(updatedMeeting._id)
        .populate('lawyer_id', 'first_name last_name email account_type charges')
        .populate('client_id', 'first_name last_name email account_type');

      // Send notification for meeting updates
      try {
        const otherUserId = populatedMeeting.client_id._id.toString() === user_id.toString() 
          ? populatedMeeting.lawyer_id._id 
          : populatedMeeting.client_id._id;

        await NotificationService.createNotification({
          userId: otherUserId,
          title: 'Meeting Updated',
          message: `Meeting details have been updated. Please review the changes.`,
          type: 'video_consultation_started',
          relatedId: meetingId,
          relatedType: 'meeting',
          redirectUrl: `/meetings/${meetingId}`,
          priority: 'medium',
          createdBy: user_id
        });
      } catch (notificationError) {
        console.error('Failed to send meeting update notifications:', notificationError);
      }

      return res.status(200).json({
        success: true,
        message: "Meeting updated successfully",
        data: populatedMeeting
      });

    } catch (error: any) {
      console.error("Update meeting error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update meeting"
      });
    }
  }
}
