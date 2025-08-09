import OpenAI from 'openai';
import dbConfig from "../config/secretManagerConfig";


class OpenAIUtils {
  private openai: OpenAI | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized: boolean = false;

  constructor() {
    // Initialize OpenAI client immediately
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      const dbData = await dbConfig.secretManagerConnection();
      
      if (!dbData.openaiApiKey) {
        throw new Error('OpenAI API key not found in configuration');
      }
      
      this.openai = new OpenAI({
        apiKey: dbData.openaiApiKey,
      });
      
      this.initialized = true;
      console.log('OpenAI client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize OpenAI client:', error);
      this.initialized = false;
      this.openai = null;
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (error) {
        // Reset for retry
        this.initPromise = this.init();
        await this.initPromise;
      }
      this.initPromise = null;
    }
    
    if (!this.initialized || !this.openai) {
      throw new Error('OpenAI client not properly initialized');
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
        model: "gpt-4o",
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
 * Analyze image and return a general descriptive summary
 */
async analyzeImage(imageUrl: string, fileName: string): Promise<string> {
  try {
    await this.ensureInitialized();
    
    const completion = await this.openai!.chat.completions.create({
      model: "gpt-4o", // Use "gpt-4o" for higher accuracy
      messages: [
        {
          role: "system",
          content:
            "You are a helpful and descriptive media summarizer. Analyze the provided image and give a concise, clear description of what it contains. Mention key objects, people, actions, visible text, colors, and any notable details. Keep the summary under 200 words."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Here is an image to analyze: ${imageUrl}. The file name is "${fileName}". Please summarize the content of this image in a clear, human-readable way.`
            },
            {
              type: "image_url",
              image_url: { url: imageUrl }
            }
          ]
        }
      ],
      max_tokens: 300,
      temperature: 0.3
    });

    return completion.choices[0]?.message?.content || "Unable to analyze image";
  } catch (error) {
    console.error("Error analyzing image with OpenAI:", error);
    return `Image analysis: ${fileName} - Unable to automatically analyze this image.`;
  }
}

/**
 * Analyze video (placeholder — GPT can't see video directly)
 */
async analyzeVideo(videoUrl: string, fileName: string): Promise<string> {
  try {
    await this.ensureInitialized();

    const completion = await this.openai!.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful and descriptive media summarizer. You are given a video file link. Since you cannot view video content directly, provide a general suggestion for what the video might contain and the best next steps to analyze it, such as extracting key frames or transcribing audio for summarization."
        },
        {
          role: "user",
          content: `Here is a video to analyze: ${videoUrl}. The file name is "${fileName}". Provide a short description based on the file type and suggest next steps for deeper analysis.`
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    return completion.choices[0]?.message?.content ||
      `Video analysis: ${fileName} - Unable to automatically analyze video content.`;
  } catch (error) {
    console.error("Error analyzing video:", error);
    return `Video file detected: ${fileName} - Unable to automatically analyze video content.`;
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
