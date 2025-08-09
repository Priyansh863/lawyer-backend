import OpenAI from 'openai';
import dbConfig from "../config/secretManagerConfig";


class OpenAIUtils {
  private openai: OpenAI | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize OpenAI client immediately
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      const dbData = await dbConfig.secretManagerConnection();
      this.openai = new OpenAI({
        apiKey: dbData.openaiApiKey,
      });
      console.log('OpenAI client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }
  }
  /**
   * Generate summary using OpenAI GPT
   */
  async generateDocumentSummary(text: string): Promise<string> {
    try {
      // Ensure OpenAI client is initialized
      await this.ensureInitialized();
      
      // Limit text length to avoid token limits (roughly 4000 tokens = ~16000 characters)
      const maxLength = 15000;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

      const completion = await this.openai!.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a legal document analyzer. Provide a concise, professional summary of the document content focusing on key legal points, important dates, parties involved, and main objectives. Keep the summary under 500 words."
          },
          {
            role: "user",
            content: `Please provide a summary of the following document:\n\n${truncatedText}`
          }
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      return completion.choices[0]?.message?.content || 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating summary with OpenAI:', error);
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Analyze image using OpenAI Vision API
   */
  async analyzeImage(imageUrl: string, fileName: string): Promise<string> {
    try {
      await this.ensureInitialized();
      
      const completion = await this.openai!.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "system",
            content: "You are a legal document analyzer. Analyze this image and provide a concise, professional summary focusing on any legal content, text, signatures, or important visual elements. Keep the summary under 300 words."
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Please analyze this image file: ${fileName}`
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 400,
        temperature: 0.3,
      });

      return completion.choices[0]?.message?.content || 'Unable to analyze image';
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      // Fallback for images - return a generic summary
      return `Image analysis: ${fileName} - This appears to be a legal document or image file. Manual review recommended for detailed content analysis.`;
    }
  }

  /**
   * Analyze video (simplified approach - returns placeholder summary)
   */
  async analyzeVideo(videoUrl: string, fileName: string): Promise<string> {
    try {
      // Note: OpenAI doesn't directly support video analysis yet
      // This is a placeholder implementation
      console.log(`Video analysis requested for: ${fileName}`);
      
      // For now, return a generic summary
      return `Video analysis: ${fileName} - This is a video file that may contain legal content, presentations, or depositions. Manual review is recommended for detailed content analysis. Consider using specialized video transcription services for text extraction.`;
    } catch (error) {
      console.error('Error analyzing video:', error);
      return `Video file detected: ${fileName} - Unable to automatically analyze video content. Manual review required.`;
    }
  }

  /**
   * Generate marketing content using OpenAI GPT
   */
  async generateMarketingContent(prompt: string): Promise<string> {
    try {
      await this.ensureInitialized();
      const completion = await this.openai!.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7, // Higher creativity for marketing content
        presence_penalty: 0.1,
        frequency_penalty: 0.1
      });

      return completion.choices[0]?.message?.content || 'Unable to generate marketing content';
    } catch (error) {
      console.error('Error generating marketing content with OpenAI:', error);
      throw new Error(`Failed to generate marketing content: ${error.message}`);
    }
  }

  /**
   * Check if OpenAI API key is configured
   */
  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }
}

export default new OpenAIUtils();
