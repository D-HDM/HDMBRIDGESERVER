const Plan = require('../../models/client/Plan');
const AIWidgetSetting = require('../../models/admin/AIWidgetSetting');
const aiService = require('../../services/aiService');
const SystemSetting = require('../../models/admin/SystemSetting');

const getSettings = async (req, res) => {
  try {
    const settings = await SystemSetting.find({ isPublic: true });
    const settingsObj = {};
    settings.forEach(s => { settingsObj[s.key] = s.value; });
    res.status(200).json({ success: true, settings: settingsObj });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getPlans = async (req, res) => {
  try {
    const plans = await Plan.find({ isActive: true, isPublic: true })
      .select('name slug description tier price limits features metadata');
    res.status(200).json({ success: true, plans });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

const getFeatures = async (req, res) => {
  const features = [
    { icon: '🔑', title: 'API Keys in Seconds', description: 'Create API keys instantly from your dashboard.' },
    { icon: '📊', title: 'Real-time Tracking', description: 'Monitor opens, clicks, bounces, and delivery status.' },
    { icon: '🌐', title: 'Domain Verification', description: 'Verify domains with SPF, DKIM, and DMARC.' },
    { icon: '📝', title: 'Email Templates', description: 'Create reusable HTML templates with variables.' },
    { icon: '🔄', title: 'Webhooks', description: 'Real-time notifications for email events.' },
    { icon: '🛡️', title: 'Spam Protection', description: 'Built-in rate limiting and compliance checks.' },
  ];
  res.status(200).json({ success: true, features });
};

const landingChat = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, error: 'Message required' });

    const config = await AIWidgetSetting.findOne({ isActive: true, isEnabled: true });
    if (!config) return res.status(503).json({ success: false, error: 'Chat unavailable' });

    const systemPrompt = 'You are HDM BRIDGE Assistant. Plans: Free (3K/mo), Pro (50K/mo, $19), Pro+ (500K/mo, $79). Features: API keys, domain verification, templates, tracking, webhooks. Contact: support@hdmbridge.com. Keep responses short and friendly.';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ];

    let response;
    if (config.provider === 'openai') {
      response = await aiService.callOpenAI(messages, config);
    } else if (config.provider === 'groq') {
      response = await aiService.callGroq(messages, config);
    } else {
      response = await aiService.callHDM(messages, config);
    }

    res.status(200).json({ success: true, reply: response.content });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getSettings, getPlans, getFeatures, landingChat };