import { Request, Response } from 'express';
import Blog from '../models/blog';
import { User } from '../models/user';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class BlogController {
  // Create a new blog
  static async createBlog(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { title, content, excerpt, category, status = 'draft', image } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Validate required fields
      if (!title || !content || !category) {
        res.status(400).json({
          success: false,
          message: 'Title, content, and category are required'
        });
        return;
      }

      // Validate category
      const validCategories = ['legal-advice', 'case-studies', 'law-updates', 'firm-news'];
      if (!validCategories.includes(category)) {
        res.status(400).json({
          success: false,
          message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
        });
        return;
      }

      // Validate status
      const validStatuses = ['draft', 'published'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          message: 'Invalid status. Must be either draft or published'
        });
        return;
      }

      // Check if user exists
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Create new blog
      const newBlog = new Blog({
        title,
        content,
        author: userId,
        excerpt,
        category,
        status,
        image,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newBlog.save();
      await newBlog.populate('author', 'first_name last_name email avatar');

      res.status(201).json({
        success: true,
        message: 'Blog created successfully',
        data: {
          _id: newBlog._id,
          title: newBlog.title,
          content: newBlog.content,
          author: newBlog.author,
          excerpt: newBlog.excerpt,
          category: newBlog.category,
          status: newBlog.status,
          image: newBlog.image,
          createdAt: newBlog.createdAt,
          updatedAt: newBlog.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error creating blog:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get all blogs with pagination and filtering
  static async getBlogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const category = req.query.category as string;
      const status = req.query.status as string;
      const author = req.query.author as string;
      const search = req.query.search as string;

      // Build filter object
      const filter: any = {};

      if (category) {
        filter.category = category;
      }

      if (status) {
        filter.status = status;
      }

      if (author) {
        filter.author = author;
      }

      // Add search functionality
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate skip value for pagination
      const skip = (page - 1) * limit;

      // Get blogs with pagination
      const blogs = await Blog.find(filter)
        .populate('author', 'first_name last_name email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const totalBlogs = await Blog.countDocuments(filter);
      const totalPages = Math.ceil(totalBlogs / limit);

      res.status(200).json({
        success: true,
        data: {
          blogs: blogs.map(blog => ({
            _id: blog._id,
            title: blog.title,
            content: blog.content,
            author: blog.author,
            excerpt: blog.excerpt,
            category: blog.category,
            status: blog.status,
            image: blog.image,
            createdAt: blog.createdAt,
            updatedAt: blog.updatedAt
          })),
          pagination: {
            currentPage: page,
            totalPages,
            totalBlogs,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Error getting blogs:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get single blog by ID
  static async getBlogById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { blogId } = req.params;

      if (!blogId) {
        res.status(400).json({
          success: false,
          message: 'Blog ID is required'
        });
        return;
      }

      const blog = await Blog.findById(blogId)
        .populate('author', 'first_name last_name email avatar');

      if (!blog) {
        res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          _id: blog._id,
          title: blog.title,
          content: blog.content,
          author: blog.author,
          excerpt: blog.excerpt,
          category: blog.category,
          status: blog.status,
          image: blog.image,
          createdAt: blog.createdAt,
          updatedAt: blog.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error getting blog:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update blog
  static async updateBlog(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { blogId } = req.params;
      const { title, content, excerpt, category, status, image } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!blogId) {
        res.status(400).json({
          success: false,
          message: 'Blog ID is required'
        });
        return;
      }

      // Find the blog
      const blog = await Blog.findById(blogId);
      if (!blog) {
        res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
        return;
      }

      // Check if user is the author
      if (blog.author.toString() !== userId) {
        res.status(403).json({
          success: false,
          message: 'You can only update your own blogs'
        });
        return;
      }

      // Validate category if provided
      if (category) {
        const validCategories = ['legal-advice', 'case-studies', 'law-updates', 'firm-news'];
        if (!validCategories.includes(category)) {
          res.status(400).json({
            success: false,
            message: 'Invalid category. Must be one of: ' + validCategories.join(', ')
          });
          return;
        }
      }

      // Validate status if provided
      if (status) {
        const validStatuses = ['draft', 'published'];
        if (!validStatuses.includes(status)) {
          res.status(400).json({
            success: false,
            message: 'Invalid status. Must be either draft or published'
          });
          return;
        }
      }

      // Update blog
      const updatedBlog = await Blog.findByIdAndUpdate(
        blogId,
        {
          ...(title && { title }),
          ...(content && { content }),
          ...(excerpt && { excerpt }),
          ...(category && { category }),
          ...(status && { status }),
          ...(image && { image }),
          updatedAt: new Date()
        },
        { new: true }
      ).populate('author', 'first_name last_name email avatar');

      res.status(200).json({
        success: true,
        message: 'Blog updated successfully',
        data: {
          _id: updatedBlog!._id,
          title: updatedBlog!.title,
          content: updatedBlog!.content,
          author: updatedBlog!.author,
          excerpt: updatedBlog!.excerpt,
          category: updatedBlog!.category,
          status: updatedBlog!.status,
          image: updatedBlog!.image,
          createdAt: updatedBlog!.createdAt,
          updatedAt: updatedBlog!.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error updating blog:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete blog
  static async deleteBlog(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { blogId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!blogId) {
        res.status(400).json({
          success: false,
          message: 'Blog ID is required'
        });
        return;
      }

      // Find the blog
      const blog = await Blog.findById(blogId);
      if (!blog) {
        res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
        return;
      }

      // Check if user is the author
      if (blog.author.toString() !== userId) {
        res.status(403).json({
          success: false,
          message: 'You can only delete your own blogs'
        });
        return;
      }

      // Delete the blog
      await Blog.findByIdAndDelete(blogId);

      res.status(200).json({
        success: true,
        message: 'Blog deleted successfully'
      });

    } catch (error: any) {
      console.error('Error deleting blog:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user's own blogs
  static async getMyBlogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Build filter object
      const filter: any = { author: userId };

      if (status) {
        filter.status = status;
      }

      // Calculate skip value for pagination
      const skip = (page - 1) * limit;

      // Get user's blogs with pagination
      const blogs = await Blog.find(filter)
        .populate('author', 'first_name last_name email avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const totalBlogs = await Blog.countDocuments(filter);
      const totalPages = Math.ceil(totalBlogs / limit);

      res.status(200).json({
        success: true,
        data: {
          blogs: blogs.map(blog => ({
            _id: blog._id,
            title: blog.title,
            content: blog.content,
            author: blog.author,
            excerpt: blog.excerpt,
            category: blog.category,
            status: blog.status,
            image: blog.image,
            createdAt: blog.createdAt,
            updatedAt: blog.updatedAt
          })),
          pagination: {
            currentPage: page,
            totalPages,
            totalBlogs,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Error getting user blogs:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

export default BlogController;
