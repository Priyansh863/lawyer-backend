import { Request, Response } from 'express';
import Blog from '../models/blog';
import { User } from '../models/user';
import openaiUtilsEnhanced from '../utils/openaiUtilsEnhanced';

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

      // Get user details for author field
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Create the blog
      const blog = new Blog({
        title,
        content,
        excerpt: excerpt || content.substring(0, 200) + '...',
        category,
        status,
        image,
        author: userId
      });

      await blog.save();

      res.status(201).json({
        success: true,
        message: 'Blog created successfully',
        blog
      });

    } catch (error: any) {
      console.error('Error creating blog:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create blog'
      });
    }
  }

  // Get all blogs with filtering and pagination
  static async getBlogs(req: Request, res: Response): Promise<void> {
    try {
      const { 
        page = 1, 
        limit = 10, 
        category, 
        status, 
        search,
        author 
      } = req.query;

      // Build filter object
      const filter: any = {};
      
      if (category) filter.category = category;
      if (status) filter.status = status;
      if (author) filter.author = author;
      
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate pagination
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      // Get blogs with pagination
      const blogs = await Blog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      // Get total count for pagination
      const total = await Blog.countDocuments(filter);

      res.status(200).json({
        success: true,
        blogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error: any) {
      console.error('Error fetching blogs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch blogs'
      });
    }
  }

  // Get a single blog by ID
  static async getBlogById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const blog = await Blog.findById(id);
      if (!blog) {
        res.status(404).json({
          success: false,
          message: 'Blog not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        blog
      });

    } catch (error: any) {
      console.error('Error fetching blog:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch blog'
      });
    }
  }

  // Update a blog
  static async updateBlog(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { title, content, excerpt, category, status, image } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const blog = await Blog.findById(id);
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

      // Update fields
      if (title) blog.title = title;
      if (content) blog.content = content;
      if (excerpt) blog.excerpt = excerpt;
      if (category) blog.category = category;
      if (status) {
        blog.status = status;
      }
      if (image) blog.image = image;

      blog.updatedAt = new Date();

      await blog.save();

      res.status(200).json({
        success: true,
        message: 'Blog updated successfully',
        blog
      });

    } catch (error: any) {
      console.error('Error updating blog:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update blog'
      });
    }
  }

  // Delete a blog
  static async deleteBlog(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const blog = await Blog.findById(id);
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

      await Blog.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'Blog deleted successfully'
      });

    } catch (error: any) {
      console.error('Error deleting blog:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete blog'
      });
    }
  }

  // Get blogs by category
  static async getBlogsByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { category } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const blogs = await Blog.find({ category, status: 'published' })
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Blog.countDocuments({ category, status: 'published' });

      res.status(200).json({
        success: true,
        blogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error: any) {
      console.error('Error fetching blogs by category:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch blogs'
      });
    }
  }

  // Get published blogs only
  static async getPublishedBlogs(req: Request, res: Response): Promise<void> {
    try {
      const { page = 1, limit = 10, search } = req.query;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const filter: any = { status: 'published' };
      
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } },
          { excerpt: { $regex: search, $options: 'i' } }
        ];
      }

      const blogs = await Blog.find(filter)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Blog.countDocuments(filter);

      res.status(200).json({
        success: true,
        blogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error: any) {
      console.error('Error fetching published blogs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch blogs'
      });
    }
  }

  // Get user's blogs
  static async getUserBlogs(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      const { page = 1, limit = 10, status } = req.query;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      const skip = (pageNum - 1) * limitNum;

      const filter: any = { author: userId };
      if (status) filter.status = status;

      const blogs = await Blog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum);

      const total = await Blog.countDocuments(filter);

      res.status(200).json({
        success: true,
        blogs,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      });

    } catch (error: any) {
      console.error('Error fetching user blogs:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch blogs'
      });
    }
  }

  // Generate URL content with AI
  static async generateUrlContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { 
        url, 
        description, 
        hashtags = [], 
        citations = [], 
        floor, 
        address, 
        language = 'en' 
      } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Validate required fields
      if (!url) {
        res.status(400).json({
          success: false,
          message: 'URL is required'
        });
        return;
      }

      // Validate URL format
      try {
        new URL(url);
      } catch (error) {
        res.status(400).json({
          success: false,
          message: 'Invalid URL format'
        });
        return;
      }

      // Validate language
      const supportedLanguages = ['en', 'ko', 'es', 'fr', 'de', 'ja'];
      if (!supportedLanguages.includes(language)) {
        res.status(400).json({
          success: false,
          message: `Unsupported language. Supported languages: ${supportedLanguages.join(', ')}`
        });
        return;
      }

      console.log(`Generating URL content for: ${url} in language: ${language}`);

      // Initialize OpenAI utils
      await openaiUtilsEnhanced.init();

      // Generate URL content with all provided fields
      const content = await openaiUtilsEnhanced.generateUrlContent(
        url,
        description || '',
        language,
        Array.isArray(hashtags) ? hashtags : [],
        Array.isArray(citations) ? citations : [],
        floor || '',
        address || ''
      );

      res.status(200).json({
        success: true,
        message: 'URL content generated successfully',
        content,
        metadata: {
          url,
          language,
          hashtags: hashtags.length,
          citations: citations.length,
          hasFloor: !!floor,
          hasAddress: !!address,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('Error generating URL content:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate URL content'
      });
    }
  }

  // Generate blog content with AI
  static async generateBlogContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { 
        topic, 
        hashtags = [], 
        citations = [], 
        language = 'en' 
      } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Validate required fields
      if (!topic) {
        res.status(400).json({
          success: false,
          message: 'Topic is required'
        });
        return;
      }

      // Validate language
      const supportedLanguages = ['en', 'ko', 'es', 'fr', 'de', 'ja'];
      if (!supportedLanguages.includes(language)) {
        res.status(400).json({
          success: false,
          message: `Unsupported language. Supported languages: ${supportedLanguages.join(', ')}`
        });
        return;
      }

      console.log(`Generating blog content for topic: ${topic} in language: ${language}`);

      // Initialize OpenAI utils
      await openaiUtilsEnhanced.init();

      // Generate blog content
      const content = await openaiUtilsEnhanced.generateBlogContent(
        topic,
        language,
        Array.isArray(hashtags) ? hashtags : [],
        Array.isArray(citations) ? citations : []
      );

      res.status(200).json({
        success: true,
        message: 'Blog content generated successfully',
        content,
        metadata: {
          topic,
          language,
          hashtags: hashtags.length,
          citations: citations.length,
          generatedAt: new Date().toISOString()
        }
      });

    } catch (error: any) {
      console.error('Error generating blog content:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate blog content'
      });
    }
  }
}

export default BlogController;
