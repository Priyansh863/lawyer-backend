import OpenAI from 'openai';
import dbConfig from "../config/secretManagerConfig";


class OpenAIUtils {
  private openai: OpenAI;

  constructor() {
  
  }

    async init(): Promise<void> {
      const dbData = await dbConfig.secretManagerConnection();
      this.openai = new OpenAI({
        apiKey: dbData.openaiApiKey,
      });
    }
  /**
   * Generate summary using OpenAI GPT
   */
  async generateDocumentSummary(text: string): Promise<string> {
    try {
      // Limit text length to avoid token limits (roughly 4000 tokens = ~16000 characters)
      const maxLength = 15000;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

      const completion = await this.openai.chat.completions.create({
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
   * Generate marketing content using OpenAI GPT
   */
  async generateMarketingContent(prompt: string): Promise<string> {
    try {
      await this.init();
      const completion = await this.openai.chat.completions.create({
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
