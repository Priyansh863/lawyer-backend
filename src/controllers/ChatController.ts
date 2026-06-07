import { Request, Response } from 'express';
import Chat from '../models/Chat';
import Message from '../models/Message';
import { User } from '../models/user';
import { UserTokenBalance, TokenTransaction, ETransactionType, ETransactionStatus } from '../models/token';
import mongoose from 'mongoose';
import { NotificationService } from '../services/notificationService';
import { socketService } from '../App';

interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class ChatController {
  private static readonly INACTIVITY_MS = 5 * 60 * 1000;
  private static readonly DEFAULT_CURRENCY = "USD";
  private static readonly DEFAULT_PAID_SESSION_SECONDS = 30 * 60; // 30 minutes

  private static isParticipant(chat: any, userId: string): boolean {
    return chat.lawyer_id.toString() === userId || chat.client_id.toString() === userId;
  }

  private static isLawyer(chat: any, userId: string): boolean {
    return chat?.lawyer_id?.toString?.() === userId;
  }

  private static isPaidChat(chat: any): boolean {
    // Fix 2: If billing_type is explicitly "free", treat as free regardless of chat_rate
    if (chat?.billing_type === "free") return false;
    const explicit = chat?.billing_type === "paid";
    const rate = Number(chat?.chat_rate || 0);
    return explicit || rate > 0;
  }

  private static getPaidSession(chat: any) {
    const ps = chat?.paid_session || {};
    const state = ps.state || "not_started";
    const rawL = ps.started_by_lawyer;
    const rawC = ps.started_by_client;
    let started_by_lawyer = rawL === true;
    let started_by_client = rawC === true;
    const hasExplicitPair =
      (rawL === true || rawL === false) && (rawC === true || rawC === false);
    if (!hasExplicitPair && (state === "running" || state === "paused")) {
      started_by_lawyer = true;
      started_by_client = true;
    }
    if (!hasExplicitPair && (state === "ended" || state === "auto_ended") && ps.started_at) {
      started_by_lawyer = true;
      started_by_client = true;
    }
    return {
      state,
      started_by_lawyer,
      started_by_client,
      started_at: ps.started_at || null,
      ended_at: ps.ended_at || null,
      expires_at: ps.expires_at || null,
      session_duration_seconds: Number(ps.session_duration_seconds || 0),
      paused_by: {
        lawyer: Boolean(ps?.paused_by?.lawyer),
        client: Boolean(ps?.paused_by?.client),
      },
      total_billed_seconds: Number(ps.total_billed_seconds || 0),
      total_amount: Number(ps.total_amount || 0),
      last_state_change_at: ps.last_state_change_at || null,
    };
  }

  /** Sets caller's paid start flag; transitions to running + billing only when both parties have started. */
  private static async applyParticipantPaidStart(
    chat: any,
    userId: string
  ): Promise<{ chat: any; didMutate: boolean }> {
    if (!chat?._id || !ChatController.isPaidChat(chat)) {
      return { chat, didMutate: false };
    }
    const raw = chat.paid_session || {};
    const ps = ChatController.getPaidSession(chat);
    if (ps.state === "ended" || ps.state === "auto_ended") {
      return { chat, didMutate: false };
    }

    const isLawyer = ChatController.isLawyer(chat, userId);
    const curL = raw.started_by_lawyer === true;
    const curC = raw.started_by_client === true;
    const nextL = isLawyer ? true : curL;
    const nextC = !isLawyer ? true : curC;
    const nextBoth = nextL && nextC;

    const now = new Date();
    const duration = ps.session_duration_seconds || ChatController.DEFAULT_PAID_SESSION_SECONDS;

    const setDoc: Record<string, any> = {
      "paid_session.started_by_lawyer": nextL,
      "paid_session.started_by_client": nextC,
    };

    let willTransitionToRunning = false;
    if (nextBoth && ps.state === "not_started") {
      willTransitionToRunning = true;
      setDoc["paid_session.state"] = "running";
      setDoc["paid_session.started_at"] = ps.started_at || now;
      setDoc["paid_session.expires_at"] = ps.expires_at || new Date(now.getTime() + duration * 1000);
      setDoc["paid_session.session_duration_seconds"] = duration;
      setDoc["paid_session.paused_by"] = { lawyer: false, client: false };
      setDoc["paid_session.last_state_change_at"] = now;
    }

    const unchanged = curL === nextL && curC === nextC && !willTransitionToRunning;
    if (unchanged) {
      return { chat, didMutate: false };
    }

    await Chat.updateOne({ _id: chat._id }, { $set: setDoc });
    const updated = await Chat.findById(chat._id);
    return { chat: updated, didMutate: true };
  }

  private static computeTotalAmount(billedSeconds: number, chatRatePerMinute: number): number {
    if (!Number.isFinite(billedSeconds) || billedSeconds <= 0) return 0;
    if (!Number.isFinite(chatRatePerMinute) || chatRatePerMinute <= 0) return 0;
    return Number(((billedSeconds * (chatRatePerMinute / 60)) as number).toFixed(4));
  }

  private static async accruePaidBillableTime(chat: any, now: Date): Promise<any> {
    if (!chat) return chat;
    if (!ChatController.isPaidChat(chat)) return chat;

    const ps = ChatController.getPaidSession(chat);
    const rate = Number(chat?.chat_rate || 0);
    const expiresAt = ps.expires_at ? new Date(ps.expires_at) : null;
    const lastChange = ps.last_state_change_at ? new Date(ps.last_state_change_at) : null;

    const isBillable =
      ps.state === "running" &&
      !ps.paused_by.lawyer &&
      !ps.paused_by.client &&
      Boolean(expiresAt) &&
      Boolean(lastChange) &&
      now.getTime() > (lastChange as Date).getTime();

    if (!isBillable) {
      return chat;
    }

    const endAtMs = expiresAt ? Math.min(now.getTime(), expiresAt.getTime()) : now.getTime();
    const deltaSeconds = Math.max(0, Math.floor((endAtMs - (lastChange as Date).getTime()) / 1000));
    if (deltaSeconds <= 0) {
      return chat;
    }

    const newTotalBilled = ps.total_billed_seconds + deltaSeconds;
    const newTotalAmount = ChatController.computeTotalAmount(newTotalBilled, rate);

    await Chat.updateOne(
      { _id: chat._id },
      {
        $set: {
          "paid_session.total_billed_seconds": newTotalBilled,
          "paid_session.total_amount": newTotalAmount,
          "paid_session.last_state_change_at": now,
        },
      }
    );
    return await Chat.findById(chat._id);
  }

  private static async enforceAutoEndOnExpiry(chat: any, now: Date): Promise<any> {
    if (!chat) return chat;
    if (!ChatController.isPaidChat(chat)) return chat;
    const ps = ChatController.getPaidSession(chat);
    if (!ps.expires_at) return chat;
    const expiresAt = new Date(ps.expires_at);
    if (now.getTime() < expiresAt.getTime()) return chat;
    if (["ended", "auto_ended"].includes(ps.state)) return chat;
    if (ps.state === "not_started") return chat;

    // Accrue up to expiry and then auto-end.
    await ChatController.accruePaidBillableTime(chat, expiresAt);
    await Chat.updateOne(
      { _id: chat._id },
      {
        $set: {
          "paid_session.state": "auto_ended",
          "paid_session.ended_at": expiresAt,
          "paid_session.last_state_change_at": expiresAt,
        },
      }
    );
    const updated = await Chat.findById(chat._id);
    await ChatController.emitConsultationStatusToParticipants(updated);
    return updated;
  }

  private static async getChatForParticipant(chatId: string, userId: string) {
    const chat = await Chat.findById(chatId);
    if (!chat || !ChatController.isParticipant(chat, userId)) {
      return null;
    }
    return chat;
  }

  private static buildConsultationStatus(chat: any, userId: string) {
    const startedBy = (chat.consultation_started_by || []).map((id: any) => id.toString());
    const endedBy = (chat.consultation_ended_by || []).map((id: any) => id.toString());
    const lastActivityAt = chat.consultation_last_activity_at ? new Date(chat.consultation_last_activity_at) : null;
    const autoEndAt =
      chat.consultation_status === "active" && lastActivityAt
        ? new Date(lastActivityAt.getTime() + ChatController.INACTIVITY_MS)
        : null;

    const durationSeconds =
      chat.consultation_started_at && chat.consultation_ended_at
        ? Math.max(
            0,
            Math.floor(
              (new Date(chat.consultation_ended_at).getTime() - new Date(chat.consultation_started_at).getTime()) / 1000
            )
          )
        : 0;

    const isPaid = ChatController.isPaidChat(chat);
    const ps = ChatController.getPaidSession(chat);
    const billingType = isPaid ? "paid" : "free";
    const status = isPaid ? ps.state : (chat.consultation_status || "pending");
    const showPaymentWarning = isPaid && ps.state === "not_started";

    const paidStartedByMe = ChatController.isLawyer(chat, userId)
      ? ps.started_by_lawyer
      : ps.started_by_client;
    const paidStartedByOther = ChatController.isLawyer(chat, userId)
      ? ps.started_by_client
      : ps.started_by_lawyer;

    return {
      chat_id: chat._id,
      billing_type: billingType,
      chat_rate: Number(chat?.chat_rate || 0),
      currency: chat?.currency || ChatController.DEFAULT_CURRENCY,
      status,
      // Optional alias for older clients expecting "active"
      status_legacy: status === "running" ? "active" : status,
      started_by_me: isPaid ? paidStartedByMe : startedBy.includes(userId),
      started_by_other: isPaid ? paidStartedByOther : startedBy.some((id: string) => id !== userId),
      ended_by_me: endedBy.includes(userId),
      ended_by_other: endedBy.some((id: string) => id !== userId),
      started_at: (isPaid ? ps.started_at : chat.consultation_started_at) || null,
      ended_at: (isPaid ? ps.ended_at : chat.consultation_ended_at) || null,
      expires_at: isPaid ? ps.expires_at : null,
      auto_end_at: autoEndAt,
      duration_seconds: isPaid
        ? ps.total_billed_seconds
        : durationSeconds,
      total_billed_seconds: isPaid ? ps.total_billed_seconds : (chat.consultation_billable_seconds || 0),
      total_amount: isPaid ? ps.total_amount : 0,
      paused_by: isPaid ? ps.paused_by : { lawyer: false, client: false },
      show_payment_warning: showPaymentWarning,
      token_usage: chat.consultation_token_usage || 0,
    };
  }

  private static async computeTokenUsage(chat: any, billableSeconds: number): Promise<number> {
    try {
      const lawyer = await User.findById(chat.lawyer_id).select('charges chat_rate');
      const perMinuteTokens = Number((lawyer as any)?.chat_rate || lawyer?.charges || 0);
      if (perMinuteTokens <= 0 || billableSeconds <= 0) return 0;
      return Math.max(0, Math.round((billableSeconds / 60) * perMinuteTokens));
    } catch {
      return 0;
    }
  }

  private static async applyFinalTokenDeduction(chat: any, tokenUsage: number, billableSeconds: number) {
    if (!chat || tokenUsage <= 0 || chat.consultation_tokens_deducted) {
      return tokenUsage <= 0 ? 0 : tokenUsage;
    }
    try {
      const updatedBalance = await (UserTokenBalance as any).useTokens(chat.client_id.toString(), tokenUsage);
      await TokenTransaction.create({
        user_id: chat.client_id,
        type: ETransactionType.usage,
        amount: -tokenUsage,
        description: `Chat consultation finalized (${billableSeconds}s billable)`,
        category: 'Chat Consultation',
        status: ETransactionStatus.completed,
        reference_id: chat._id.toString(),
        metadata: {
          consultationType: 'chat',
          sessionId: chat._id.toString(),
          billableSeconds,
          tokenUsage,
          remainingBalance: updatedBalance.current_balance
        }
      });
      return tokenUsage;
    } catch (error) {
      console.error("Final token deduction failed:", error);
      return 0;
    }
  }

  private static async emitConsultationStatusToParticipants(chat: any) {
    if (!chat || !socketService) return;
    const participantIds = [chat.client_id?.toString(), chat.lawyer_id?.toString()].filter(Boolean) as string[];
    for (const participantId of participantIds) {
      socketService.emitToUser(
        participantId,
        'chat.consultation.status.updated',
        ChatController.buildConsultationStatus(chat, participantId)
      );
    }
  }

  private static async notifyConsultationEndedIfNeeded(chat: any, endedBy: string, endReason: 'manual' | 'inactivity') {
    if (!chat || !chat._id) return;
    if (chat.consultation_end_notified) return;
    if (!['ended', 'auto_ended'].includes(chat.consultation_status)) return;

    const updated = await Chat.findOneAndUpdate(
      { _id: chat._id, consultation_end_notified: false, consultation_status: { $in: ['ended', 'auto_ended'] } },
      { $set: { consultation_end_notified: true } },
      { new: true }
    );
    if (!updated) return;

    const durationSeconds = updated.consultation_started_at && updated.consultation_ended_at
      ? Math.max(0, Math.floor((new Date(updated.consultation_ended_at).getTime() - new Date(updated.consultation_started_at).getTime()) / 1000))
      : 0;
    const tokenUsage = updated.consultation_token_usage || 0;

    await NotificationService.notifyChatEnded(updated, endedBy, endReason, tokenUsage, durationSeconds);

    if (socketService) {
      const notificationPayload = {
        type: 'chat_ended',
        chat_id: updated._id,
        endReason,
        tokenUsage,
        durationSeconds,
      };
      socketService.sendNotificationToUser(updated.client_id.toString(), notificationPayload);
      socketService.sendNotificationToUser(updated.lawyer_id.toString(), notificationPayload);
    }
  }

  private static computeInactiveBillableSeconds(startedAt: Date, endedAt: Date): number {
    const durationSeconds = Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
    return Math.max(0, durationSeconds - 300);
  }

  private static async autoEndIfInactive(chat: any): Promise<any> {
    if (chat.consultation_status !== "active" || !chat.consultation_last_activity_at || !chat.consultation_started_at) {
      return chat;
    }

    const now = Date.now();
    const lastActivityMs = new Date(chat.consultation_last_activity_at).getTime();
    if (now < lastActivityMs + ChatController.INACTIVITY_MS) {
      return chat;
    }

    const endedAt = new Date(lastActivityMs + ChatController.INACTIVITY_MS);
    const billableSeconds = ChatController.computeInactiveBillableSeconds(
      new Date(chat.consultation_started_at),
      endedAt
    );

    const computedTokenUsage = await ChatController.computeTokenUsage(chat, billableSeconds);
    const finalTokenUsage = await ChatController.applyFinalTokenDeduction(chat, computedTokenUsage, billableSeconds);
    await Chat.findOneAndUpdate(
      { _id: chat._id, consultation_status: "active" },
      {
        $set: {
          consultation_status: "auto_ended",
          consultation_ended_at: endedAt,
          consultation_end_reason: "inactivity",
          consultation_billable_seconds: billableSeconds,
          consultation_token_usage: finalTokenUsage,
          consultation_tokens_deducted: finalTokenUsage > 0 ? true : chat.consultation_tokens_deducted,
        },
      },
      { new: true }
    );

    const updated = await Chat.findById(chat._id);
    await ChatController.emitConsultationStatusToParticipants(updated);
    await ChatController.notifyConsultationEndedIfNeeded(updated, chat.client_id.toString(), 'inactivity');
    return updated;
  }
  // Create or get existing chat
  static async createChat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      // Fix 1: Read billingType from req.body so frontend can specify free/paid
      const { participantId, billingType: requestedBillingType } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!participantId) {
        res.status(400).json({
          success: false,
          message: 'Participant ID is required'
        });
        return;
      }

      // Check if both users exist
      const [currentUser, participant] = await Promise.all([
        User.findById(userId),
        User.findById(participantId)
      ]);

      if (!currentUser || !participant) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        });
        return;
      }

      // Determine who is lawyer and who is client
      let lawyerId: string, clientId: string;
      if (currentUser.account_type === 'lawyer') {
        lawyerId = userId;
        clientId = participantId;
      } else {
        lawyerId = participantId;
        clientId = userId;
      }

      // Fix 4: Skip token balance check when billingType === 'free'
      if (currentUser.account_type === 'client' && requestedBillingType !== 'free') {
        const lawyer = await User.findById(lawyerId).select('charges first_name last_name');
        if (!lawyer) {
          res.status(404).json({
            success: false,
            message: 'Lawyer not found'
          });
          return;
        }

        const requiredTokens = lawyer.charges || 0;
        if (requiredTokens > 0) {
          // Check client's token balance
          const clientTokenBalance = await UserTokenBalance.findOne({ user_id: clientId });
          if (!clientTokenBalance || clientTokenBalance.current_balance < requiredTokens) {
            res.status(200).json({
              success: false,
              message: `Insufficient tokens. Required: ${requiredTokens}, Available: ${clientTokenBalance?.current_balance || 0}`,
              requiredTokens,
              currentBalance: clientTokenBalance?.current_balance || 0,
              lawyerCharges: lawyer.charges,
              lawyerName: `${lawyer.first_name} ${lawyer.last_name}`
            });
            return;
          }
        }
      }

      // Check if chat already exists between these users
      let existingChat = await Chat.findOne({
        $or: [
          { lawyer_id: lawyerId, client_id: clientId },
          { lawyer_id: clientId, client_id: lawyerId }
        ]
      }).populate('lawyer_id', 'first_name last_name email profile_image')
        .populate('client_id', 'first_name last_name email profile_image')
        .populate('lastMessage');

      if (existingChat) {
        // Fix 5: Update existing chat's billing_type when lawyer re-opens as free
        if (requestedBillingType && (existingChat as any).billing_type !== requestedBillingType) {
          await Chat.updateOne(
            { _id: existingChat._id },
            { $set: { billing_type: requestedBillingType } }
          );
          (existingChat as any).billing_type = requestedBillingType;
        }

        // Get unread count for this user
        const unreadCount = await Message.countDocuments({
          chatId: existingChat._id,
          senderId: { $ne: userId },
          readBy: { $ne: userId }
        });

        res.status(200).json({
          success: true,
          message: 'Chat retrieved successfully',
          data: {
            _id: existingChat._id,
            lawyer_id: existingChat.lawyer_id,
            client_id: existingChat.client_id,
            lastMessage: existingChat.lastMessage,
            unreadCount,
            billing_type: (existingChat as any).billing_type,
            chat_rate: Number((existingChat as any).chat_rate || 0),
            currency: (existingChat as any).currency || ChatController.DEFAULT_CURRENCY,
            createdAt: existingChat.createdAt,
            updatedAt: existingChat.updatedAt
          }
        });
        return;
      }

      // Create new chat
      // Fix 1: Use requestedBillingType from req.body if provided, else derive from lawyer rate
      const lawyerProfile = await User.findById(lawyerId).select("chat_rate charges");
      const perMinute = Number((lawyerProfile as any)?.chat_rate || (lawyerProfile as any)?.charges || 0);
      const billingType: "free" | "paid" = requestedBillingType === "free" ? "free" : (perMinute > 0 ? "paid" : "free");

      const newChat = new Chat({
        lawyer_id: lawyerId,
        client_id: clientId,
        billing_type: billingType,
        chat_rate: perMinute,
        currency: ChatController.DEFAULT_CURRENCY,
        paid_session: {
          state: "not_started",
          started_by_lawyer: false,
          started_by_client: false,
          session_duration_seconds: ChatController.DEFAULT_PAID_SESSION_SECONDS,
          paused_by: { lawyer: false, client: false },
          total_billed_seconds: 0,
          total_amount: 0,
          last_state_change_at: null,
          started_at: null,
          ended_at: null,
          expires_at: null,
        },
      });

      await newChat.save();
      await newChat.populate('lawyer_id', 'first_name last_name email profile_image charges');
      await newChat.populate('client_id', 'first_name last_name email profile_image');

      // Send notification for new chat (no tokens case)
      try {
        await NotificationService.notifyChatStarted(newChat, userId);
      } catch (notificationError) {
        console.error('Failed to send chat notification:', notificationError);
      }

      res.status(201).json({
        success: true,
        message: 'Chat created successfully',
        data: {
          _id: newChat._id,
          lawyer_id: newChat.lawyer_id,
          client_id: newChat.client_id,
          lastMessage: null,
          unreadCount: 0,
          billing_type: (newChat as any).billing_type,
          chat_rate: Number((newChat as any).chat_rate || 0),
          currency: (newChat as any).currency || ChatController.DEFAULT_CURRENCY,
          createdAt: newChat.createdAt,
          updatedAt: newChat.updatedAt
        }
      });

    } catch (error: any) {
      console.error('Error creating chat:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get chat messages with pagination
  static async getChatMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Verify user is participant in the chat
      let chat = await Chat.findById(chatId);
      if (!chat || (chat.lawyer_id.toString() !== userId && chat.client_id.toString() !== userId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
        });
        return;
      }

      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      if (ChatController.isPaidChat(chat)) {
        const ps = ChatController.getPaidSession(chat);
        const isLawyer = ChatController.isLawyer(chat, userId);
        const startedByMe = isLawyer ? ps.started_by_lawyer : ps.started_by_client;
        const startedByOther = isLawyer ? ps.started_by_client : ps.started_by_lawyer;
        const hideForReceiver =
          !startedByMe &&
          startedByOther &&
          ps.state !== "ended" &&
          ps.state !== "auto_ended";
        if (hideForReceiver) {
          res.status(200).json({
            success: true,
            data: {
              messages: [],
              messages_hidden_until_start: true,
            },
          });
          return;
        }
      }

      // Get messages with pagination (oldest first)
      const messages = await Message.find({ chatId })
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('senderId', 'first_name last_name email profile_image');

      // Mark messages as read by this user
      await Message.updateMany(
        {
          chatId,
          senderId: { $ne: userId },
          readBy: { $ne: userId }
        },
        {
          $addToSet: { readBy: userId },
          $set: { isRead: true }
        }
      );

      res.status(200).json({
        success: true,
        data: {
          messages: messages.map(msg => ({
            _id: msg._id,
            chatId: msg.chatId,
            senderId: msg.senderId,
            content: msg.content,
            messageType: msg.messageType,
            isRead: msg.isRead,
            createdAt: msg.createdAt,
            tokenCount: msg.tokenCount
          }))
        }
      });

    } catch (error: any) {
      console.error('Error getting chat messages:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Send message
  static async sendMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { message, messageType = 'text' } = req.body;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!message || !message.trim()) {
        res.status(400).json({
          success: false,
          message: 'Message content is required'
        });
        return;
      }

      // Verify user is participant in the chat
      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
        });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      // WhatsApp semantics: messages can always send; billing is controlled by paid session state.
      if (ChatController.isPaidChat(chat)) {
        const ps = ChatController.getPaidSession(chat);
        if (ps.state === "paused") {
          res.status(403).json({
            success: false,
            message: "Conversation paused",
            data: ChatController.buildConsultationStatus(chat, userId),
          });
          return;
        }
        if (ps.state === "ended" || ps.state === "auto_ended") {
          res.status(403).json({
            success: false,
            message: "Conversation ended",
            data: ChatController.buildConsultationStatus(chat, userId),
          });
          return;
        }
      }

      // Create new message
      const newMessage = new Message({
        chatId,
        senderId: userId,
        content: message.trim(),
        messageType,
        isRead: false,
        readBy: [userId], // Sender has read their own message
        tokenCount: 0 // Can be updated based on AI processing
      });

      await newMessage.save();
      await newMessage.populate('senderId', 'first_name last_name email profile_image');

      // Update chat's last message
      await Chat.findByIdAndUpdate(chatId, {
        lastMessage: newMessage._id,
        updatedAt: new Date(),
        consultation_last_activity_at: new Date(),
      });

      let chatForMeta = await Chat.findById(chatId);
      if (chatForMeta && ChatController.isPaidChat(chatForMeta)) {
        const { chat: afterStart, didMutate } = await ChatController.applyParticipantPaidStart(
          chatForMeta,
          userId
        );
        chatForMeta = afterStart;
        if (didMutate) {
          await ChatController.emitConsultationStatusToParticipants(afterStart);
        }
      }

      // Send notification to the other participant (not the sender)
      try {
        const otherParticipantId = chat.lawyer_id.toString() === userId ? chat.client_id.toString() : chat.lawyer_id.toString();
        await NotificationService.notifyNewMessage(newMessage, otherParticipantId, userId);
      } catch (notificationError) {
        console.error('Failed to send message notification:', notificationError);
        // Don't fail the message sending if notification fails
      }

      res.status(201).json({
        success: true,
        message: 'Message sent successfully',
        data: {
          _id: newMessage._id,
          chatId: newMessage.chatId,
          senderId: newMessage.senderId,
          content: newMessage.content,
          messageType: newMessage.messageType,
          isRead: newMessage.isRead,
          createdAt: newMessage.createdAt,
          tokenCount: newMessage.tokenCount,
          ...(chatForMeta && ChatController.isPaidChat(chatForMeta)
            ? {
                session_state: ChatController.getPaidSession(chatForMeta).state,
                show_payment_warning: ChatController.getPaidSession(chatForMeta).state === "not_started",
              }
            : {}),
        }
      });

    } catch (error: any) {
      console.error('Error sending message:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get all user's chats
  static async getUserChats(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Get all chats where user is either lawyer or client
      const chats = await Chat.find({
        $or: [
          { lawyer_id: userId },
          { client_id: userId }
        ]
      })
        .populate('lawyer_id', 'first_name last_name email profile_image')
        .populate('client_id', 'first_name last_name email profile_image')
        .populate('lastMessage')
        .sort({ updatedAt: -1 });

      // Get unread counts for each chat
      const chatsWithUnreadCounts = await Promise.all(
        chats.map(async (chat) => {
          const unreadCount = await Message.countDocuments({
            chatId: chat._id,
            senderId: { $ne: userId },
            readBy: { $ne: userId }
          });

          // Fix 3: Include billing_type and chat_rate in the response
          return {
            _id: chat._id,
            lawyer_id: chat.lawyer_id,
            client_id: chat.client_id,
            lastMessage: chat.lastMessage,
            unreadCount,
            billing_type: (chat as any).billing_type || 'free',
            chat_rate: Number((chat as any).chat_rate || 0),
            currency: (chat as any).currency || ChatController.DEFAULT_CURRENCY,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
          };
        })
      );

      res.status(200).json({
        success: true,
        data: {
          chats: chatsWithUnreadCounts
        }
      });

    } catch (error: any) {
      console.error('Error getting user chats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Delete chat
  static async deleteChat(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Verify user is participant in the chat
      const chat = await Chat.findById(chatId);
      if (!chat || (chat.lawyer_id.toString() !== userId && chat.client_id.toString() !== userId)) {
        res.status(403).json({
          success: false,
          message: 'Access denied to this chat'
        });
        return;
      }

      // Delete all messages in the chat
      await Message.deleteMany({ chatId });

      // Delete the chat
      await Chat.findByIdAndDelete(chatId);

      res.status(200).json({
        success: true,
        message: 'Chat deleted successfully'
      });

    } catch (error: any) {
      console.error('Error deleting chat:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  static async getConsultationStatus(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      res.status(200).json({
        success: true,
        data: ChatController.buildConsultationStatus(chat, userId),
      });
    } catch (error: any) {
      console.error("Error getting consultation status:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async startConsultation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }

      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      if (!ChatController.isPaidChat(chat)) {
        res.status(400).json({ success: false, message: "Not a paid chat" });
        return;
      }

      const ps = ChatController.getPaidSession(chat);
      if (ps.state === "ended" || ps.state === "auto_ended") {
        res.status(409).json({ success: false, message: "Session already ended", data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }
      if (ps.state === "running" || ps.state === "paused") {
        res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }

      const { chat: updated, didMutate } = await ChatController.applyParticipantPaidStart(chat, userId);
      if (didMutate) {
        await ChatController.emitConsultationStatusToParticipants(updated);
      }
      res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
    } catch (error: any) {
      console.error("Error starting consultation:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async endConsultation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const { confirm, reason = "manual" } = req.body || {};
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      if (confirm !== true) {
        res.status(400).json({ success: false, message: "confirm must be true" });
        return;
      }

      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }

      chat = await ChatController.autoEndIfInactive(chat);
      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found" });
        return;
      }

      // Paid session end semantics
      if (ChatController.isPaidChat(chat)) {
        const now = new Date();
        chat = await ChatController.accruePaidBillableTime(chat, now);
        const ps = ChatController.getPaidSession(chat);
        if (ps.state === "ended" || ps.state === "auto_ended") {
          res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(chat, userId) });
          return;
        }
        await Chat.updateOne(
          { _id: chat._id },
          {
            $set: {
              "paid_session.state": "ended",
              "paid_session.ended_at": now,
              "paid_session.last_state_change_at": now,
            },
          }
        );
        const updated = await Chat.findById(chat._id);
        await ChatController.emitConsultationStatusToParticipants(updated);
        res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
        return;
      }

      res.status(400).json({ success: false, message: "Not a paid chat" });
      return;
    } catch (error: any) {
      console.error("Error ending consultation:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async pauseConsultation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }
      if (!ChatController.isPaidChat(chat)) {
        res.status(400).json({ success: false, message: "Not a paid chat" });
        return;
      }

      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      const now = new Date();
      chat = await ChatController.accruePaidBillableTime(chat, now);
      const ps = ChatController.getPaidSession(chat);
      if (ps.state === "ended" || ps.state === "auto_ended") {
        res.status(400).json({ success: false, message: "Session already ended", data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }
      if (ps.state !== "running") {
        res.status(400).json({ success: false, message: "Invalid transition: can pause only from running", data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }

      const isLawyer = ChatController.isLawyer(chat, userId);
      const nextPaused = { ...ps.paused_by, lawyer: isLawyer ? true : ps.paused_by.lawyer, client: !isLawyer ? true : ps.paused_by.client };
      await Chat.updateOne(
        { _id: chat._id },
        {
          $set: {
            "paid_session.paused_by": nextPaused,
            "paid_session.state": "paused",
            "paid_session.last_state_change_at": now,
          },
        }
      );
      const updated = await Chat.findById(chat._id);
      await ChatController.emitConsultationStatusToParticipants(updated);
      res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
    } catch (error: any) {
      console.error("pauseConsultation:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  static async resumeConsultation(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { chatId } = req.params;
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
      }
      let chat = await ChatController.getChatForParticipant(chatId, userId);
      if (!chat) {
        res.status(404).json({ success: false, message: "Chat not found or access denied" });
        return;
      }
      if (!ChatController.isPaidChat(chat)) {
        res.status(400).json({ success: false, message: "Not a paid chat" });
        return;
      }

      chat = await ChatController.enforceAutoEndOnExpiry(chat, new Date());
      const now = new Date();
      const ps = ChatController.getPaidSession(chat);
      if (ps.state === "ended" || ps.state === "auto_ended") {
        res.status(400).json({ success: false, message: "Session already ended", data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }
      if (ps.state !== "paused") {
        res.status(400).json({ success: false, message: "Invalid transition: can resume only from paused", data: ChatController.buildConsultationStatus(chat, userId) });
        return;
      }

      const isLawyer = ChatController.isLawyer(chat, userId);
      const nextPaused = { ...ps.paused_by, lawyer: isLawyer ? false : ps.paused_by.lawyer, client: !isLawyer ? false : ps.paused_by.client };
      const anyPaused = nextPaused.lawyer || nextPaused.client;
      const nextState = anyPaused ? "paused" : "running";

      await Chat.updateOne(
        { _id: chat._id },
        {
          $set: {
            "paid_session.paused_by": nextPaused,
            "paid_session.state": nextState,
            "paid_session.last_state_change_at": now,
          },
        }
      );
      const updated = await Chat.findById(chat._id);
      await ChatController.emitConsultationStatusToParticipants(updated);
      res.status(200).json({ success: true, data: ChatController.buildConsultationStatus(updated, userId) });
    } catch (error: any) {
      console.error("resumeConsultation:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}

export default ChatController;
