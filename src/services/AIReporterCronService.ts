import * as cron from 'node-cron';
import { AIReporterSettings, AIGeneratedArticle, EGenerationMode, EArticleStatus } from '../models/AIReporter';
import { User } from '../models/user';
import Post from '../models/Post';
import OpenAI from 'openai';
import dbConfig from "../config/secretManagerConfig";



export class AIReporterCronService {
  private static cronJobs: Map<string, cron.ScheduledTask> = new Map();

  // Initialize all cron jobs for active AI reporters
  static async initializeCronJobs() {
    try {
      console.log('Initializing AI Reporter cron jobs...');
      
      const activeSettings = await AIReporterSettings.find({ 
        isActive: true,
        generationMode: { $in: [EGenerationMode.Daily, EGenerationMode.Weekly] }
      });

      console.log(activeSettings,"activeSettingsactiveSettingsactiveSettingsactiveSettings")

      for (const setting of activeSettings) {
        await this.setupCronJob(setting);
      }

      console.log(`Initialized ${activeSettings.length} AI Reporter cron jobs`);
    } catch (error) {
      console.error('Error initializing AI Reporter cron jobs:', error);
    }
  }

  // Setup individual cron job for a setting
  static async setupCronJob(setting: any) {
    try {
      const cronExpression = this.getCronExpression(setting);
      const jobKey = setting.aiReporterId.toString();

      // Remove existing job if any
      if (this.cronJobs.has(jobKey)) {
        this.cronJobs.get(jobKey)?.stop();
        this.cronJobs.delete(jobKey);
      }
      // Create new cron job
      const task = cron.schedule(cronExpression, async () => {
        await this.generateScheduledArticle(setting.aiReporterId);
      }, {
        timezone: "Etc/UTC"
      });

      this.cronJobs.set(jobKey, task);
      console.log(`Cron job setup for AI Reporter ${jobKey} with expression: ${cronExpression}`);
    } catch (error) {
      console.error(`Error setting up cron job for ${setting.aiReporterId}:`, error);
    }
  }

  // Generate cron expression based on settings
  static getCronExpression(setting: any): string {
    const [hours, minutes] = setting.timeOfGeneration.split(':');
    
    if (setting.generationMode === EGenerationMode.Daily) {
      // Daily at specified time
      return `${minutes} ${hours} * * *`;
    } else if (setting.generationMode === EGenerationMode.Weekly) {
      // Weekly on Monday at specified time
      return `${minutes} ${hours} * * 1`;
    }
    
    throw new Error('Invalid generation mode for cron job');
  }

  // Generate scheduled article
  static async generateScheduledArticle(aiReporterId: string) {
    try {
      console.log(`Generating scheduled article for AI Reporter: ${aiReporterId}`);
      
      const settings = await AIReporterSettings.findOne({ aiReporterId });
      if (!settings || !settings.isActive) {
        console.log(`AI Reporter ${aiReporterId} is inactive, skipping generation`);
        return;
      }

      // Check if we've reached the daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayArticlesCount = await AIGeneratedArticle.countDocuments({
        generatedBy: aiReporterId,
        created_at: { $gte: today, $lt: tomorrow }
      });

      console.log(`Daily articles count for AI Reporter ${aiReporterId}: ${todayArticlesCount}`);

      // if (todayArticlesCount >= settings.maxArticlesPerDay) {
      //   console.log(`Daily limit reached for AI Reporter ${aiReporterId}`);
      //   return;
      // }

      // Get recent posts from followed lawyers
      const recentPosts = await Post.find({
        author: { $in: settings.lawyersToFollow },
        created_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
      }).populate('author', 'first_name last_name pratice_area').limit(10);

      if (recentPosts.length === 0) {
        console.log(`No recent content found for AI Reporter ${aiReporterId}`);
        return;
      }

      console.log(`Recent posts found for AI Reporter ${aiReporterId}: ${recentPosts}`);

      // Prepare content for AI analysis
      const sourceContent = recentPosts.map(post => ({
        title: post.title,
        content: post.content,
        author: post.author,
        tags: post.hashtags,
        practiceArea: (post.author as any)?.pratice_area
      }));

      console.log(`Source content for AI Reporter ${aiReporterId}: ${sourceContent}`);

