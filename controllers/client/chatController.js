const aiService = require('../../services/aiService');
const AIChatSession = require('../../models/client/AIChatSession');
const AIChatMessage = require('../../models/client/AIChatMessage');
const { AppError } = require('../../middleware/common/errorHandler');

// @desc    Send message to AI
// @route   POST /api/chat/send
// @access  Private
const sendMessage = async (req, res, next) => {
  try {
    const { message, sessionId } = req.body;

    if (!message) {
      return next(new AppError('Message is required', 400, 'VALIDATION_001'));
    }

    // Build context for AI
    const context = {
      plan: req.user?.plan || 'Free',
      usage: {},
      apiKeys: {},
      domains: {},
      subscription: {},
    };

    const response = await aiService.sendMessage(
      sessionId,
      req.user._id,
      req.organizationId,
      message,
      context
    );

    res.status(200).json({ success: true, ...response });
  } catch (error) {
    next(error);
  }
};

// @desc    Get chat sessions
// @route   GET /api/chat/sessions
// @access  Private
const getSessions = async (req, res, next) => {
  try {
    const sessions = await AIChatSession.find({
      organizationId: req.organizationId,
      userId: req.user._id,
    }).sort({ updatedAt: -1 }).limit(20);

    res.status(200).json({ success: true, sessions });
  } catch (error) {
    next(error);
  }
};

// @desc    Get chat messages
// @route   GET /api/chat/sessions/:sessionId/messages
// @access  Private
const getMessages = async (req, res, next) => {
  try {
    const messages = await AIChatMessage.find({
      sessionId: req.params.sessionId,
      organizationId: req.organizationId,
    }).sort({ createdAt: 1 });

    res.status(200).json({ success: true, messages });
  } catch (error) {
    next(error);
  }
};

// @desc    Close chat session
// @route   PUT /api/chat/sessions/:sessionId/close
// @access  Private
const closeSession = async (req, res, next) => {
  try {
    await AIChatSession.findOneAndUpdate(
      { sessionId: req.params.sessionId, organizationId: req.organizationId },
      { status: 'closed' }
    );

    res.status(200).json({ success: true, message: 'Session closed' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  sendMessage,
  getSessions,
  getMessages,
  closeSession,
};