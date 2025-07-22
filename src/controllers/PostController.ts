import { Request, Response } from 'express';
import Post, { ISpatialInfo, ICitation } from '../models/Post';
import { User } from '../models/user';
import QRCode from 'qrcode';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class PostController {
  // Create a new post with spatial metadata
  static async createPost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const {
        title,
        content,
        spatialInfo,
        citations,
        status = 'draft'
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
      if (!title || !content) {
        res.status(400).json({
          success: false,
          message: 'Title and content are required'
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

      // Generate slug from title
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();

      // Check if slug already exists
      const existingPost = await Post.findOne({ slug });
      if (existingPost) {
        res.status(400).json({
          success: false,
          message: 'A post with this title already exists. Please choose a different title.'
        });
        return;
      }

      // Validate spatial info if provided
      if (spatialInfo) {
        const validationError = PostController.validateSpatialInfo(spatialInfo);
        if (validationError) {
          res.status(400).json({
            success: false,
            message: validationError
          });
          return;
        }
      }

      // Validate citations if provided
      if (citations && Array.isArray(citations)) {
        for (const citation of citations) {
          const validationError = await PostController.validateCitation(citation);
          if (validationError) {
            res.status(400).json({
              success: false,
              message: validationError
            });
            return;
          }
        }
      }

      // Create new post
      const newPost = new Post({
        title,
        content,
        author: userId,
        slug,
        spatialInfo: spatialInfo || undefined,
        citations: citations || [],
        status
      });

      await newPost.save();
      await newPost.populate('author', 'first_name last_name email avatar');

      // Generate QR code if spatial info is present
      let qrCodeDataUrl = null;
      if (newPost.spatialInfo && newPost.spatialInfo.latitude && newPost.spatialInfo.longitude) {
        try {
          qrCodeDataUrl = await QRCode.toDataURL(newPost.generateQrCodeUrl());
          newPost.qrCodeUrl = qrCodeDataUrl;
          await newPost.save();
        } catch (qrError) {
          console.error('QR Code generation failed:', qrError);
        }
      }

      res.status(201).json({
        success: true,
        message: 'Post created successfully',
        data: {
          _id: newPost._id,
          title: newPost.title,
          content: newPost.content,
          author: newPost.author,
          slug: newPost.slug,
          spatialInfo: newPost.spatialInfo,
          citations: newPost.citations,
          customUrl: newPost.customUrl,
          shortUrl: newPost.shortUrl,
          qrCodeUrl: newPost.qrCodeUrl,
          status: newPost.status,
          createdAt: newPost.createdAt,
          updatedAt: newPost.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error creating post:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get all posts with pagination and filtering
  static async getPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;
      const author = req.query.author as string;
      const search = req.query.search as string;
      const hasLocation = req.query.hasLocation as string;

      // Build filter object
      const filter: any = {};

      if (status) {
        filter.status = status;
      }

      if (author) {
        filter.author = author;
      }

      if (hasLocation === 'true') {
        filter['spatialInfo.latitude'] = { $exists: true };
        filter['spatialInfo.longitude'] = { $exists: true };
      }

      // Add search functionality
      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate skip value for pagination
      const skip = (page - 1) * limit;

      // Get posts with pagination
      const posts = await Post.find(filter)
        .populate('author', 'first_name last_name email avatar')
        .populate('citations.userId', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const totalPosts = await Post.countDocuments(filter);
      const totalPages = Math.ceil(totalPosts / limit);

      res.status(200).json({
        success: true,
        data: {
          posts: posts.map(post => ({
            _id: post._id,
            title: post.title,
            content: post.content,
            author: post.author,
            slug: post.slug,
            spatialInfo: post.spatialInfo,
            citations: post.citations,
            customUrl: post.customUrl,
            shortUrl: post.shortUrl,
            qrCodeUrl: post.qrCodeUrl,
            status: post.status,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
          })),
          pagination: {
            currentPage: page,
            totalPages,
            totalPosts,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Error getting posts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get single post by slug
  static async getPostBySlug(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      if (!slug) {
        res.status(400).json({
          success: false,
          message: 'Post slug is required'
        });
        return;
      }

      const post = await Post.findOne({ slug })
        .populate('author', 'first_name last_name email avatar')
        .populate('citations.userId', 'first_name last_name email');

      if (!post) {
        res.status(404).json({
          success: false,
          message: 'Post not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          _id: post._id,
          title: post.title,
          content: post.content,
          author: post.author,
          slug: post.slug,
          spatialInfo: post.spatialInfo,
          citations: post.citations,
          customUrl: post.customUrl,
          shortUrl: post.shortUrl,
          qrCodeUrl: post.qrCodeUrl,
          status: post.status,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error getting post:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Parse location from URL
  static async parseLocationUrl(req: Request, res: Response): Promise<void> {
    try {
      const { url } = req.body;

      if (!url) {
        res.status(400).json({
          success: false,
          message: 'URL is required'
        });
        return;
      }

      const spatialInfo = Post.parseLocationUrl(url);

      res.status(200).json({
        success: true,
        data: {
          spatialInfo,
          hasLocation: !!spatialInfo
        }
      });

    } catch (error: any) {
      console.error('Error parsing location URL:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Generate QR code for post
  static async generateQrCode(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { slug } = req.params;

      if (!slug) {
        res.status(400).json({
          success: false,
          message: 'Post slug is required'
        });
        return;
      }

      const post = await Post.findOne({ slug });

      if (!post) {
        res.status(404).json({
          success: false,
          message: 'Post not found'
        });
        return;
      }

      const qrCodeUrl = post.generateQrCodeUrl();
      const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);

      // Update post with QR code
      post.qrCodeUrl = qrCodeDataUrl;
      await post.save();

      res.status(200).json({
        success: true,
        data: {
          qrCodeDataUrl,
          targetUrl: qrCodeUrl
        }
      });

    } catch (error: any) {
      console.error('Error generating QR code:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user's own posts
  static async getMyPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      // Get user's posts with pagination
      const posts = await Post.find(filter)
        .populate('author', 'first_name last_name email avatar')
        .populate('citations.userId', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const totalPosts = await Post.countDocuments(filter);
      const totalPages = Math.ceil(totalPosts / limit);

      res.status(200).json({
        success: true,
        data: {
          posts: posts.map(post => ({
            _id: post._id,
            title: post.title,
            content: post.content,
            author: post.author,
            slug: post.slug,
            spatialInfo: post.spatialInfo,
            citations: post.citations,
            customUrl: post.customUrl,
            shortUrl: post.shortUrl,
            qrCodeUrl: post.qrCodeUrl,
            status: post.status,
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
          })),
          pagination: {
            currentPage: page,
            totalPages,
            totalPosts,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Error getting user posts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper method to validate spatial info
  private static validateSpatialInfo(spatialInfo: ISpatialInfo): string | null {
    if (spatialInfo.latitude !== undefined) {
      if (spatialInfo.latitude < -90 || spatialInfo.latitude > 90) {
        return 'Latitude must be between -90 and 90';
      }
      const latDecimalPlaces = (spatialInfo.latitude.toString().split('.')[1] || '').length;
      if (latDecimalPlaces < 5 || latDecimalPlaces > 7) {
        return 'Latitude must have 5-7 decimal places';
      }
    }

    if (spatialInfo.longitude !== undefined) {
      if (spatialInfo.longitude < -180 || spatialInfo.longitude > 180) {
        return 'Longitude must be between -180 and 180';
      }
      const lngDecimalPlaces = (spatialInfo.longitude.toString().split('.')[1] || '').length;
      if (lngDecimalPlaces < 5 || lngDecimalPlaces > 7) {
        return 'Longitude must have 5-7 decimal places';
      }
    }

    if (spatialInfo.altitude !== undefined) {
      if (spatialInfo.altitude < -500 || spatialInfo.altitude > 9000) {
        return 'Altitude must be between -500 and 9000 meters';
      }
    }

    if (spatialInfo.floor !== undefined) {
      if (!Number.isInteger(spatialInfo.floor)) {
        return 'Floor must be an integer';
      }
    }

    if (spatialInfo.timestamp !== undefined) {
      const timestamp = new Date(spatialInfo.timestamp);
      if (isNaN(timestamp.getTime())) {
        return 'Invalid timestamp format. Use ISO 8601 format';
      }
    }

    return null;
  }

  // Helper method to validate citations
  private static async validateCitation(citation: ICitation): Promise<string | null> {
    if (!citation.type || !['spatial', 'user', 'url'].includes(citation.type)) {
      return 'Citation type must be spatial, user, or url';
    }

    if (!citation.content || citation.content.length > 500) {
      return 'Citation content is required and must be less than 500 characters';
    }

    if (citation.type === 'user' && citation.userId) {
      const user = await User.findById(citation.userId);
      if (!user) {
        return 'Referenced user not found';
      }
    }

    if (citation.type === 'url' && citation.url) {
      try {
        new URL(citation.url);
      } catch {
        return 'Invalid URL format in citation';
      }
    }

    if (citation.type === 'spatial' && citation.spatialInfo) {
      return PostController.validateSpatialInfo(citation.spatialInfo);
    }

    return null;
  }
}

export default PostController;