      // Generate article using OpenAI
      const prompt = `
      As a legal AI reporter, analyze the following recent legal content and create a comprehensive, well-designed HTML article with optional images and authoritative links.
      
      Source Content:
      ${JSON.stringify(sourceContent, null, 2)}
      
      Target Legal Fields: ${settings.legalFields.join(', ')}
      Target Tags: ${settings.targetTags.join(', ')}
      
      REQUIREMENTS
      1) Title
         - A compelling title (max 100 characters).
      
      2) Article (VERY COMPREHENSIVE: 2,000–3,000 words) with GOOD HTML DESIGN
         - Use semantic HTML: <article>, <header>, <section>, <h1–h3>, <p>, <ul>/<ol>, <blockquote>, <table>, <aside>, <footer>.
         - Add a Table of Contents at the top with anchor links (<nav> with <a href="#section-id">).
         - Clear sections with IDs: #introduction, #main-analysis, #practical-applications, #challenges-solutions, #best-practices, #conclusion, #faq.
         - Include professional legal terminology, multiple perspectives, case studies, practical implications, challenges/solutions, best practices, and FAQs.
      
      3) IMAGES (OPTIONAL, ONLY IF AVAILABLE)
         - Use 3–5 **real, publicly accessible, royalty-free or official images** (Unsplash, Wikimedia Commons, Pexels, or official court/government sites).
         - DO NOT insert <img> tags if no reliable image is available. Skip instead of leaving blank space.
         - Every <img> must be inside a <figure> with:
             <img src="https://..." alt="descriptive alt" loading="lazy" style="max-width:100%;height:auto;border-radius:12px;">
             <figcaption>Short caption with <a href="https://..." target="_blank" rel="noopener noreferrer">Source</a></figcaption>
         - Images should appear only where they enhance understanding and always accompany related text.
      
      4) LINKS (MANDATORY)
         - Throughout the article, add contextual hyperlinks to authoritative legal resources (court opinions, statutes, journals, government sites).
         - All <a> tags must include target="_blank" rel="noopener noreferrer".
         - Anchor text must be meaningful (no “click here”).
      
      5) References
         - ALWAYS include 4–6 relevant reference links that directly support the analysis.
      
      6) Tags
         - 8–12 relevant hashtags.
      
      7) Legal Field
         - Choose the most relevant legal field from: Family Law, Property Law, Criminal Law, Corporate Law, Labor Law, Tax Law, Intellectual Property, Immigration.
      
      8) Summary
         - 150–200 words, objective and comprehensive.
      
      9) OUTPUT FORMAT
      Return valid JSON (no code fences), exactly this shape:
      {
        "title": "Article title",
        "content": "<article> ... FULL HTML with headings, TOC, optional figures/images (ONLY if valid), tables, lists, blockquotes, and professional layout ... </article>",
        "tags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
        "legalField": "Family Law",
        "summary": "150–200 word summary...",
        "referenceLinks": [
          "https://authoritative-legal-resource-1.example",
          "https://authoritative-legal-resource-2.example",
          "https://authoritative-legal-resource-3.example",
          "https://authoritative-legal-resource-4.example"
        ]
      }
      
      STYLE RULES
      - Only insert <figure> if a real image with valid URL is found.
      - Do NOT leave empty <img> or figcaption placeholders.
      - Keep spacing tight (no large blank gaps).
      - Ensure JSON is valid and the "content" field contains complete HTML with no broken or missing tags.
      - No code blocks,code fence or markdown; only JSON.
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

      console.log(`AI response for AI Reporter ${aiReporterId}: ${completion.choices[0].message.content}`);

      const aiResponse = completion.choices[0].message.content;
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      console.log(`AI response for AI Reporter ${aiReporterId}: ${aiResponse}`);

      const generatedContent = JSON.parse(aiResponse);

      console.log(`Generated content for AI Reporter ${aiReporterId}: ${generatedContent}`);

      // Create AI Generated Article
      const article = new AIGeneratedArticle({
        title: generatedContent.title,
        content: generatedContent.content,
        tags: generatedContent.tags,
        legalField: generatedContent.legalField,
        status: EArticleStatus.Draft,
        generatedBy: aiReporterId,
        sourceLawyers: recentPosts.map(post => post.author._id),
        sourceContent: JSON.stringify(sourceContent),
        generationPrompt: prompt,
        scheduledFor: new Date()
      });

      await article.save();

      // Auto-publish if configured (for now, we'll keep as draft)
      console.log(`Article generated successfully for AI Reporter ${aiReporterId}: ${article.title}`);

    } catch (error) {
      console.error(`Error generating scheduled article for ${aiReporterId}:`, error);
    }
  }

  // Update cron job when settings change
  static async updateCronJob(aiReporterId: string) {
    try {
      const settings = await AIReporterSettings.findOne({ aiReporterId });
      if (settings && settings.isActive && 
          (settings.generationMode === EGenerationMode.Daily || settings.generationMode === EGenerationMode.Weekly)) {
        await this.setupCronJob(settings);
      } else {
        this.removeCronJob(aiReporterId);
      }
    } catch (error) {
      console.error(`Error updating cron job for ${aiReporterId}:`, error);
    }
  }

  // Remove cron job
  static removeCronJob(aiReporterId: string) {
    const jobKey = aiReporterId.toString();
    if (this.cronJobs.has(jobKey)) {
      this.cronJobs.get(jobKey)?.stop();
      this.cronJobs.delete(jobKey);
      console.log(`Cron job removed for AI Reporter ${jobKey}`);
    }
  }

  // Archive old articles based on settings
  static async archiveOldArticles() {
    try {
      console.log('Running archive cleanup for old articles...');
      
      const activeSettings = await AIReporterSettings.find({ isActive: true });
      
      for (const setting of activeSettings) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - setting.maxArticleAge);

        // Find articles that meet archival criteria
        const articlesToArchive = await AIGeneratedArticle.find({
          generatedBy: setting.aiReporterId,
          status: EArticleStatus.Published,
          created_at: { $lt: cutoffDate },
          views: { $lt: setting.minViewsToAutoArchive }
        });

        for (const article of articlesToArchive) {
          article.status = EArticleStatus.Archived;
          article.archivedAt = new Date();
          await article.save();

          // Update corresponding post if exists
          if (article.postId) {
            await Post.findByIdAndUpdate(article.postId, { status: 'archived' });
          }
        }

        if (articlesToArchive.length > 0) {
          console.log(`Archived ${articlesToArchive.length} articles for AI Reporter ${setting.aiReporterId}`);
        }
      }
    } catch (error) {
      console.error('Error archiving old articles:', error);
    }
  }

  // Initialize archive cleanup cron job (runs daily at midnight)
  static initializeArchiveCleanup() {
    cron.schedule('0 0 * * *', async () => {
      await this.archiveOldArticles();
    }, {
      timezone: "Asia/Kolkata"
    });
    
    console.log('Archive cleanup cron job initialized');
  }

  // Stop all cron jobs
  static stopAllCronJobs() {
    this.cronJobs.forEach((task, key) => {
      task.stop();
      console.log(`Stopped cron job for AI Reporter ${key}`);
    });
    this.cronJobs.clear();
  }
}
