import { Request, Response } from "express";
import UserActivity from "../models/user_activity";

export default class ActivityController {
  // Get all activities
  static async getAll(req: Request, res: Response) {
    console.log("getAll - start");
    try {
      console.log("getAll - try");
      const { user_id } = req.query;
      console.log("getAll - query", req.query);
      const activities = await UserActivity.find({ user_id }).sort({ created_at: -1 });
      console.log("getAll - found", activities.length);
      res.status(200).json({ success: true, data: activities });
      console.log("getAll - end");
    } catch (error) {
      console.log("getAll - catch", error);
      res.status(500).json({ success: false, message: "Failed to fetch activities", error });
    }
  }

  // Create a new activity
  static async create(req: Request, res: Response) {
    console.log("create - start");
    try {
      console.log("create - try");
      const { activity_name, description, user_id } = req.body;
      console.log("create - body", req.body);
      if (!activity_name || !description || !user_id) {
        console.log("create - missing fields");
        return res.status(400).json({ success: false, message: "Missing required fields" });
      }
      const activity = await UserActivity.create({ activity_name, description, user_id });
      console.log("create - created", activity);
      res.status(201).json({ success: true, data: activity });
      console.log("create - end");
    } catch (error) {
      console.log("create - catch", error);
      res.status(500).json({ success: false, message: "Failed to create activity", error });
    }
  }
}
