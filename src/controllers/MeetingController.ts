import { Request, Response } from "express";
import Meeting, { EMeetingStatus } from "../models/meeting";
import { User } from "../models/user";

// Interface for populated user fields
interface PopulatedUser {
  _id: string;
  first_name: string;
  last_name: string;
  email: string;
}

// Interface for populated meeting
interface PopulatedMeeting {
  _id: string;
  lawyer_id: PopulatedUser;
  client_id: PopulatedUser;
  meeting_link: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export default class MeetingController {
  /**
   * Create a new meeting
   * @param req.body.lawyer_id (string)
   * @param req.body.client_id (string)
   * @param req.body.meeting_link (string)
   */
  static async createMeeting(req: Request, res: Response) {
    try {
      const { lawyerId, clientId, meetingLink } = req.body;

      // Validate required fields
      if (!lawyerId || !clientId || !meetingLink) {
        return res.status(400).json({
          success: false,
          message: "lawyer_id, client_id, and meeting_link are required"
        });
      }

      // Create the meeting
      const meeting = await Meeting.create({
        lawyer_id:lawyerId,
        client_id:clientId,
        meeting_link:meetingLink,
        status: EMeetingStatus.scheduled
      });

      // Populate lawyer and client details for response
      const populatedMeeting = await Meeting.findById(meeting._id)
        .populate('lawyer_id', 'first_name last_name email')
        .populate('client_id', 'first_name last_name email');

      return res.status(201).json({
        success: true,
        message: "Meeting created successfully",
        meeting: populatedMeeting
      });

    } catch (error: any) {
      console.error("Create meeting error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to create meeting"
      });
    }
  }

  /**
   * List all meetings for a user (lawyer or client)
   * @param req.query.user_id (string) - Optional: filter by user (as lawyer or client)
   */
  static async listMeetings(req: Request, res: Response) {
    try {
      const { user_id } = req.query;
      let query = {};

      // If user_id is provided, find meetings where user is either lawyer or client
      if (user_id) {
        query = {
          $or: [
            { lawyer_id: user_id },
            { client_id: user_id }
          ]
        };
      }

      const meetings = await Meeting.find(query)
        .populate('lawyer_id', 'first_name last_name email')
        .populate('client_id', 'first_name last_name email')
        .sort({ createdAt: -1 });

      // Transform the response to include readable names
      const transformedMeetings = meetings.map((meeting: any) => ({
        _id: meeting._id,
        lawyer_id: meeting.lawyer_id._id,
        client_id: meeting.client_id._id,
        lawyerName: `${meeting.lawyer_id.first_name} ${meeting.lawyer_id.last_name}`.trim(),
        clientName: `${meeting.client_id.first_name} ${meeting.client_id.last_name}`.trim(),
        meetingLink: meeting.meeting_link,
        status: meeting.status,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt
      }));

      return res.status(200).json({
        success: true,
        meetings: transformedMeetings
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
   * Update meeting status
   * @param req.params.id (string) - Meeting ID
   * @param req.body.status (string) - New status
   */
  static async updateMeetingStatus(req: Request, res: Response) {
    try {
      const { meetingId } = req.body;
      const { status } = req.body;

      // Validate meeting ID
      if (!meetingId) {
        return res.status(400).json({
          success: false,
          message: "Meeting ID is required"
        });
      }

      // Validate status
      if (!status || !Object.values(EMeetingStatus).includes(status)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${Object.values(EMeetingStatus).join(', ')}`
        });
      }

      // Find and update the meeting
      const meeting = await Meeting.findByIdAndUpdate(
        meetingId,
        { status },
        { new: true }
      ).populate('lawyer_id', 'first_name last_name email')
       .populate('client_id', 'first_name last_name email');

      if (!meeting) {
        return res.status(404).json({
          success: false,
          message: "Meeting not found"
        });
      }

      // Transform the response
      const transformedMeeting = {
        _id: meeting._id,
        lawyer_id: (meeting.lawyer_id as any)._id,
        client_id: (meeting.client_id as any)._id,
        lawyerName: `${(meeting.lawyer_id as any).first_name} ${(meeting.lawyer_id as any).last_name}`.trim(),
        clientName: `${(meeting.client_id as any).first_name} ${(meeting.client_id as any).last_name}`.trim(),
        meetingLink: meeting.meeting_link,
        status: meeting.status,
        createdAt: meeting.createdAt,
        updatedAt: meeting.updatedAt
      };

      return res.status(200).json({
        success: true,
        message: "Meeting status updated successfully",
        meeting: transformedMeeting
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
