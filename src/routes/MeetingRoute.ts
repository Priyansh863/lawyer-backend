import { Router } from "express";
import MeetingController from "../controllers/MeetingController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Create a new meeting request (client creates, goes to lawyer for approval)
router.post("/create-request", authenticateToken, MeetingController.createMeetingRequest);
router.post("/create", authenticateToken, MeetingController.createMeetingRequest); // Alias for consistency

// Approve a meeting request (lawyer only)
router.put("/approve/:meetingId", authenticateToken, MeetingController.approveMeeting);

// Reject a meeting request (lawyer only)
router.put("/reject/:meetingId", authenticateToken, MeetingController.rejectMeeting);

// Get pending meeting requests for a lawyer
router.get("/pending", authenticateToken, MeetingController.getPendingMeetings);

// List all meetings for a user (lawyer or client)
router.get("/list", authenticateToken, MeetingController.listMeetings);

// Get a specific meeting by ID
router.get("/:meetingId", authenticateToken, MeetingController.getMeeting);

// Update meeting status (for active, completed, cancelled)
router.put("/status/:meetingId", authenticateToken, MeetingController.updateMeetingStatus);
router.put("/update-metting-status", authenticateToken, MeetingController.updateMeetingStatus); // Alias for frontend compatibility

export default router;
