import Question from "../models/question";
import mongoose from "mongoose";

interface GetQuestionsParams {
  status?: string;
  category?: string;
  page?: number;
  limit?: number;
}

interface CreateQuestionInput {
  question: string;
  clientName?: string;
  isAnonymous: boolean;
  category: string;
  tags?: string;
  clientId: string;
}

class QuestionService {
  async createQuestion(data: CreateQuestionInput) {
    try {
      // Process tags if they exist as a comma-separated string
      let tags: string[] = [];
      console.log(data,"datadatadatadatadatadatadata");
    

      // Create new question
      const newQuestion = await Question.create({
        question: data.question,
        clientName: data.isAnonymous ? undefined : data.clientName,
        isAnonymous: data.isAnonymous,
        category: data.category,
        tags: data.tags,
        clientId: new mongoose.Types.ObjectId(data.clientId),
        status: "pending",
        // answer field is null by default as defined in the schema
      });

      return newQuestion;
    } catch (error) {
      console.error("QuestionService createQuestion error:", error);
      throw error;
    }
  }

  async getQuestions({ 
    status, 
    category, 
    page = 1, 
    limit = 10 
  }: GetQuestionsParams) {
    try {
      const filter: Record<string, any> = {};

      // Apply filters
      if (status) {
        filter.status = status;
      }
      if (category) {
        filter.category = category;
      }

      // Calculate pagination
      const skip = (page - 1) * limit;

      // Get questions with populated client data
      const questions = await Question.find(filter)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type')
        .sort({ createdAt: -1 }) // newest first
        .skip(skip)
        .limit(limit);

      // Get total count for pagination
      const total = await Question.countDocuments(filter);

      return {
        questions,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error("QuestionService getQuestions error:", error);
      throw error;
    }
  }

  async getQuestionById(questionId: string) {
    try {
      // Find question by ID and populate user details
      const question = await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
      
      return question;
    } catch (error) {
      console.error("QuestionService getQuestionById error:", error);
      throw error;
    }
  }

  async submitAnswer(questionId: string, answer: string, lawyerId: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);
      
      if (!question) {
        return null;
      }
      
      // Update question with answer details
      question.answer = answer;
      question.status = "answered";
      question.answeredBy = new mongoose.Types.ObjectId(lawyerId);
      question.answeredAt = new Date();
      
      // Save the updated question
      await question.save();
      
      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService submitAnswer error:", error);
      throw error;
    }
  }

  async editAnswer(questionId: string, answer: string, lawyerId: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);
      
      if (!question) {
        return null;
      }
      
      // Check if the lawyer is the one who answered this question originally
      if (question.answeredBy && question.answeredBy.toString() !== lawyerId) {
        return null; // Only the original answerer can edit
      }
      
      // Update question with new answer details
      question.answer = answer;
      question.updatedAt = new Date(); // This will happen automatically if timestamps are enabled in schema
      
      // Save the updated question
      await question.save();
      
      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService editAnswer error:", error);
      throw error;
    }
  }

  async deleteQuestion(questionId: string, userId: string, role: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);
      
      if (!question) {
        return { success: false, message: "Question not found" };
      }
      
      // Check permissions - only the original client or the lawyer who answered can delete
      const isClient = question.clientId && question.clientId.toString() === userId;
      const isAnsweringLawyer = question.answeredBy && question.answeredBy.toString() === userId && role === "lawyer";
      
      if (!isClient && !isAnsweringLawyer) {
        return { success: false, message: "You don't have permission to delete this question" };
      }
      
      // Delete the question
      await Question.findByIdAndDelete(questionId);
      
      return { success: true, message: "Question deleted successfully" };
    } catch (error) {
      console.error("QuestionService deleteQuestion error:", error);
      throw error;
    }
  }
}

export default new QuestionService();
