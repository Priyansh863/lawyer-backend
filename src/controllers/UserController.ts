import UserService from "../services/UserService";

class UserController {
  static async updateUser(req, res) {
    try {
      const userId = req.params.id;
      const updatedData = req.body;
      const updatedUser = await UserService.updateUser(userId, updatedData);
      res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPresignedUrl(req, res) {
    try {
      const requestData = req.body;
      const response = await UserService.getPresignedUrl(requestData);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserList(req, res) {
    try {
      const { accountType, offset = 0, limit = 10 } = req.query;
      const userList = await UserService.getUserList(accountType, parseInt(offset), parseInt(limit));
      res.status(200).json({ success: true, data: userList });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserInfo(req, res) {
    try {
      const userId = req.params.id;
      const userInfo = await UserService.getUserInfo(userId);
      res.status(200).json({ success: true, data: userInfo });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

export default UserController;