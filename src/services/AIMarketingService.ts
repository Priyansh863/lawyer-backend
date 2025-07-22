import OpenAI from 'openai';
import AIMarketing, { IAIMarketing } from '../models/AIMarketing';
import config from '../config/envConfig';

interface GeneratePostData {
  userId: string;
  prompt: string;
  contentType?: 'post' | 'article' | 'social_media';
  platforms?: string[];
  imageUrls?: string[];
  tags?: string[];
}

interface UpdatePostData {
  status?: 'draft' | 'published' | 'scheduled';
  scheduledAt?: Date;
  platforms?: string[];
  tags?: string[];
}

class AIMarketingService {
  private openai: OpenAI;

  constructor() {
    const envConfig = config();
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || envConfig.openaiApiKey
    });
  }

  // Generate AI content based on prompt
  private async generateAIContent(prompt: string, contentType: string, platforms: string[]): Promise<string> {
    try {
      const platformContext = platforms.length > 0 
        ? `This content will be posted on: ${platforms.join(', ')}. ` 
        : '';
      
      const contentTypeContext = this.getContentTypeContext(contentType);
      
      const systemPrompt = `You are a professional content creator specializing in legal marketing. ${platformContext}${contentTypeContext}
      
      Guidelines:
      - Keep the tone professional yet engaging
      - Focus on legal expertise and value
      - Include relevant hashtags if appropriate for the platform
      - Make it actionable and informative
      - Ensure compliance with legal advertising rules
      - Keep within platform character limits when specified`;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1000,
        temperature: 0.7
      });

      return completion.choices[0]?.message?.content || 'Unable to generate content';
    } catch (error) {
      console.error('Error generating AI content:', error);
      throw new Error('Failed to generate AI content');
    }
  }

  private getContentTypeContext(contentType: string): string {
    switch (contentType) {
      case 'social_media':
        return 'Create engaging social media content that encourages interaction. ';
      case 'article':
        return 'Create a detailed, informative article with proper structure and headings. ';
      case 'post':
      default:
        return 'Create a professional post that provides value to the audience. ';
    }
  }

  // Generate and save AI marketing post
  static async generatePost(data: GeneratePostData): Promise<IAIMarketing> {
    try {
      const service = new AIMarketingService();
      
      // Generate AI content
      const generatedContent = await service.generateAIContent(
        data.prompt,
        data.contentType || 'post',
        data.platforms || []
      );

      // Prepare images array
      const images = data.imageUrls?.map((url, index) => ({
        url,
        alt_text: `Generated content image ${index + 1}`,
        position: index
      })) || [];

      // Create new AI marketing post
      const aiMarketingPost = new AIMarketing({
        user_id: data.userId,
        prompt: data.prompt,
        generated_content: generatedContent,
        content_type: data.contentType || 'post',
        platforms: data.platforms || [],
        images,
        tags: data.tags || [],
        status: 'draft'
      });

      return await aiMarketingPost.save();
    } catch (error) {
      console.error('Error generating AI marketing post:', error);
      throw new Error('Failed to generate AI marketing post');
    }
  }

  // Get all AI marketing posts for a user
  static async getUserPosts(
    userId: string, 
    page: number = 1, 
    limit: number = 20,
    status?: string,
    contentType?: string
  ): Promise<{
    posts: IAIMarketing[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      
      // Build filter query
      const filter: any = { 
        user_id: userId, 
        is_active: true 
      };
      
      if (status) {
        filter.status = status;
      }
      
      if (contentType) {
        filter.content_type = contentType;
      }

      const posts = await AIMarketing.find(filter)
        .populate('user_id', 'name email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await AIMarketing.countDocuments(filter);

      return {
        posts,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting user AI marketing posts:', error);
      throw new Error('Failed to get user AI marketing posts');
    }
  }

  // Get single AI marketing post by ID
  static async getPostById(postId: string, userId: string): Promise<IAIMarketing | null> {
    try {
      return await AIMarketing.findOne({
        _id: postId,
        user_id: userId,
        is_active: true
      }).populate('user_id', 'name email');
    } catch (error) {
      console.error('Error getting AI marketing post by ID:', error);
      throw new Error('Failed to get AI marketing post');
    }
  }

  // Update AI marketing post
  static async updatePost(postId: string, userId: string, updateData: UpdatePostData): Promise<IAIMarketing | null> {
    try {
      const post = await AIMarketing.findOne({
        _id: postId,
        user_id: userId,
        is_active: true
      });

      if (!post) {
        throw new Error('Post not found');
      }

      // Update fields
      if (updateData.status) {
        post.status = updateData.status;
        
        if (updateData.status === 'published' && !post.published_at) {
          post.published_at = new Date();
        }
      }

      if (updateData.scheduledAt) {
        post.scheduled_at = updateData.scheduledAt;
      }

      if (updateData.platforms) {
        post.platforms = updateData.platforms;
      }

      if (updateData.tags) {
        post.tags = updateData.tags;
      }

      return await post.save();
    } catch (error) {
      console.error('Error updating AI marketing post:', error);
      throw new Error('Failed to update AI marketing post');
    }
  }

  // Delete AI marketing post (soft delete)
  static async deletePost(postId: string, userId: string): Promise<void> {
    try {
      const post = await AIMarketing.findOne({
        _id: postId,
        user_id: userId,
        is_active: true
      });

      if (!post) {
        throw new Error('Post not found');
      }

      post.is_active = false;
      await post.save();
    } catch (error) {
      console.error('Error deleting AI marketing post:', error);
      throw new Error('Failed to delete AI marketing post');
    }
  }

  // Regenerate content for existing post
  static async regenerateContent(postId: string, userId: string, newPrompt?: string): Promise<IAIMarketing | null> {
    try {
      const post = await AIMarketing.findOne({
        _id: postId,
        user_id: userId,
        is_active: true
      });

      if (!post) {
        throw new Error('Post not found');
      }

      const service = new AIMarketingService();
      const promptToUse = newPrompt || post.prompt;
      
      // Generate new content
      const generatedContent = await service.generateAIContent(
        promptToUse,
        post.content_type,
        post.platforms
      );

      // Update post
      post.prompt = promptToUse;
      post.generated_content = generatedContent;
      post.status = 'draft'; // Reset to draft when regenerated

      return await post.save();
    } catch (error) {
      console.error('Error regenerating AI marketing post content:', error);
      throw new Error('Failed to regenerate AI marketing post content');
    }
  }

  // Get posts by platform
  static async getPostsByPlatform(
    userId: string, 
    platform: string, 
    page: number = 1, 
    limit: number = 20
  ): Promise<{
    posts: IAIMarketing[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;

      const posts = await AIMarketing.find({
        user_id: userId,
        platforms: platform,
        is_active: true
      })
        .populate('user_id', 'name email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit);

      const total = await AIMarketing.countDocuments({
        user_id: userId,
        platforms: platform,
        is_active: true
      });

      return {
        posts,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      console.error('Error getting posts by platform:', error);
      throw new Error('Failed to get posts by platform');
    }
  }

  // Update engagement metrics
  static async updateEngagementMetrics(
    postId: string, 
    userId: string, 
    metrics: {
      likes?: number;
      shares?: number;
      comments?: number;
      views?: number;
    }
  ): Promise<IAIMarketing | null> {
    try {
      const post = await AIMarketing.findOne({
        _id: postId,
        user_id: userId,
        is_active: true
      });

      if (!post) {
        throw new Error('Post not found');
      }

      // Update engagement metrics
      if (metrics.likes !== undefined) {
        post.engagement_metrics!.likes = metrics.likes;
      }
      if (metrics.shares !== undefined) {
        post.engagement_metrics!.shares = metrics.shares;
      }
      if (metrics.comments !== undefined) {
        post.engagement_metrics!.comments = metrics.comments;
      }
      if (metrics.views !== undefined) {
        post.engagement_metrics!.views = metrics.views;
      }

      return await post.save();
    } catch (error) {
      console.error('Error updating engagement metrics:', error);
      throw new Error('Failed to update engagement metrics');
    }
  }
}

export default AIMarketingService;
