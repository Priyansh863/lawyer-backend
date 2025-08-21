import { Request, Response } from "express";
// Import your models here
// import Case from "../models/Case";
import Case from "../models/case";
import ChatMessage from "../models/ChatMessage";
import mongoose from "mongoose";


export default class DashboardController {
  static async getSummary(req: Request, res: Response) {
    try {
      const userId = req["id"]; // From auth middleware
      const userObjectId = new mongoose.Types.ObjectId(userId);


      console.log(userId,"userIduserIduserIduserIduserIduserId")

      // Active & Inactive cases in one query (aggregation)
      const caseSummary = await Case.aggregate([
        {
          $match: {
            $or: [{ lawyer_id: userObjectId }, { client_id: userObjectId }]
          }
        },
        {
          $group: {
            _id: "$status",
            total: { $sum: 1 }
          }
        }
      ]);

      let activeCases = 0;
      let inactiveCases = 0;

      console.log(caseSummary,"caseSummarycaseSummarycaseSummarycaseSummary")

      caseSummary.forEach((item) => {
        console.log(item,"itemitemitemitemitem")
        // Active cases: in_progress, pending
        if (!["dismissal", "rejection", "withdrawal","suspension"].includes(item._id)) {
          activeCases += item.total;
        }
        // Inactive cases: all completed/closed statuses
        if (["dismissal", "rejection", "withdrawal","suspension"].includes(item._id)) {
          inactiveCases += item.total;
        }
      });

      // Today's Chats
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const chatsToday = await ChatMessage.aggregate([
        {
          $match: {
            sender_id: userObjectId,
            created_at: { $gte: today }
          }
        },
        {
          $count: "total"
        }
      ]);

      const todayChatsCount = chatsToday.length > 0 ? chatsToday[0].total : 0;

      res.status(200).json({
        success: true,
        data: [
          { title: "Active Cases", value: activeCases, icon: "FileText" },
          { title: "Inactive Cases", value: inactiveCases, icon: "FileArchive" },
          { title: "Today's Chats", value: todayChatsCount, icon: "MessageSquare" },
        ],
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to fetch dashboard summary", error });
    }
  }
}

