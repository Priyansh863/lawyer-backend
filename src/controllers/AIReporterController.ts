import { Request, Response } from 'express';
import { AIReporterSettings, AIGeneratedArticle, EGenerationMode, EArticleStatus, ELegalField } from '../models/AIReporter';
import { User } from '../models/user';
import Post from '../models/Post';
import OpenAI from 'openai';
import dbConfig from "../config/secretManagerConfig";


// Extend Request interface to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    account_type: string;
  };
  id?: string;
  role?: string;
}



export class AIReporterController {
  // Get AI Reporter Settings
  static async getSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const settings = await AIReporterSettings.findOne({ aiReporterId: req.user?.id })
        .populate('lawyersToFollow', 'first_name last_name email pratice_area')
        .populate('aiReporterId', 'first_name last_name email');

      if (!settings) {
        return res.status(404).json({
          success: false,
          message: 'AI Reporter settings not found'
        });
      }

      res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      console.error('Error fetching AI Reporter settings:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create or Update AI Reporter Settings
  static async updateSettings(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        targetTags,
        legalFields,
        lawyersToFollow,
        generationMode,
        maxArticlesPerDay,
        timeOfGeneration,
        minViewsToAutoArchive,
        maxArticleAge,
        archiveVisibility,
        isActive
      } = req.body;

      const settingsData = {
        targetTags,
        legalFields,
        lawyersToFollow,
        generationMode,
        maxArticlesPerDay,
        timeOfGeneration,
        minViewsToAutoArchive,
        maxArticleAge,
        archiveVisibility,
        isActive,
        aiReporterId: req.user?.id
      };

      const settings = await AIReporterSettings.findOneAndUpdate(
        { aiReporterId: req.user?.id },
        settingsData,
        { new: true, upsert: true }
      ).populate('lawyersToFollow', 'first_name last_name email pratice_area');

      res.status(200).json({
        success: true,
        message: 'AI Reporter settings updated successfully',
        data: settings
      });
    } catch (error) {
      console.error('Error updating AI Reporter settings:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get Generated Articles
  static async getGeneratedArticles(req: AuthenticatedRequest, res: Response) {
    try {
      const { page = 1, limit = 10, status, legalField } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const filter: any = { generatedBy: req.user?.id };
      if (status) filter.status = status;
      if (legalField) filter.legalField = legalField;

      const articles = await AIGeneratedArticle.find(filter)
        .populate('generatedBy', 'first_name last_name email')
        .populate('sourceLawyers', 'first_name last_name email pratice_area')
        .populate('postId')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(Number(limit));

      const total = await AIGeneratedArticle.countDocuments(filter);

      res.status(200).json({
        success: true,
        data: {
          articles,
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(total / Number(limit)),
            totalArticles: total,
            hasNext: skip + Number(limit) < total,
            hasPrev: Number(page) > 1
          }
        }
      });
    } catch (error) {
      console.error('Error fetching generated articles:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Generate AI Article
  static async generateArticle(req: AuthenticatedRequest, res: Response) {
    try {
      const settings = await AIReporterSettings.findOne({ aiReporterId: req.user?.id });
      
      if (!settings || !settings.isActive) {
        return res.status(400).json({
          success: false,
          message: 'AI Reporter is not configured or inactive'
        });
      }

      // Get recent posts from followed lawyers
      const recentPosts = await Post.find({
        author: { $in: settings.lawyersToFollow },
        created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }).populate('author', 'first_name last_name pratice_area').limit(10);

      if (recentPosts.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No recent content found from followed lawyers'
        });
      }

      // Prepare content for AI analysis
      const sourceContent = recentPosts.map(post => ({
        title: post.title,
        content: post.content,
        author: post.author,
        tags: post.hashtags,
        practiceArea: (post.author as any)?.pratice_area
      }));

      // Generate article using OpenAI
      const prompt = `
        As a legal AI reporter, analyze the following recent legal content and create a comprehensive article:
        
        Source Content:
        ${JSON.stringify(sourceContent, null, 2)}
        
        Recent Posts Context:
        ${recentPosts.map(post => `
        Title: ${post.title}
        Content: ${post.content.substring(0, 500)}...
        Author: ${(post.author as any)?.first_name} ${(post.author as any)?.last_name}
        Practice Area: ${(post.author as any)?.pratice_area || 'General Legal'}
        Tags: ${post.hashtags?.join(', ') || 'None'}
        `).join('\n')}
        
        Please create:
        1. A compelling title (max 100 characters)
        2. A VERY COMPREHENSIVE article (minimum 2000-3000 words) that:
           - Provides extensive legal analysis and insights from the source content
           - Includes detailed background information and context
           - Covers multiple perspectives and detailed case studies
           - Uses professional legal terminology and in-depth explanations
           - Includes practical implications and step-by-step guidance
           - Covers potential challenges, solutions, and best practices
           - Maintains objectivity and accuracy with thorough analysis
           - Structures content with clear sections: Introduction, Main Analysis, Practical Applications, Challenges & Solutions, Best Practices, Conclusion
        3. Relevant hashtags (8-12 tags)
        4. Choose the most relevant legal field from these valid options: Family Law, Property Law, Criminal Law, Corporate Law, Labor Law, Tax Law, Intellectual Property, Immigration
        5. ALWAYS include 4-6 relevant reference links that directly relate to the article content and provide additional authoritative legal resources
        6. A comprehensive summary (150-200 words)
        
        Format your response as JSON with no code fence and code blocks:
        {
          "title": "Article title",
          "content": "VERY LONG and comprehensive article content with proper HTML formatting including headings, paragraphs, lists, and emphasis",
          "tags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6", "tag7", "tag8"],
          "legalField": "Family Law",
          "summary": "Comprehensive summary of the article",
          "referenceLinks": ["https://relevant-legal-resource1.com", "https://relevant-legal-resource2.com", "https://relevant-legal-resource3.com", "https://relevant-legal-resource4.com"]
        }
      `;

      const dbData = await dbConfig.secretManagerConnection();

      const openai = new OpenAI({
        apiKey: dbData.openaiApiKey,
      });

      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      });

      const aiResponse = completion.choices[0].message.content;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      // Clean the AI response to remove control characters and fix JSON formatting
      let cleanedResponse = aiResponse
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
        .replace(/\n/g, '\\n') // Escape newlines
        .replace(/\r/g, '\\r') // Escape carriage returns
        .replace(/\t/g, '\\t') // Escape tabs
        .trim();

      // Extract JSON from response if it's wrapped in code blocks
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleanedResponse = jsonMatch[0];
      }

      let generatedContent;
      try {
        generatedContent = JSON.parse(cleanedResponse);
      } catch (parseError) {
        console.error('JSON parsing error in manual generation:', parseError);
        console.error('Cleaned response that failed to parse:', cleanedResponse);
        throw new Error(`Failed to parse AI response as JSON: ${parseError.message}`);
      }

      // Create AI Generated Article
      const article = new AIGeneratedArticle({
        title: generatedContent.title,
        content: generatedContent.content,
        summary: generatedContent.summary,
        tags: generatedContent.tags,
        legalField: generatedContent.legalField,
        referenceLinks: generatedContent.referenceLinks || [],
        status: EArticleStatus.Draft,
        generatedBy: req.user?.id,
        sourceLawyers: recentPosts.map(post => post.author._id),
        sourceContent: JSON.stringify(sourceContent),
        generationPrompt: prompt
      });

      await article.save();

      res.status(201).json({
        success: true,
        message: 'Article generated successfully',
        data: article
      });
    } catch (error) {
      console.error('Error generating article:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate article',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Publish Article
  static async publishArticle(req: AuthenticatedRequest, res: Response) {
    try {
      const { articleId } = req.params;
      
      const article = await AIGeneratedArticle.findById(articleId);
      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }

      if (article.generatedBy.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to publish this article'
        });
      }

      // Create Post from AI Generated Article
      const post = new Post({
        title: article.title,
        content: article.content,
        hashtags: article.tags,
        author: req.user?.id,
        category: 'AI Generated',
        status: 'published',
        slug: article.title.toLowerCase().replace(/\s+/g, '-') + '-' + articleId, 
        ai_generated: true,
        source_article: articleId
      });

      await post.save();

      // Update article status
      article.status = EArticleStatus.Published;
      article.postId = post._id;
      article.publishedAt = new Date();
      await article.save();

      res.status(200).json({
        success: true,
        message: 'Article published successfully',
        data: { article, post }
      });
    } catch (error) {
      console.error('Error publishing article:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to publish article'
      });
    }
  }

  // Archive Article
  static async archiveArticle(req: AuthenticatedRequest, res: Response) {
    try {
      const { articleId } = req.params;
      
      const article = await AIGeneratedArticle.findById(articleId);
      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }

      if (article.generatedBy.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to archive this article'
        });
      }

      article.status = EArticleStatus.Archived;
      article.archivedAt = new Date();
      await article.save();

      // If article was published, update the post status
      if (article.postId) {
        await Post.findByIdAndUpdate(article.postId, { status: 'archived' });
      }

      res.status(200).json({
        success: true,
        message: 'Article archived successfully',
        data: article
      });
    } catch (error) {
      console.error('Error archiving article:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to archive article'
      });
    }
  }

  // Get Dashboard Stats
  static async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      const totalArticles = await AIGeneratedArticle.countDocuments({ generatedBy: req.user?.id });
      const publishedArticles = await AIGeneratedArticle.countDocuments({ 
        generatedBy: req.user?.id, 
        status: EArticleStatus.Published 
      });
      const draftArticles = await AIGeneratedArticle.countDocuments({ 
        generatedBy: req.user?.id, 
        status: EArticleStatus.Draft 
      });
      const archivedArticles = await AIGeneratedArticle.countDocuments({ 
        generatedBy: req.user?.id, 
        status: EArticleStatus.Archived 
      });

      // Get latest activity
      const latestArticle = await AIGeneratedArticle.findOne({ generatedBy: req.user?.id })
        .sort({ created_at: -1 });

      // Get settings
      const settings = await AIReporterSettings.findOne({ aiReporterId: req.user?.id });

      res.status(200).json({
        success: true,
        data: {
          stats: {
            totalArticles,
            publishedArticles,
            draftArticles,
            archivedArticles
          },
          latestActivity: (latestArticle as any)?.created_at || null,
          generationMode: settings?.generationMode || EGenerationMode.Manual,
          isActive: settings?.isActive || false
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete Article
  static async deleteArticle(req: AuthenticatedRequest, res: Response){
    try {
      const { articleId } = req.params;
      
      const article = await AIGeneratedArticle.findById(articleId);
      if (!article) {
        return res.status(404).json({
          success: false,
          message: 'Article not found'
        });
      }

      if (article.generatedBy.toString() !== req.user?.id) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized to delete this article'
        });
      }

      // If article was published, delete the post too
      if (article.postId) {
        await Post.findByIdAndDelete(article.postId);
      }

      await AIGeneratedArticle.findByIdAndDelete(articleId);

      res.status(200).json({
        success: true,
        message: 'Article deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting article:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete article'
      });
    }
  }

  static async getArticles(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const status = req.query.status as string;
      const search = req.query.search as string;

      const query: any = {};
      
      if (status && status !== 'all') {
        query.status = status;
      }

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: 'i' } },
          { tags: { $in: [new RegExp(search, 'i')] } },
          { legalField: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;

      const articles = await AIGeneratedArticle.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await AIGeneratedArticle.countDocuments(query);

      res.status(200).json({
        success: true,
        articles,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Error fetching articles:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch articles'
      });
    }
  }

  static async getArticleById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const article = await AIGeneratedArticle.findById(id)
        .populate('generatedBy', 'first_name last_name email')
        .populate('sourceLawyers', 'first_name last_name email')
        .lean();

      if (!article) {
        res.status(404).json({
          success: false,
          message: 'Article not found'
        });
        return;
      }

      res.status(200).json({
        success: true,
        article
      });
    } catch (error) {
      console.error('Error fetching article:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch article'
      });
    }
  }

  // Get Available Lawyers to Follow
  static async getAvailableLawyers(req: Request, res: Response) {
    try {
      const lawyers = await User.find({ 
        account_type: 'lawyer',
        is_verified: 1,
        is_active: 1
      }).select('first_name last_name email pratice_area experience profile_image');

      res.status(200).json({
        success: true,
        data: lawyers
      });
    } catch (error) {
      console.error('Error fetching lawyers:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
