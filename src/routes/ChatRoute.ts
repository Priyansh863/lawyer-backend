import express from 'express';
import ChatController from '../controllers/ChatController';
import { authenticateToken } from '../middleware/auth';
import { body, param, query } from 'express-validator';

const router = express.Router();

// Create or get existing chat
router.post('/create', [
  authenticateToken,
  body('participantId')
    .notEmpty()
    .withMessage('Participant ID is required')
    .isMongoId()
    .withMessage('Invalid participant ID format')
], ChatController.createChat);

// Get all user's chats
router.get('/my-chats', [
  authenticateToken
], ChatController.getUserChats);

// Get messages for a specific chat with pagination
router.get('/:chatId/messages', [
  authenticateToken,
  param('chatId')
    .isMongoId()
    .withMessage('Invalid chat ID format'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
], ChatController.getChatMessages);

// Send a message to a chat
router.post('/:chatId/send', [
  authenticateToken,
  param('chatId')
    .isMongoId()
    .withMessage('Invalid chat ID format'),
  body('message')
    .notEmpty()
    .withMessage('Message content is required')
    .isLength({ max: 1000 })
    .withMessage('Message must be less than 1000 characters'),
  body('messageType')
    .optional()
    .isIn(['text', 'image', 'file'])
    .withMessage('Invalid message type')
], ChatController.sendMessage);

// Delete a chat
router.delete('/:chatId', [
  authenticateToken,
  param('chatId')
    .isMongoId()
    .withMessage('Invalid chat ID format')
], ChatController.deleteChat);

export default router;
