const Sender = require('../../models/client/Sender');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getSenders = async (req, res, next) => {
  try {
    const senders = await Sender.find({ organizationId: req.organizationId });
    res.status(200).json({ success: true, senders });
  } catch (error) { next(error); }
};

const addSender = async (req, res, next) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return next(new AppError('Name and email are required', 400, 'VALIDATION_001'));
    }

    const currentCount = await Sender.countDocuments({ organizationId: req.organizationId });
    if (req.planLimits && currentCount >= req.planLimits.senders) {
      return next(new AppError('Sender limit reached for your plan', 429, 'LIMIT_001'));
    }

    const existingSender = await Sender.findOne({
      organizationId: req.organizationId,
      email: email.toLowerCase(),
    });
    if (existingSender) {
      return next(new AppError('Sender email already exists', 409, 'CONFLICT_001'));
    }

    // Extract domain from email
    const domain = email.split('@')[1];

    const sender = await Sender.create({
      organizationId: req.organizationId,
      userId: req.user._id,
      name,
      email: email.toLowerCase(),
      domain,
      isVerified: false,
    });

    logger.info('Sender added: ' + sender.email);

    res.status(201).json({
      success: true,
      sender,
      message: 'Sender added. Verify this email in Brevo dashboard, then click "I\'ve Verified".',
      verificationSteps: [
        '1. Go to Brevo → Senders & IP → Senders',
        '2. Add ' + email + ' as a sender',
        '3. Check ' + email + ' for verification email from Brevo',
        '4. Click the verification link in the email',
        '5. Come back here and click "I\'ve Verified"',
      ],
    });
  } catch (error) { next(error); }
};

const markAsVerified = async (req, res, next) => {
  try {
    const sender = await Sender.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!sender) return next(new AppError('Sender not found', 404, 'NOT_FOUND'));

    sender.isVerified = true;
    sender.verifiedAt = new Date();
    await sender.save();

    logger.info('Sender marked as verified: ' + sender.email);

    res.status(200).json({ success: true, sender });
  } catch (error) { next(error); }
};

const setDefault = async (req, res, next) => {
  try {
    const sender = await Sender.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!sender) return next(new AppError('Sender not found', 404, 'NOT_FOUND'));
    if (!sender.isVerified) return next(new AppError('Sender must be verified first', 400, 'VALIDATION_001'));

    // Remove default from all other senders
    await Sender.updateMany(
      { organizationId: req.organizationId },
      { isDefault: false }
    );

    sender.isDefault = true;
    await sender.save();

    logger.info('Default sender set: ' + sender.email);

    res.status(200).json({ success: true, sender });
  } catch (error) { next(error); }
};

const deleteSender = async (req, res, next) => {
  try {
    const sender = await Sender.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!sender) return next(new AppError('Sender not found', 404, 'NOT_FOUND'));

    logger.info('Sender deleted: ' + sender.email);

    res.status(200).json({ success: true, message: 'Sender deleted' });
  } catch (error) { next(error); }
};

module.exports = { getSenders, addSender, markAsVerified, setDefault, deleteSender };