import UserService from '../services/UserService';
import { Request, Response } from 'express';
import {User} from "../models/user";
import Blog from "../models/blog";
import Case from "../models/case";

class UserController {
  static async updateUser(req: Request, res: Response) {
    try {
      const userId = req.params.id;
      const updatedData = req.body;
      const updatedUser = await UserService.updateUser(userId, updatedData);
      res.status(200).json({ success: true, data: updatedUser });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getPresignedUrl(req: Request, res: Response) {
    try {
      const requestData = req.body;
      const response = await UserService.getPresignedUrl(requestData);
      res.status(200).json(response);
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserList(req: Request, res: Response) {
    try {
      const { accountType, offset = 0, limit = 10 } = req.query;
      const accountTypeStr = typeof accountType === 'string' ? accountType : '';
      const offsetNum = parseInt(String(offset)) || 0;
      const limitNum = parseInt(String(limit)) || 10;
      const userList = await UserService.getUserList(accountTypeStr, offsetNum, limitNum);
      res.status(200).json({ success: true, data: userList });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getUserInfo(req: Request, res: Response) {
    try {
      const userId = req.params.id;
      const userInfo = await UserService.getUserInfo(userId);
      res.status(200).json({ success: true, data: userInfo });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  static async getCases(req: Request, res: Response) {
    console.log("inside getcases controller >>>");
    try {
      console.log("getting user id from request >>>");
      const userId = req["id"];
      console.log("getting user role from request >>>");
      const role = req["role"];
      console.log("getting query params from request >>>");
      const { status, query, page = 1, limit = 10 } = req.query as {
        status?: string;
        query?: string;
        page?: string;
        limit?: string;
      };

      console.log("converting page and limit to numbers >>>");
      const pageNumber = Number(page);
      const pageLimit = Number(limit);

      console.log("getting cases from user service >>>");
      const cases = await UserService.getCasesByUserRole({
        userId,
        role,
        status: (status && status[0].toUpperCase() + status.slice(1).toLowerCase()) || undefined,
        query: (query && query[0].toUpperCase() + query.slice(1).toLowerCase()) || undefined,
        page: pageNumber,
        limit: pageLimit,
      });

      console.log("returning cases from controller >>>");
      return res.status(200).json({ success: true, cases });
    } catch (error) {
      console.error("Error fetching cases:", error);
      console.log("returning error from controller >>>");
      return res.status(500).json({ message: "Internal server error" });
    }
  }

  static async getRelatedUsers(req: Request, res: Response) {
    try {
      let role = req["role"];

      const { query = "", status, page = "1", limit = "10" } = req.query;

      if (!role || (role !== "client" && role !== "lawyer")) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      if(role === "client"){
        role = "lawyer"; // For clients, we fetch lawyers
      }else if(role === "lawyer"){
        role = "client"; // For lawyers, we fetch clients
      }

      const users = await UserService.getRelatedUsers({
        role,
        query: query.toString(),
        status: status?.toString(),
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
      });

      return res.status(200).json({ success: true, users });
    } catch (error) {
      console.error("Error getting related users:", error);
      return res.status(500).json({ success: false, message: "Server error" });
    }

  }

  static async createCase(req: Request, res: Response) {
    try {
      const userId = req["id"];
      const role = req["role"];

      if (!userId || !role || (role !== "client" && role !== "lawyer")) {
        return res.status(403).json({ success: false, message: "Unauthorized" });
      }

      const caseData = req.body;
      const newCase = await UserService.createCase({ ...caseData, createdBy: userId });

      return res.status(201).json({ success: true, case: newCase });
    } catch (error) {
      console.error("Error creating case:", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async getClientsAndLawyers(req: Request, res: Response) {
    try {
      const [clients, lawyers] = await Promise.all([
        UserService.getUsersByType("client"),
        UserService.getUsersByType("lawyer"),
      ]);

      return res.status(200).json({
        success: true,
        clients,
        lawyers,
      });
    } catch (error) {
      console.error("Error fetching users:", error);
      return res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  static async getBlogs(req: Request, res: Response): Promise<void> {
    try {
      const blogs = await UserService.getBlogs();
      res.json(blogs);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getBlogById(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      const blog = await UserService.getBlogById(id);
      if (!blog) {
        res.status(404).json({ error: "Blog not found" });
        return;
      }
      res.json(blog);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async createBlog(req: Request, res: Response): Promise<void> {
    try {
      const blogData = req.body;
      const newBlog = await UserService.createBlog(blogData);
      res.status(201).json(newBlog);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async updateBlog(req: Request, res: Response): Promise<void> {
    console.log(req.body,"<<<<<<<<<<<<updateBlog");
    
    try {
      const id = req.params.id;
      const updates = req.body;
      const updatedBlog = await UserService.updateBlog(id, updates);
      res.json(updatedBlog);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  static async deleteBlog(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id;
      await UserService.deleteBlog(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

export default UserController;