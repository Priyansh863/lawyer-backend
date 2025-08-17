import UserService from '../services/UserService';
import { Request, Response } from 'express';
import {User} from "../models/user";
import Blog from "../models/blog";
import Case from "../models/case";
import bcrypt from 'bcrypt';

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

      console.log("converting page and limit to numbers >>>",status);
      const pageNumber = Number(page);
      const pageLimit = Number(limit);

      console.log("getting cases from user service >>>");
      const cases = await UserService.getCasesByUserRole({
        userId,
        role,
        status: (status) || undefined,
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

      const {
        title,
        description,
        case_type,
        court_type,
        client_option,
        existing_client_id,
        client_first_name,
        client_last_name,
        client_email,
        client_phone,
        client_password,
        priority,
        expected_duration,
        notes,
        lawyer_id,
        status
      } = req.body;

      // Validate required fields
      if (!title || !description || !case_type || !court_type) {
        return res.status(400).json({ 
          success: false, 
          message: "Missing required fields: title, description, case_type, court_type" 
        });
      }

      let clientId = existing_client_id;

      // Create new client if needed
      if (client_option === 'new') {
        if (!client_first_name || !client_last_name || !client_email || !client_password) {
          return res.status(400).json({ 
            success: false, 
            message: "Missing required client fields for new client creation" 
          });
        }

        // Hash password before creating new client
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(client_password, saltRounds);

        // Create new client
        const newClient = new User({
          first_name: client_first_name,
          last_name: client_last_name,
          email: client_email,
          phone: client_phone,
          password: hashedPassword,
          account_type: 'client',
          is_verified: true
        });

        const savedClient = await newClient.save();
        clientId = savedClient._id;
      }

      if (!clientId) {
        return res.status(400).json({ 
          success: false, 
          message: "Client ID is required" 
        });
      }

      // Generate unique case number
      const caseCount = await Case.countDocuments();
      const caseNumber = `CASE-${Date.now()}-${(caseCount + 1).toString().padStart(4, '0')}`;

      // Create case with all required fields
      const caseData = {
        case_number: caseNumber,
        title,
        description,
        summary: description, // Use description as summary for now
        case_type,
        court_type,
        client_id: clientId,
        lawyer_id: lawyer_id || userId,
        status: status || 'open',
        key_points: notes ? [notes] : [],
        important_dates: [],
        documents: [],
        status_history: [{
          status: status || 'open',
          changed_at: new Date(),
          changed_by: userId,
          notes: 'Case created'
        }]
      };

      const newCase = await Case.create(caseData);

      return res.status(201).json({ success: true, case: newCase });
    } catch (error) {
      console.error("Error creating case:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Internal server error" 
      });
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

  /**
   * Update client notes (lawyer only)
   * @param req.params.clientId (string) - Client ID
   * @param req.body.notes (string) - Notes content
   */
  static async updateClientNotes(req: Request, res: Response) {
    try {
      const { clientId } = req.params;
      const { notes } = req.body;
      const lawyer_id = (req as any).user._id;
      const lawyer = (req as any).user;
      
      // Verify the requester is a lawyer
      if (lawyer.account_type !== 'lawyer') {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can update client notes"
        });
      }
      
      // Find and update the client
      const client = await User.findById(clientId);
      if (!client || client.account_type !== 'client') {
        return res.status(404).json({
          success: false,
          message: "Client not found"
        });
      }
      
      // Update notes
      client.notes = notes || '';
      await client.save();
      
      return res.status(200).json({
        success: true,
        message: "Client notes updated successfully",
        data: {
          client_id: client._id,
          notes: client.notes,
          updated_at: client.updated_at
        }
      });
      
    } catch (error: any) {
      console.error('Error updating client notes:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update client notes'
      });
    }
  }

  /**
   * Get client notes (lawyer only)
   * @param req.params.clientId (string) - Client ID
   */
  static async getClientNotes(req: Request, res: Response) {
    try {
      const { clientId } = req.params;
      const lawyer = (req as any).user;
      
      // Verify the requester is a lawyer
      if (lawyer.account_type !== 'lawyer') {
        return res.status(403).json({
          success: false,
          message: "Only lawyers can view client notes"
        });
      }
      
      // Find the client
      const client = await User.findById(clientId).select('notes first_name last_name email');
      if (!client || client.account_type !== 'client') {
        return res.status(404).json({
          success: false,
          message: "Client not found"
        });
      }
      
      return res.status(200).json({
        success: true,
        data: {
          client_id: client._id,
          client_name: `${client.first_name} ${client.last_name}`.trim(),
          client_email: client.email,
          notes: client.notes || ''
        }
      });
      
    } catch (error: any) {
      console.error('Error getting client notes:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get client notes'
      });
    }
  }

  /**
 * Get all lawyers for sharing documents
 */
static async getLawyers(req: Request, res: Response) {
  try {
    const lawyers = await User.find(
      { account_type: 'lawyer' },
      'first_name last_name email account_type'
    ).sort({ first_name: 1 });

    res.json({
      success: true,
      data: lawyers
    });
  } catch (error: any) {
    console.error('Error fetching lawyers:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch lawyers'
    });
  }
}

  /**
   * Get all clients for sharing documents (lawyer only)
   */
  static async getClientsList(req: Request, res: Response) {
    try {
      const lawyer = (req as any).user;
      


      const clients = await User.find(
        { account_type: 'client' },
        'first_name last_name email account_type'
      ).sort({ first_name: 1 });

      res.json({
        success: true,
        clients: clients
      });
    } catch (error: any) {
      console.error('Error fetching clients:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch clients'
      });
    }
  }
}

export default UserController;