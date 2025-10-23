import Question from "../models/question";
import mongoose from "mongoose";
import { User } from "../models/user";

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

      // Send notification for new Q&A question
      try {
        const { NotificationService } = await import('../services/notificationService');
        await NotificationService.notifyQAQuestionPosted(newQuestion, data.clientId);
      } catch (notificationError) {
        console.error('Failed to send Q&A question notification:', notificationError);
      }

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
      const question = await Question.findById(questionId)
        .populate('answeredBy', 'first_name last_name');
      
      if (!question) {
        return null;
      }
      
      // Get lawyer details to include lawyer name
      const lawyer = await User.findById(lawyerId);
      
      if (!lawyer) {
        throw new Error("Lawyer not found");
      }
      
      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;
      
      // Always add new answer to the array (allow multiple answers from same lawyer)
      if (!question.answer) {
        question.answer = [];
      }
      
      question.answer.push({
        lawyer_name: lawyerName,
        answer: answer
      });
      
      question.status = "answered";
      question.answeredBy = new mongoose.Types.ObjectId(lawyerId);
      question.answeredAt = new Date();
      
      // Save the updated question
      await question.save();
      
      // Send notification for new Q&A answer
      try {
        const { NotificationService } = await import('../services/notificationService');
        const populatedQuestion = await Question.findById(questionId)
          .populate('clientId', 'first_name last_name email account_type')
          .populate('answeredBy', 'first_name last_name email account_type');
        
        if (populatedQuestion) {
          await NotificationService.notifyQAAnswerPosted(
            { lawyer_name: lawyerName, answer }, 
            populatedQuestion, 
            lawyerId
          );
        }
      } catch (notificationError) {
        console.error('Failed to send Q&A answer notification:', notificationError);
      }
      
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
      
      // Get lawyer details to find their existing answer
      const lawyer = await User.findById(lawyerId);
      
      if (!lawyer) {
        throw new Error("Lawyer not found");
      }
      
      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;
      
      // Find the lawyer's most recent answer in the array (last occurrence)
      let existingAnswerIndex = -1;
      if (question.answer && question.answer.length > 0) {
        for (let i = question.answer.length - 1; i >= 0; i--) {
          if (question.answer[i].lawyer_name === lawyerName) {
            existingAnswerIndex = i;
            break;
          }
        }
      }
      
      if (existingAnswerIndex < 0) {
        return null; // Lawyer hasn't answered this question yet
      }
      
      // Update the lawyer's most recent answer
      question.answer![existingAnswerIndex].answer = answer;
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

  async editAnswerById(questionId: string, answerId: string, newAnswer: string, lawyerId: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);
      
      if (!question) {
        return null;
      }
      
      // Get lawyer details to verify ownership
      const lawyer = await User.findById(lawyerId);
      
      if (!lawyer) {
        throw new Error("Lawyer not found");
      }
      
      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;
      
      // Find the specific answer by ID and verify it belongs to this lawyer
      const answerIndex = question.answer?.findIndex(
        (ans) => ans._id?.toString() === answerId && ans.lawyer_name === lawyerName
      );
      
      if (answerIndex === undefined || answerIndex < 0) {
        return null; // Answer not found or doesn't belong to this lawyer
      }
      
      // Update the specific answer
      question.answer![answerIndex].answer = newAnswer;
      question.updatedAt = new Date();
      
      // Save the updated question
      await question.save();
      
      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService editAnswerById error:", error);
      throw error;
    }
  }

  async deleteAnswer(questionId: string, answerId: string, lawyerId: string) {
    try {
      // Find the question and ensure it exists
      const question = await Question.findById(questionId);
      
      if (!question) {
        return null;
      }
      
      // Get lawyer details to verify ownership
      const lawyer = await User.findById(lawyerId);
      
      if (!lawyer) {
        throw new Error("Lawyer not found");
      }
      
      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;
      
      // Find the specific answer by ID and verify it belongs to this lawyer
      const answerIndex = question.answer?.findIndex(
        (ans) => ans._id?.toString() === answerId && ans.lawyer_name === lawyerName
      );
      
      if (answerIndex === undefined || answerIndex < 0) {
        return null; // Answer not found or doesn't belong to this lawyer
      }
      
      // Remove the specific answer from the array
      question.answer!.splice(answerIndex, 1);
      
      // If no answers left, update status to pending
      if (question.answer!.length === 0) {
        question.status = "pending";
        question.answeredBy = undefined;
        question.answeredAt = undefined;
      }
      
      question.updatedAt = new Date();
      
      // Save the updated question
      await question.save();
      
      // Return the updated question with populated fields
      return await Question.findById(questionId)
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type');
    } catch (error) {
      console.error("QuestionService deleteAnswer error:", error);
      throw error;
    }
  }

  async getQuestionsByLawyer(lawyerId: string) {
    try {
      // Get lawyer details
      const lawyer = await User.findById(lawyerId);
      
      if (!lawyer) {
        throw new Error("Lawyer not found");
      }
      
      const lawyerName = `${lawyer.first_name} ${lawyer.last_name}`;
      
      // Find questions where this lawyer has provided an answer
      const questions = await Question.find({
        "answer.lawyer_name": lawyerName
      })
        .populate('clientId', 'first_name last_name email account_type')
        .populate('answeredBy', 'first_name last_name email account_type')
        .sort({ createdAt: -1 });
      
      return questions;
    } catch (error) {
      console.error("QuestionService getQuestionsByLawyer error:", error);
      throw error;
    }
  }
}

export default new QuestionService();
