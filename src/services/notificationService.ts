import Notification from '../models/Notification';
import mongoose from 'mongoose';

export interface CreateNotificationData {
  userId: mongoose.Types.ObjectId | string;
  title: string;
  titleKo?: string;
  message: string;
  messageKo?: string;
  type: 'case_created' | 'case_status_changed' | 'document_uploaded' | 'chat_started' | 'chat_message' | 'video_consultation_started' | 'qa_question_posted' | 'qa_answer_posted' | 'general';
  relatedId?: mongoose.Types.ObjectId | string;
  relatedType?: 'case' | 'document' | 'chat' | 'meeting' | 'qa_question' | 'qa_answer';
  redirectUrl?: string;
  priority?: 'low' | 'medium' | 'high';
  metadata?: any;
  createdBy?: mongoose.Types.ObjectId | string;
}

export class NotificationService {
  // Create a single notification
  static async createNotification(data: CreateNotificationData) {
    try {
      const notification = new Notification({
        userId: data.userId,
        title: data.title,
        titleKo: data.titleKo,
        message: data.message,
        messageKo: data.messageKo,
        type: data.type,
        relatedId: data.relatedId,
        relatedType: data.relatedType,
        redirectUrl: data.redirectUrl,
        priority: data.priority || 'medium',
        metadata: data.metadata || {},
        createdBy: data.createdBy
      });

      console.log('Notification created successfully:', notification);

      await notification.save();

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw error;
    }
  }

  // Create notifications for multiple users
  static async createBulkNotifications(userIds: (mongoose.Types.ObjectId | string)[], data: Omit<CreateNotificationData, 'userId'>) {
    try {
      console.log('Bulk notifications data:', data,userIds);
      const notifications = userIds.map(userId => ({
        userId,
        title: data.title,
        titleKo: data.titleKo,
        message: data.message,
        messageKo: data.messageKo,
        type: data.type,
        relatedId: data.relatedId,
        relatedType: data.relatedType,
        redirectUrl: data.redirectUrl,
        priority: data.priority || 'medium',
        metadata: data.metadata || {},
        createdBy: data.createdBy
      }));

      const result = await Notification.insertMany(notifications);
      console.log('Bulk notifications created successfully:', result);
      return result;
    } catch (error) {
      console.error('Error creating bulk notifications:', error);
      throw error;
    }
  }

  // Notification triggers for specific events
  static async notifyNewCaseCreated(caseData: any, createdBy: mongoose.Types.ObjectId | string) {
    try {
      // Get all lawyers to notify about new case
      const User = mongoose.model('User');
      const lawyers = await User.find({ account_type: 'lawyer' }).select('_id');
      const lawyerIds = lawyers.map(lawyer => lawyer._id);

      await this.createBulkNotifications(lawyerIds, {
        title: 'New Case Created',
        titleKo: '새 사건 생성됨',
        message: `A new case "${caseData.title}" has been created by a client.`,
        messageKo: `고객이 새 사건 "${caseData.title}"을(를) 생성했습니다.`,
        type: 'case_created',
        relatedId: caseData._id,
        relatedType: 'case',
        redirectUrl: `/cases/${caseData._id}`,
        priority: 'medium',
        metadata: { caseNumber: caseData.case_number },
        createdBy
      });
      console.log('New case created notification sent successfully');
    } catch (error) {
      console.error('Error notifying new case created:', error);
    }
  }

  static async notifyCaseStatusChanged(caseData: any, newStatus: string, updatedBy: mongoose.Types.ObjectId | string) {
    try {
      // Notify case owner and assigned lawyer
      const userIds = [caseData.client_id];
      if (caseData.assigned_lawyer && caseData.assigned_lawyer.toString() !== updatedBy.toString()) {
        userIds.push(caseData.assigned_lawyer);
      }

      await this.createBulkNotifications(userIds, {
        title: 'Case Status Updated',
        titleKo: '사건 상태 업데이트됨',
        message: `Case "${caseData.title}" status has been changed to "${newStatus}".`,
        messageKo: `사건 "${caseData.title}"의 상태가 "${newStatus}"(으)로 변경되었습니다.`,
        type: 'case_status_changed',
        relatedId: caseData._id,
        relatedType: 'case',
        redirectUrl: `/cases/${caseData._id}`,
        priority: 'high',
        metadata: { oldStatus: caseData.status, newStatus },
        createdBy: updatedBy
      });
    } catch (error) {
      console.error('Error notifying case status changed:', error);
    }
  }

  static async notifyDocumentUploaded(documentData: any, uploadedBy: mongoose.Types.ObjectId | string) {
    try {
      console.log('Notifying document uploaded...');
      if (documentData.privacy === 'public') {
        console.log('Privacy is public, notifying all users...');

        // Notify all users about public document
        const User = mongoose.model('User');
        const allUsers = await User.find({ _id: { $ne: uploadedBy } }).select('_id');
        const userIds = allUsers.map(user => user._id);

        await this.createBulkNotifications(userIds, {
          title: 'New Public Document',
          titleKo: '새 공개 문서',
          message: `A new public document has been uploaded.`,
          messageKo: `새 공개 문서가 업로드되었습니다.`,
          type: 'document_uploaded',
          relatedId: documentData._id,
          relatedType: 'document',
          redirectUrl: `/documents`,
          priority: 'low',
          metadata: { fileName: documentData.fileName, fileType: documentData.fileType },
          createdBy: uploadedBy
        });
      }
      console.log('Notification sent successfully');
    } catch (error) {
      console.error('Error notifying document uploaded:', error);
    }
  }

