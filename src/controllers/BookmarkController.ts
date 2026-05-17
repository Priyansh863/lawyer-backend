import { Request, Response } from 'express';
import Bookmark from '../models/Bookmark';
import Post from '../models/Post';
interface AuthRequest extends Request {
  user?: {
    id: string;
    userId: string;
    role: string;
  };
}

export class BookmarkController {
  // Add bookmark
  static async addBookmark(req: any, res: Response) {
    try {
      const { postId } = req.body;
      const userId = req?.id;

   


      // Check if post exists
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({
          success: false,
          message: 'Post not found'
        });
      }

      // Check if bookmark already exists
      const existingBookmark = await Bookmark.findOne({ userId, postId });
      if (existingBookmark) {
        return res.status(400).json({
          success: false,
          message: 'Post already bookmarked'
        });
      }

      // Create bookmark
      const bookmark = new Bookmark({ userId, postId });
      await bookmark.save();

      res.status(201).json({
        success: true,
        message: 'Post bookmarked successfully',
        data: bookmark
      });
    } catch (error) {
      console.error('Error adding bookmark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Remove bookmark
  static async removeBookmark(req: any, res: Response) {
    try {
      const { postId } = req.params;
      const userId = req?.id;

     

      const bookmark = await Bookmark.findOneAndDelete({ userId, postId });
      if (!bookmark) {
        return res.status(404).json({
          success: false,
          message: 'Bookmark not found'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Bookmark removed successfully'
      });
    } catch (error) {
      console.error('Error removing bookmark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get user bookmarks
  static async getUserBookmarks(req: any, res: Response) {
    try {
      const userId = req?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

   

      const bookmarks = await Bookmark.find({ userId })
        .populate({
          path: 'postId',
          select: 'title content slug createdAt updatedAt author hashtags'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Bookmark.countDocuments({ userId });

      res.status(200).json({
        success: true,
        data: {
          bookmarks,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });
    } catch (error) {
      console.error('Error getting bookmarks:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Check if post is bookmarked
  static async checkBookmark(req: any, res: Response) {
    try {
      const { postId } = req.params;
      const userId = req?.id;


      const bookmark = await Bookmark.findOne({ userId, postId });

      res.status(200).json({
        success: true,
        data: {
          isBookmarked: !!bookmark
        }
      });
    } catch (error) {
      console.error('Error checking bookmark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Toggle bookmark
  static async toggleBookmark(req: any, res: Response) {
    try {
      const { postId } = req.body;
      const userId = req?.id;


      if (!postId) {
        return res.status(400).json({
          success: false,
          message: 'Post ID is required'
        });
      }

      // Check if bookmark exists
      const existingBookmark = await Bookmark.findOne({ userId, postId });

      if (existingBookmark) {
        // Remove bookmark
        await Bookmark.findOneAndDelete({ userId, postId });
        res.status(200).json({
          success: true,
          message: 'Bookmark removed successfully',
          data: { isBookmarked: false }
        });
      } else {
        // Add bookmark
        const bookmark = new Bookmark({ userId, postId });
        await bookmark.save();
        res.status(201).json({
          success: true,
          message: 'Post bookmarked successfully',
          data: { isBookmarked: true }
        });
      }
    } catch (error) {
      console.error('Error toggling bookmark:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
