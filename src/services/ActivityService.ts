import UserActivity from "../models/user_activity";

export default class ActivityService {
  static async getAll() {
    return await UserActivity.find().sort({ created_at: -1 });
  }

  static async create({ activity_name, description, user_id }: { activity_name: string; description: string; user_id: string }) {
    if (!activity_name || !description || !user_id) {
      throw new Error("Missing required fields");
    }
    return await UserActivity.create({ activity_name, description, user_id });
  }
}