  static async notifyChatStarted(chatData: any, startedBy: mongoose.Types.ObjectId | string) {
    try {
      // Notify the other participant in the chat
      const otherUserId = chatData.client_id.toString() === startedBy.toString() 
        ? chatData.lawyer_id 
        : chatData.client_id;

      await this.createNotification({
        userId: otherUserId,
        title: 'New Chat Started',
        titleKo: '새 채팅 시작됨',
        message: `A new chat conversation has been started with you.`,
        messageKo: `새로운 채팅 대화가 시작되었습니다.`,
        type: 'chat_started',
        relatedId: chatData._id,
        relatedType: 'chat',
        redirectUrl: `/chats/${chatData._id}`,
        priority: 'high',
        createdBy: startedBy
      });
    } catch (error) {
      console.error('Error notifying chat started:', error);
    }
  }

  static async notifyVideoConsultationStarted(meetingData: any, startedBy: mongoose.Types.ObjectId | string) {
    try {
      // Notify the other participant
      const otherUserId = meetingData.client_id.toString() === startedBy.toString() 
        ? meetingData.lawyer_id 
        : meetingData.client_id;

      await this.createNotification({
        userId: otherUserId,
        title: 'Video Consultation Started',
        titleKo: '화상 상담 시작됨',
        message: `A video consultation has been started. Join now!`,
        messageKo: `화상 상담이 시작되었습니다. 지금 참여하세요!`,
        type: 'video_consultation_started',
        relatedId: meetingData._id,
        relatedType: 'meeting',
        redirectUrl: `/meetings/${meetingData._id}`,
        priority: 'high',
        metadata: { meetingTime: meetingData.scheduled_time },
        createdBy: startedBy
      });
    } catch (error) {
      console.error('Error notifying video consultation started:', error);
    }
  }

  static async notifyQAQuestionPosted(questionData: any, postedBy: mongoose.Types.ObjectId | string) {
    try {
      // Notify all lawyers about new Q&A question
      const User = mongoose.model('User');
      const lawyers = await User.find({ 
        account_type: 'lawyer',
        _id: { $ne: postedBy }
      }).select('_id');
      const lawyerIds = lawyers.map(lawyer => lawyer._id);

      await this.createBulkNotifications(lawyerIds, {
        title: 'New Q&A Question',
        titleKo: '새 질문답변 질문',
        message: `A new question has been posted:`,
        messageKo: `새 질문이 게시되었습니다:`,
        type: 'qa_question_posted',
        relatedId: questionData._id,
        relatedType: 'qa_question',
        redirectUrl: `/qa/${questionData._id}`,
        priority: 'medium',
        metadata: { category: questionData.category },
        createdBy: postedBy
      });
    } catch (error) {
      console.error('Error notifying Q&A question posted:', error);
    }
  }

  static async notifyQAAnswerPosted(answerData: any, questionData: any, answeredBy: mongoose.Types.ObjectId | string) {
    try {
      // Notify question author
      if (questionData.user_id.toString() !== answeredBy.toString()) {
        await this.createNotification({
          userId: questionData.user_id,
          title: 'Your Question Was Answered',
          titleKo: '질문에 답변이 달렸습니다',
          message: `Your question "${questionData.title}" has received a new answer.`,
          messageKo: `귀하의 질문 "${questionData.title}"에 새로운 답변이 달렸습니다.`,
          type: 'qa_answer_posted',
          relatedId: questionData._id,
          relatedType: 'qa_answer',
          redirectUrl: `/qa/${questionData._id}`,
          priority: 'high',
          metadata: { questionTitle: questionData.title },
          createdBy: answeredBy
        });
      }
    } catch (error) {
      console.error('Error notifying Q&A answer posted:', error);
    }
  }

  // Notify new message in chat
  static async notifyNewMessage(messageData: any, recipientId: mongoose.Types.ObjectId | string, senderId: mongoose.Types.ObjectId | string) {
    try {
      const senderName = messageData.senderId ? 
        `${messageData.senderId.first_name} ${messageData.senderId.last_name}` : 
        'Someone';
      
      // Create notification for the recipient
      await this.createNotification({
        userId: recipientId,
        title: 'New Message',
        titleKo: '새 메시지',
        message: `${senderName} sent you a message: "${messageData.content.substring(0, 50)}${messageData.content.length > 50 ? '...' : ''}"`,
        messageKo: `${senderName}님이 메시지를 보냈습니다: "${messageData.content.substring(0, 50)}${messageData.content.length > 50 ? '...' : ''}"`,
        type: 'chat_message',
        relatedId: messageData.chatId,
        relatedType: 'chat',
        redirectUrl: `/chat/${messageData.chatId}`,
        priority: 'medium',
        metadata: { 
          senderId: senderId,
          senderName: senderName,
          messageType: messageData.messageType,
          messageId: messageData._id
        },
        createdBy: senderId
      });
    } catch (error) {
      console.error('Error notifying new message:', error);
    }
  }
}
