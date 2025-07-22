import { Router } from "express";
import MeetingController from "../controllers/MeetingController";

const router = Router();

// POST /api/v1/metting/create
router.post("/create", MeetingController.createMeeting);

// GET /api/v1/metting/list
router.get("/list", MeetingController.listMeetings);

// PUT /api/v1/metting/update-metting-status/:id
router.put("/update-metting-status", MeetingController.updateMeetingStatus);

export default router;
