const axios = require('axios');
const AIWidgetSetting = require('../models/admin/AIWidgetSetting');
const AIChatSession = require('../models/client/AIChatSession');
const AIChatMessage = require('../models/client/AIChatMessage');
const { AI_SYSTEM_PROMPT, buildContextPrompt } = require('../config/aiPrompt');
const logger = require('../utils/logger');

class AIService {
  async getWidgetConfig() {
    const config = await AIWidgetSetting.findOne({ isActive: true, isEnabled: true });
    return config;
  }

  async createSession(userId, organizationId, context = {}) {
    const config = await this.getWidgetConfig();
    if (!config) throw new Error('AI Widget is not enabled');

    const sessionId = 'chat_' + Date.now() + '_' + Math.random().toString(36).substring(7);

    const session = await AIChatSession.create({
      organizationId,
      userId,
      sessionId,
      provider: config.provider,
      model: config.model,
      context,
    });

    return session;
  }

  async sendMessage(sessionId, userId, organizationId, message, context) {
    const config = await this.getWidgetConfig();
    if (!config) throw new Error('AI Widget is not enabled');

    let session = await AIChatSession.findOne({ sessionId });
    if (!session) {
      session = await this.createSession(userId, organizationId, context);
    }

    await AIChatMessage.create({
      sessionId: session.sessionId,
      organizationId,
      userId,
      role: 'user',
      content: message,
      provider: config.provider,
      model: config.model,
    });

    const history = await AIChatMessage.find({
      sessionId: session.sessionId,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    const messages = [
      { role: 'system', content: AI_SYSTEM_PROMPT },
    ];

    if (config.contextInjection?.includeUserPlan) {
      const contextPrompt = buildContextPrompt(context);
      messages.push({ role: 'system', content: contextPrompt });
    }

    history.reverse().forEach(msg => {
      messages.push({ role: msg.role, content: msg.content });
    });

    let response;
    switch (config.provider) {
      case 'openai':
        response = await this.callOpenAI(messages, config);
        break;
      case 'groq':
        response = await this.callGroq(messages, config);
        break;
      case 'anthropic':
        response = await this.callAnthropic(messages, config);
        break;
      case 'hdm':
        response = await this.callHDM(messages, config);
        break;
      default:
        throw new Error('Unsupported AI provider: ' + config.provider);
    }

    await AIChatMessage.create({
      sessionId: session.sessionId,
      organizationId,
      userId,
      role: 'assistant',
      content: response.content,
      tokens: response.tokens,
      provider: config.provider,
      model: config.model,
    });

    session.messageCount += 2;
    session.title = session.messageCount <= 2 ? message.substring(0, 50) : session.title;
    await session.save();

    return {
      sessionId: session.sessionId,
      message: response.content,
      tokens: response.tokens,
    };
  }

  async callOpenAI(messages, config) {
    try {
      const response = await axios.post(
        (config.baseUrl || 'https://api.openai.com/v1') + '/chat/completions',
        {
          model: config.model || 'gpt-4o-mini',
          messages,
          temperature: config.temperature || 0.7,
          max_tokens: config.maxTokens || 1024,
        },
        {
          headers: {
            Authorization: 'Bearer ' + config.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        tokens: {
          prompt: response.data.usage.prompt_tokens,
          completion: response.data.usage.completion_tokens,
          total: response.data.usage.total_tokens,
        },
      };
    } catch (error) {
      logger.error('OpenAI API call failed: ' + (error.response?.data || error.message));
      throw error;
    }
  }

  async callGroq(messages, config) {
    try {
      const response = await axios.post(
        (config.baseUrl || 'https://api.groq.com/openai/v1') + '/chat/completions',
        {
          model: config.model || 'llama3-8b-8192',
          messages,
          temperature: config.temperature || 0.7,
          max_tokens: config.maxTokens || 1024,
        },
        {
          headers: {
            Authorization: 'Bearer ' + config.apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      const choice = response.data.choices[0];
      return {
        content: choice.message.content,
        tokens: {
          prompt: response.data.usage.prompt_tokens,
          completion: response.data.usage.completion_tokens,
          total: response.data.usage.total_tokens,
        },
      };
    } catch (error) {
      logger.error('Groq API call failed: ' + (error.response?.data || error.message));
      throw error;
    }
  }

  async callAnthropic(messages, config) {
    try {
      const systemMessages = messages.filter(m => m.role === 'system');
      const userMessages = messages.filter(m => m.role !== 'system');

      const response = await axios.post(
        (config.baseUrl || 'https://api.anthropic.com/v1') + '/messages',
        {
          model: config.model || 'claude-3-haiku-20240307',
          system: systemMessages.map(m => m.content).join('\n'),
          messages: userMessages,
          max_tokens: config.maxTokens || 1024,
          temperature: config.temperature || 0.7,
        },
        {
          headers: {
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        }
      );

      return {
        content: response.data.content[0].text,
        tokens: {
          prompt: response.data.usage.input_tokens,
          completion: response.data.usage.output_tokens,
          total: response.data.usage.input_tokens + response.data.usage.output_tokens,
        },
      };
    } catch (error) {
      logger.error('Anthropic API call failed: ' + (error.response?.data || error.message));
      throw error;
    }
  }

  async callHDM(messages, config) {
    try {
      const FormData = require('form-data');
      const formData = new FormData();

      const systemMessages = messages.filter(m => m.role === 'system');
      const userMessage = messages.filter(m => m.role === 'user').pop();

      const systemPrompt = systemMessages.map(m => m.content).join('\n');

      formData.append('message', userMessage?.content || 'Hello');
      formData.append('system_prompt', systemPrompt);
      formData.append('interface', config.interface || 'client');

      const response = await axios.post(
        config.baseUrl || 'https://hdmai-server.onrender.com/api/v1/general/chat/public',
        formData,
        {
          headers: {
            'x-api-key': config.apiKey,
            ...formData.getHeaders(),
          },
        }
      );

      return {
        content: response.data.data.reply,
        tokens: {
          prompt: response.data.data.tokens_used || 0,
          completion: 0,
          total: response.data.data.tokens_used || 0,
        },
      };
    } catch (error) {
      logger.error('HDM AI API call failed: ' + (error.response?.data || error.message));
      throw error;
    }
  }
}

module.exports = new AIService();