import { Request, Response } from 'express';
import Post, { ISpatialInfo, ICitation } from '../models/Post';
import { User } from '../models/user';
import Bookmark from '../models/Bookmark';
import * as QRCode from 'qrcode';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { uploadImg } from '../utils/fileUpload';
import { v4 as uuidv4 } from 'uuid';
import dbConfig from "../config/secretManagerConfig";


// Initialize OpenAI client only if API key is available
let openai: OpenAI | null = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class PostController {
    private openai: OpenAI | null = null;
    private googleAI: GoogleGenAI | null = null;
    private initPromise: Promise<void> | null = null;
    private initialized: boolean = false;
  
    constructor() {
      this.initPromise = this.init();
    }

    private async ensureInitialized(): Promise<void> {
      if (this.initPromise) {
        try {
          await this.initPromise;
        } catch (error) {
          this.initPromise = this.init();
          await this.initPromise;
        }
        this.initPromise = null;
      }
  
      if (!this.initialized || !this.openai) {
        throw new Error("OpenAI client not properly initialized");
      }
    }
  
    private async init(): Promise<void> {
      try {
        const dbData = await dbConfig.secretManagerConnection();
  
        if (!dbData.openaiApiKey) {
          throw new Error("OpenAI API key not found in configuration");
        }

        if (!dbData.googleAiApiKey) {
          throw new Error("Google AI API key not found in configuration");
        }
  
        this.openai = new OpenAI({
          apiKey: dbData.openaiApiKey,
        });

        this.googleAI = new GoogleGenAI({
          apiKey: dbData.googleAiApiKey,
        });
  
        this.initialized = true;
        console.log("OpenAI and Google AI clients initialized successfully");
      } catch (error) {
        console.error("Failed to initialize AI clients:", error);
        this.initialized = false;
        this.openai = null;
        this.googleAI = null;
        throw error;
      }
    }
  // Create a new post with spatial metadata
  static async createPost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const {
        title,
        content,
        spatialInfo,
        citations,
        hashtag,
        hashtags,
        usefulLinks,
        status = 'published',
        image
      } = req.body;
      const userId = req.user?.userId;

   

      // Generate slug from title (support Korean characters)
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-가-힣]/g, '') // Keep Korean characters (가-힣)
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
        .substring(0, 100); // Limit to 100 characters

      // Check if slug already exists and make it unique
      let uniqueSlug = slug;
      let counter = 1;
      while (await Post.findOne({ slug: uniqueSlug })) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
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
        slug: uniqueSlug,
        spatialInfo: spatialInfo || undefined,
        citations: citations || [],
        hashtag: hashtag || undefined,
        hashtags: hashtags || [],
        usefulLinks: usefulLinks || [],
        status,
        image: image || undefined
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
          hashtag: newPost.hashtag,
          hashtags: newPost.hashtags,
          usefulLinks: newPost.usefulLinks,
          customUrl: newPost.customUrl,
          shortUrl: newPost.shortUrl,
          qrCodeUrl: newPost.qrCodeUrl,
          image: newPost.image,
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
      const type = req.query.type as string;
    

      // Build filter object
      const filter: any = {};

      if (status && status!=='all') {
        filter.status = status;
      }
      let posts;
      if(type==="dashboard"){
        posts = await Post.find({
          ...filter
        })
          .populate('author', 'first_name last_name email avatar')
          .populate('citations.userId', 'first_name last_name email')
          .sort({ createdAt: -1 })
      }
      else{
      posts = await Post.find({
        author: req.user?.userId,
        ...filter
      })
        .populate('author', 'first_name last_name email avatar')
        .populate('citations.userId', 'first_name last_name email')
        .sort({ createdAt: -1 })
      }



      

        console.log(posts,"postspostspostspostspostsposts")
        
     

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
            hashtags: post.hashtags,
            usefulLinks: post.usefulLinks,
            image: post.image,
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
          hashtags: post.hashtags,
          usefulLinks: post.usefulLinks,
          image: post.image,
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

  // Get post by ID
  static async getPostById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: 'Post ID is required'
        });
        return;
      }

      const post = await Post.findById(id)
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
          hashtags: post.hashtags,
          usefulLinks: post.usefulLinks,
          image: post.image,
          customUrl: post.customUrl,
          shortUrl: post.shortUrl,
          qrCodeUrl: post.qrCodeUrl,
          status: post.status,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error getting post by ID:', error);
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
      let { slug } = req.params;
      
      // Decode slug in case it contains UTF-8 characters
      slug = decodeURIComponent(slug);

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
          message: `Post with slug "${slug}" not found`
        });
        return;
      }

      if (typeof post.generateQrCodeUrl !== 'function') {
        throw new Error('generateQrCodeUrl method not found on post document');
      }

      const qrCodeUrl = post.generateQrCodeUrl();
      
      // Use the library directly if import style is the issue
      const qrcodeLib = require('qrcode');
      const qrCodeDataUrl = await qrcodeLib.toDataURL(qrCodeUrl);

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
      console.error('Error in generateQrCode:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error during QR generation',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
            hashtags: post.hashtags,
            usefulLinks: post.usefulLinks,
            image: post.image,
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



    return null;
  }



  // Get all posts with pagination and search
  static async getAllPosts(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string || '';
      const author = req.query.author as string || '';

      const skip = (page - 1) * limit;

      // Build search query
      const searchQuery: any = {};

      if (search) {
        searchQuery.$or = [
          { title: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      if (author) {
        searchQuery.author = author;
      }

      const posts = await Post.find(searchQuery)
        .populate('author', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const totalPosts = await Post.countDocuments(searchQuery);
      const totalPages = Math.ceil(totalPosts / limit);

      res.status(200).json({
        success: true,
        message: "Posts retrieved successfully",
        data: {
          posts,
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
      console.error("Error fetching posts:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Get related posts (by category)
  static async getRelatedPosts(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;

      if (!id) {
        res.status(400).json({
          success: false,
          message: "Post ID is required"
        });
        return;
      }

      // Get the current post to find related ones
      const currentPost = await Post.findById(id).lean();

      if (!currentPost) {
        res.status(404).json({
          success: false,
          message: "Post not found"
        });
        return;
      }

      // Find related posts by author or recent posts
      const relatedPosts = await Post.find({
        _id: { $ne: id }, // Exclude current post
        author: currentPost.author
      })
        .populate('author', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.status(200).json({
        success: true,
        message: "Related posts retrieved successfully",
        data: relatedPosts
      });
    } catch (error: any) {
      console.error("Error fetching related posts:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Get post categories
  static async getPostCategories(req: Request, res: Response): Promise<void> {
    try {
      const categories = await Post.distinct('category');
      
      res.status(200).json({
        success: true,
        message: "Post categories retrieved successfully",
        data: categories.filter(cat => cat && cat.trim() !== '')
      });
    } catch (error: any) {
      console.error("Error fetching post categories:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Get popular posts (by views or engagement)
  static async getPopularPosts(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 10;

      const popularPosts = await Post.find()
        .populate('author', 'first_name last_name email')
        .sort({ views: -1, createdAt: -1 }) // Sort by views if available
        .limit(limit)
        .lean();

      res.status(200).json({
        success: true,
        message: "Popular posts retrieved successfully",
        data: popularPosts
      });
    } catch (error: any) {
      console.error("Error fetching popular posts:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Get recent posts
  static async getRecentPosts(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 5;

      const recentPosts = await Post.find()
        .populate('author', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.status(200).json({
        success: true,
        message: "Recent posts retrieved successfully",
        data: recentPosts
      });
    } catch (error: any) {
      console.error("Error fetching recent posts:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Search posts by content
  static async searchPosts(req: Request, res: Response): Promise<void> {
    try {
      const { query } = req.query;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!query) {
        res.status(400).json({
          success: false,
          message: "Search query is required"
        });
        return;
      }

      const posts = await Post.find({
        $or: [
          { title: { $regex: query, $options: 'i' } },
          { content: { $regex: query, $options: 'i' } }
        ]
      })
        .populate('author', 'first_name last_name email')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      res.status(200).json({
        success: true,
        message: "Posts search completed successfully",
        data: posts
      });
    } catch (error: any) {
      console.error("Error searching posts:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Update post
  static async updatePost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const post = await Post.findById(id);

      if (!post) {
        res.status(404).json({
          success: false,
          message: 'Post not found'
        });
        return;
      }

      // Check if user is the author
      if (post.author.toString() !== userId) {
        res.status(403).json({
          success: false,
          message: 'You can only update your own posts'
        });
        return;
      }

      // Update allowed fields
      const allowedUpdates = [
        'title', 'content', 'status', 'spatialInfo', 
        'citations', 'hashtag', 'hashtags', 'usefulLinks', 'image'
      ];
      
      allowedUpdates.forEach(field => {
        if (updates[field] !== undefined) {
          (post as any)[field] = updates[field];
        }
      });

      await post.save();

      res.status(200).json({
        success: true,
        message: 'Post updated successfully',
        data: post
      });

    } catch (error: any) {
      console.error('Error updating post:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Delete post
  static async deletePost(req: AuthenticatedRequest, res: Response): Promise<void> {
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

      const post = await Post.findById(id);

      if (!post) {
        res.status(404).json({
          success: false,
          message: 'Post not found'
        });
        return;
      }

      // Check if user is the author
      if (post.author.toString() !== userId) {
        res.status(403).json({
          success: false,
          message: 'You can only delete your own posts'
        });
        return;
      }

      await Post.findByIdAndDelete(id);

      res.status(200).json({
        success: true,
        message: 'Post deleted successfully'
      });

    } catch (error: any) {
      console.error('Error deleting post:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Increment post views
  static async incrementPostViews(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          message: "Post ID is required"
        });
        return;
      }

      await Post.findByIdAndUpdate(
        id,
        { $inc: { views: 1 } },
        { new: true }
      );

      res.status(200).json({
        success: true,
        message: "Post views updated successfully"
      });
    } catch (error: any) {
      console.error("Error updating post views:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
        error: error.message
      });
    }
  }

  // Generate AI post content
   async generateAiPost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await this.ensureInitialized();
      const {
        prompt,
        topic,
        tone = 'professional',
        length = 'long',
        includeHashtags = true,
        spatialInfo,
        citations,
        image,
        language
      } = req.body;
      const userId = req.user?.userId;

      console.log(language,"language selected for AI generation:", language)

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!prompt && !topic) {
        res.status(400).json({
          success: false,
          message: 'Either prompt or topic is required'
        });
        return;
      }

      // Check if OpenAI is available
      if (!this.openai) {
        res.status(503).json({
          success: false,
          message: 'AI content generation is currently unavailable. Please configure OPENAI_API_KEY environment variable.'
        });
        return;
      }
      
      const aiPrompt = `
You are a professional legal content writer. Create a comprehensive, detailed, and informative LARGE post about: ${prompt || topic}

Requirements:
- Strictly Write in ${language} language
- Write in a ${tone} tone
- Make it LARGE and comprehensive (1200-2000 words minimum)
- Include practical legal insights and real-world examples
- Structure with clear headings, subheadings, and well-organized paragraphs
- Make it engaging for legal professionals and clients
- Focus on accuracy and professionalism
- Provide actionable advice and detailed explanations
- Include relevant case studies or examples where appropriate
- Add appropriate emojis throughout the content to make it more engaging (⚖️ 📋 💼 🏛️ 📝 etc.)
- Include 3-5 relevant hashtags at the end
- Add 2-3 useful reference links or resources related to the topic
- Include practical tips and actionable steps
- Use bullet points and numbered lists where appropriate

IMPORTANT: Return ONLY valid JSON format with no additional text, explanations, markdown formatting, code fences, or code blocks. Do not wrap the JSON in code blocks. The response must be pure JSON that can be directly parsed.

{
  "title": "Engaging title with emoji for the post in ${language}",
  "content": "Full comprehensive post content with emojis, proper formatting, useful links, and practical tips in ${language}",
  "hashtags": ["#RelevantHashtag1", "#RelevantHashtag2", "#RelevantHashtag3"],
  "usefulLinks": [
    {"title": "Resource Title", "url": "https://example.com", "description": "Brief description"},
    {"title": "Another Resource", "url": "https://example2.com", "description": "Brief description"}
  ]
}
`;

      // Generate content using OpenAI
      const completion = await this.openai!.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a professional legal content writer specializing in creating informative, accurate, and engaging legal content. CRITICAL: You must respond with ONLY pure JSON format. Do not include any explanations, markdown formatting, code blocks, or additional text. The response must start with { and end with } and be directly parseable as JSON."
          },
          {
            role: "user",
            content: aiPrompt
          }
        ],
        max_tokens: 3000, // Increased for larger posts with emojis, hashtags, and links
        temperature: 0.7,
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        res.status(500).json({
          success: false,
          message: 'Failed to generate content'
        });
        return;
      }

      // Parse AI response with improved error handling
      let aiResponse;
      try {
        // Clean the response content to ensure valid JSON
        let cleanedContent = responseContent.trim();
        
        // Remove any markdown code blocks if present
        cleanedContent = cleanedContent.replace(/```json\s*|```\s*$/g, '');
        
        // Try to find JSON content if wrapped in other text
        const jsonMatch = cleanedContent.match(/{[\s\S]*}/);
        if (jsonMatch) {
          cleanedContent = jsonMatch[0];
        }
        
        aiResponse = JSON.parse(cleanedContent);
        
        // Validate required fields
        if (!aiResponse.title || !aiResponse.content) {
          throw new Error('Missing required fields in AI response');
        }
        
      } catch (parseError) {
        console.error('JSON parsing error:', parseError);
        console.error('Raw response:', responseContent);
        
        // Fallback if JSON parsing fails
        aiResponse = {
          title: topic || 'AI Generated Legal Post',
          content: responseContent,
          hashtags: ['#LegalAdvice', '#LawTech'],
          usefulLinks: []
        };
      }

      // Generate slug from AI title (support Korean characters)
      const slug = aiResponse.title
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '') // Include Korean characters
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
        .substring(0, 100); // Limit length

      // Check if slug already exists and make it unique
      let uniqueSlug = slug;
      let counter = 1;
      while (await Post.findOne({ slug: uniqueSlug })) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
      }

    

      // Create new AI-generated post
      const newPost = new Post({
        title: aiResponse.title,
        content: aiResponse.content,
        author: userId,
        slug: uniqueSlug,
        spatialInfo: spatialInfo || undefined,
        citations: citations || [],
        hashtag: aiResponse.hashtags && aiResponse.hashtags.length > 0 ? aiResponse.hashtags[0] : undefined,
        hashtags: aiResponse.hashtags || [],
        usefulLinks: aiResponse.usefulLinks || [],
        status: 'published',
        isAiGenerated: true,
        aiPrompt: prompt || topic,
        image: image || undefined
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
        message: 'AI post generated successfully',
        data: {
          _id: newPost._id,
          title: newPost.title,
          content: newPost.content,
          author: newPost.author,
          slug: newPost.slug,
          spatialInfo: newPost.spatialInfo,
          citations: newPost.citations,
          hashtag: newPost.hashtag,
          hashtags: newPost.hashtags,
          usefulLinks: newPost.usefulLinks,
          customUrl: newPost.customUrl,
          shortUrl: newPost.shortUrl,
          qrCodeUrl: newPost.qrCodeUrl,
          image: newPost.image,
          status: newPost.status,
          isAiGenerated: newPost.isAiGenerated,
          aiPrompt: newPost.aiPrompt,
          createdAt: newPost.createdAt,
          updatedAt: newPost.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error generating AI post:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Generate AI image using Google Gemini
  async generateAiImage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      await this.ensureInitialized();
      const { prompt } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!prompt) {
        res.status(400).json({
          success: false,
          message: 'Prompt is required'
        });
        return;
      }

      // Check if Google AI is available
      if (!this.googleAI) {
        res.status(503).json({
          success: false,
          message: 'AI image generation is currently unavailable. Please configure Google AI API key.'
        });
        return;
      }

      // Generate image using Google GenAI Imagen
      const enhancedPrompt = `Create a professional legal-themed image: ${prompt}. Style should be modern, clean, and suitable for legal content. High quality, professional photography style.`;

      const response = await this.googleAI.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: enhancedPrompt,
        config: {
          numberOfImages: 1,
        },
      });

      const generatedImage = response.generatedImages?.[0];
      if (!generatedImage || !generatedImage.image?.imageBytes) {
        res.status(500).json({
          success: false,
          message: 'Failed to generate image'
        });
        return;
      }

      // Convert base64 image bytes to data URL format for uploadImg function
      const base64Image = generatedImage.image.imageBytes;
      const dataUrl = `data:image/png;base64,${base64Image}`;
      
      // Generate unique filename
      const fileName = `ai-legal-image-${Date.now()}-${uuidv4().substring(0, 8)}.png`;

      try {
        // Upload to S3 using existing utility
        const imageUrl = await uploadImg(dataUrl, fileName, userId);

        res.status(200).json({
          success: true,
          message: 'AI image generated and uploaded successfully',
          data: {
            imageUrl,
            prompt: enhancedPrompt,
            fileName
          }
        });

      } catch (uploadError) {
        console.error('Error uploading image to S3:', uploadError);
        
        // Fallback: return base64 if S3 upload fails
        const fallbackImageUrl = `data:image/png;base64,${base64Image}`;
        
        res.status(200).json({
          success: true,
          message: 'AI image generated successfully (S3 upload failed, returning base64)',
          data: {
            imageUrl: fallbackImageUrl,
            prompt: enhancedPrompt,
            uploadWarning: 'Image uploaded as base64 due to S3 upload failure'
          }
        });
      }

    } catch (error: any) {
      console.error('Error generating AI image:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }

  // Static wrapper for generateAiImage
  static async generateAiImage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const instance = new PostController();
    return instance.generateAiImage(req, res);
  }

  // Get all bookmarked posts for a user (no pagination)
  static async getBookmarkedPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Find all bookmarked posts for the user
      const bookmarkedPosts = await Bookmark.find({ userId })
        .populate({
          path: 'postId',
          populate: {
            path: 'author',
            select: 'first_name last_name email avatar'
          }
        })
        .sort({ createdAt: -1 })
        .lean();

      // Filter out any bookmarks where the post might have been deleted
      const validBookmarkedPosts = bookmarkedPosts.filter((bookmark: any) => bookmark.postId);

      // Format the response
      const formattedPosts = validBookmarkedPosts.map((bookmark: any) => ({
        _id: bookmark._id,
        post: {
          _id: bookmark.postId._id,
          title: bookmark.postId.title,
          content: bookmark.postId.content,
          author: bookmark.postId.author,
          slug: bookmark.postId.slug,
          spatialInfo: bookmark.postId.spatialInfo,
          citations: bookmark.postId.citations,
          hashtag: bookmark.postId.hashtag,
          hashtags: bookmark.postId.hashtags,
          usefulLinks: bookmark.postId.usefulLinks,
          image: bookmark.postId.image,
          customUrl: bookmark.postId.customUrl,
          shortUrl: bookmark.postId.shortUrl,
          qrCodeUrl: bookmark.postId.qrCodeUrl,
          status: bookmark.postId.status,
          isAiGenerated: bookmark.postId.isAiGenerated,
          aiPrompt: bookmark.postId.aiPrompt,
          createdAt: bookmark.postId.createdAt,
          updatedAt: bookmark.postId.updatedAt
        },
        createdAt: bookmark.createdAt,
        updatedAt: bookmark.updatedAt
      }));

      res.status(200).json({
        success: true,
        message: 'Bookmarked posts retrieved successfully',
        data: {
          bookmarks: formattedPosts,
          totalCount: formattedPosts.length
        }
      });

    } catch (error: any) {
      console.error('Error getting bookmarked posts:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  }
}

export default PostController;
