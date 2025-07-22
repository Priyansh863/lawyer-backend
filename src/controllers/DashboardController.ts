import { Request, Response } from "express";
// Import your models here
// import Case from "../models/Case";
import Case from "../models/case";
import ChatMessage from "../models/ChatMessage";

export default class DashboardController {
  static async getSummary(req: Request, res: Response) {
    try {
      const { user_id } = req.query;
      // Active Cases (status: Approved)
      const activeCases = await Case.countDocuments({ user_id, status: "Approved" });
      // Inactive Cases (status: Rejected)
      const inactiveCases = await Case.countDocuments({ user_id, status: "Rejected" });

      // Today's Chats (messages sent today by user)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const chatsToday = await ChatMessage.countDocuments({ sender_id: user_id, created_at: { $gte: today } });

      res.status(200).json({
        success: true,
        data: [
          { title: "Active Cases", value: activeCases, icon: "FileText" },
          { title: "Inactive Cases", value: inactiveCases, icon: "FileArchive" },
          { title: "Today's Chats", value: chatsToday, icon: "MessageSquare" },
        ],
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to fetch dashboard summary", error });
    }
  }
}
