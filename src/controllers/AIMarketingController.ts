import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import AIMarketingService from '../services/AIMarketingService';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    role: string;
  };
}

class AIMarketingController {
  // Generate AI marketing post
  static async generatePost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const { 
        prompt, 
        contentType, 
        platforms, 
        imageUrls, 
        tags 
      } = req.body;

      const post = await AIMarketingService.generatePost({
        userId,
        prompt,
        contentType,
        platforms,
        imageUrls,
        tags
      });

      res.status(201).json({
        success: true,
        message: 'AI marketing post generated successfully',
        data: post
      });
    } catch (error: any) {
      console.error('Error in generatePost:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to generate AI marketing post'
      });
    }
  }

  // Get all user's AI marketing posts
  static async getUserPosts(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const status = req.query.status as string;
      const contentType = req.query.contentType as string;

      const result = await AIMarketingService.getUserPosts(
        userId, 
        page, 
        limit, 
        status, 
        contentType
      );

      res.status(200).json({
        success: true,
        message: 'AI marketing posts retrieved successfully',
        data: result
      });
    } catch (error: any) {
      console.error('Error in getUserPosts:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get AI marketing posts'
      });
    }
  }

  // Get single AI marketing post by ID
  static async getPostById(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const post = await AIMarketingService.getPostById(postId, userId);

      if (!post) {
        res.status(404).json({
          success: false,
          message: 'AI marketing post not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'AI marketing post retrieved successfully',
        data: post
      });
    } catch (error: any) {
      console.error('Error in getPostById:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get AI marketing post'
      });
    }
  }

  // Update AI marketing post
  static async updatePost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { postId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const { status, scheduledAt, platforms, tags } = req.body;

      const updatedPost = await AIMarketingService.updatePost(postId, userId, {
        status,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        platforms,
        tags
      });

      if (!updatedPost) {
        res.status(404).json({
          success: false,
          message: 'AI marketing post not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'AI marketing post updated successfully',
        data: updatedPost
      });
    } catch (error: any) {
      console.error('Error in updatePost:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update AI marketing post'
      });
    }
  }

  // Delete AI marketing post
  static async deletePost(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      await AIMarketingService.deletePost(postId, userId);

      res.status(200).json({
        success: true,
        message: 'AI marketing post deleted successfully'
      });
    } catch (error: any) {
      console.error('Error in deletePost:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete AI marketing post'
      });
    }
  }

  // Regenerate content for existing post
  static async regenerateContent(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { postId } = req.params;
      const { newPrompt } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const updatedPost = await AIMarketingService.regenerateContent(
        postId, 
        userId, 
        newPrompt
      );

      if (!updatedPost) {
        res.status(404).json({
          success: false,
          message: 'AI marketing post not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'AI marketing post content regenerated successfully',
        data: updatedPost
      });
    } catch (error: any) {
      console.error('Error in regenerateContent:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to regenerate AI marketing post content'
      });
    }
  }

  // Get posts by platform
  static async getPostsByPlatform(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { platform } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const result = await AIMarketingService.getPostsByPlatform(
        userId, 
        platform, 
        page, 
        limit
      );

      res.status(200).json({
        success: true,
        message: `AI marketing posts for ${platform} retrieved successfully`,
        data: result
      });
    } catch (error: any) {
      console.error('Error in getPostsByPlatform:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get posts by platform'
      });
    }
  }

  // Update engagement metrics
  static async updateEngagementMetrics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { postId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      const { likes, shares, comments, views } = req.body;

      const updatedPost = await AIMarketingService.updateEngagementMetrics(
        postId, 
        userId, 
        { likes, shares, comments, views }
      );

      if (!updatedPost) {
        res.status(404).json({
          success: false,
          message: 'AI marketing post not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Engagement metrics updated successfully',
        data: updatedPost
      });
    } catch (error: any) {
      console.error('Error in updateEngagementMetrics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update engagement metrics'
      });
    }
  }

  // Get analytics/stats for user's posts
  static async getPostAnalytics(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Get all user posts for analytics
      const allPosts = await AIMarketingService.getUserPosts(userId, 1, 1000);
      
      const analytics = {
        totalPosts: allPosts.total,
        draftPosts: allPosts.posts.filter(p => p.status === 'draft').length,
        publishedPosts: allPosts.posts.filter(p => p.status === 'published').length,
        scheduledPosts: allPosts.posts.filter(p => p.status === 'scheduled').length,
        totalEngagement: {
          likes: allPosts.posts.reduce((sum, p) => sum + (p.engagement_metrics?.likes || 0), 0),
          shares: allPosts.posts.reduce((sum, p) => sum + (p.engagement_metrics?.shares || 0), 0),
          comments: allPosts.posts.reduce((sum, p) => sum + (p.engagement_metrics?.comments || 0), 0),
          views: allPosts.posts.reduce((sum, p) => sum + (p.engagement_metrics?.views || 0), 0)
        },
        platformDistribution: this.getPlatformDistribution(allPosts.posts),
        contentTypeDistribution: this.getContentTypeDistribution(allPosts.posts)
      };

      res.status(200).json({
        success: true,
        message: 'Post analytics retrieved successfully',
        data: analytics
      });
    } catch (error: any) {
      console.error('Error in getPostAnalytics:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get post analytics'
      });
    }
  }

  private static getPlatformDistribution(posts: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    posts.forEach(post => {
      post.platforms.forEach((platform: string) => {
        distribution[platform] = (distribution[platform] || 0) + 1;
      });
    });

    return distribution;
  }

  private static getContentTypeDistribution(posts: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    posts.forEach(post => {
      const type = post.content_type;
      distribution[type] = (distribution[type] || 0) + 1;
    });

    return distribution;
  }
}

export default AIMarketingController;
