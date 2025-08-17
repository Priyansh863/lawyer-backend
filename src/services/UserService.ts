import {User} from "../models/user";
import Blog from "../models/blog";
import Case from "../models/case";
import Helper from "../utils/helper"; 

interface ResponseObject {
  success: boolean;
  message: string;
  data?: any;
}

interface CreateCaseInput {
  case_number: string;
  status: "Pending" | "Approved" | "Rejected";
  title: string;
  description: string;
  summary: string;
  key_points: string[];
  important_dates?: { event: string; date: Date }[];
  client_id: string;
  lawyer_id: string;
  files?: string[];
}

class UserService {
  private response: ResponseObject;

  /**
   * Update User
   */
  async updateUser(userId: string, updatedData: Partial<Record<string, any>>) {
    try {
      const filteredData = Object.fromEntries(
                Object.entries(updatedData).filter(([_, value]) => value !== undefined && value !== null)
      );

      const user = await User.findByIdAndUpdate(userId, filteredData, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        this.response = {
          success: false,
          message: "user_not_found",
        };
      } else {
        this.response = {
          success: true,
          message: "update_successful",
          data: user,
        };
      }
    } catch (error) {
      this.response = {
        success: false,
        message: error.message || "update_failed",
      };
    }

    return this.response;
  }

  /**
   * Get Presigned URL
   */
  async getPresignedUrl(requestData) {
    try {
      const { filePath, fileFormat } = requestData;
      const data = await Helper.gettingPreSignedUrl(filePath, fileFormat);
      return {
        message: "presigned_url_generated",
        success: true,
        data,
      };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get User List
   */
  async getUserList(accountType, offset, limit) {
    try {
      const query = accountType ? { account_type: accountType } : {};
      const users = await User.find(query)
      return users;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get User Info
   */
  async getUserInfo(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }
      return user;
    } catch (error) {
      throw new Error(error.message);
    }
  }

  /**
   * Get Cases Info
   */
  async getCasesByUserRole({
  userId,
  role,
  status,
  query,
  page = 1,
  limit = 10,
}: {
  userId: string;
  role: string;
  status?: string;
  query?: string;
  page?: number;
  limit?: number;
}) {
  let filter: any = {};

  console.log("filter >>>", filter);

  // Filter by user role
  if (role === "client") {
    filter.client_id = userId;
  } else if (role === "lawyer") {
    filter.lawyer_id = userId;
  } else {
    throw new Error("Invalid role");
  }

  // Filter by status
  if (status && status !== "all") {
    filter.status = status;
  }

  // Text search (case-insensitive)
  if (query) {
    const searchRegex = new RegExp(query, "i");
    filter.$or = [
      { title: searchRegex },
      { description: searchRegex },
      { case_number: searchRegex },
    ];
  }

  console.log("filter >>>", filter);

  // Pagination
  const skip = (page - 1) * limit;

  const cases = await Case.find(filter).sort({ _id: -1 })
  .populate('lawyer_id', 'first_name last_name')
  .populate('client_id', 'first_name last_name');

  return cases;
}

async getRelatedUsers({ role, query = "", status, page = 1, limit = 10 }: {  role: string;
  query?: string;
  status?: string;
  page?: number;
  limit?: number;}){
     const targetRole = role === "client" ? "lawyer" : "client";

    const filter: any = {
      account_type: targetRole,
    };

    // Add optional status filter
    if (status === "active") filter.is_active = 1;
    else if (status === "inactive") filter.is_active = 0;

    // Search query
    if (query) {
      const regex = new RegExp(query, "i");
      filter.$or = [
        { first_name: regex },
        { last_name: regex },
        { email: regex },
        { pratice_area: regex },
      ];
    }

    const skip = (page - 1) * limit;

    const users = await User.find(filter)
      .select("-password") // don't expose password
      .skip(skip)
      .limit(limit)
      .sort({ updated_at: -1 });

    return users;
  

}

async createCase(data: CreateCaseInput) {
  const newCase = await Case.create({
      case_number: `CASE-${Date.now()}`, // Generate a unique case number
      status: data.status,
      title: data.title,
      description: data.description,
      summary: data.summary,
      key_points: data.key_points,
      important_dates: data.important_dates,
      client_id: data.client_id,
      lawyer_id: data.lawyer_id,
      files: data.files || [],
    });

    return newCase;
}

async getUsersByType(type: "client" | "lawyer") {
    const users = await User.find({ account_type: type }).select("-password");
    return users;
  }

  // Blog CRUD service methods

  async getBlogs(): Promise<any[]> {
    return Blog.find();
  }

  async getBlogById(id: string): Promise<any | null> {
    return Blog.findById(id);
  }

  async createBlog(blogData: any): Promise<any> {
    const blog = new Blog(blogData);
    return blog.save();
  }

  async updateBlog(id: string, updates: any): Promise<any | null> {
    return Blog.findByIdAndUpdate(id, updates, { new: true });
  }

  async deleteBlog(id: string): Promise<void> {
    await Blog.findByIdAndDelete(id);
  }
}

export default new UserService();