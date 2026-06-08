const Template = require('../../models/client/Template');
const { AppError } = require('../../middleware/common/errorHandler');
const Helpers = require('../../utils/helpers');
const logger = require('../../utils/logger');

const getTemplates = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, category } = req.query;
    const filter = { organizationId: req.organizationId };
    if (category) filter.category = category;

    const pagination = Helpers.paginate(parseInt(page), parseInt(limit));
    const [templates, total] = await Promise.all([
      Template.find(filter).sort({ createdAt: -1 }).skip(pagination.skip).limit(pagination.limit),
      Template.countDocuments(filter),
    ]);

    res.status(200).json(Helpers.buildPaginationResponse(templates, total, parseInt(page), parseInt(limit)));
  } catch (error) {
    next(error);
  }
};

const getTemplate = async (req, res, next) => {
  try {
    const template = await Template.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!template) {
      return next(new AppError('Template not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({ success: true, template });
  } catch (error) {
    next(error);
  }
};

const createTemplate = async (req, res, next) => {
  try {
    const { name, subject, htmlContent, textContent, previewText, variables, category } = req.body;

    const currentCount = await Template.countDocuments({ organizationId: req.organizationId });
    if (req.planLimits && currentCount >= req.planLimits.templates) {
      return next(new AppError('Template limit reached for your plan', 429, 'LIMIT_001'));
    }

    const slug = Helpers.slugify(name + '-' + Date.now());

    const template = await Template.create({
      organizationId: req.organizationId,
      userId: req.user._id,
      name,
      slug,
      subject,
      htmlContent,
      textContent,
      previewText,
      variables,
      category,
    });

    logger.info('Template created: ' + template.name);

    res.status(201).json({ success: true, template });
  } catch (error) {
    next(error);
  }
};

const updateTemplate = async (req, res, next) => {
  try {
    const { name, subject, htmlContent, textContent, previewText, variables, category, isActive } = req.body;

    const template = await Template.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.organizationId },
      { name, subject, htmlContent, textContent, previewText, variables, category, isActive, $inc: { version: 1 } },
      { new: true, runValidators: true }
    );

    if (!template) {
      return next(new AppError('Template not found', 404, 'NOT_FOUND'));
    }

    logger.info('Template updated: ' + template.name);

    res.status(200).json({ success: true, template });
  } catch (error) {
    next(error);
  }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const template = await Template.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!template) {
      return next(new AppError('Template not found', 404, 'NOT_FOUND'));
    }

    logger.info('Template deleted: ' + template.name);

    res.status(200).json({ success: true, message: 'Template deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const duplicateTemplate = async (req, res, next) => {
  try {
    const original = await Template.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!original) {
      return next(new AppError('Template not found', 404, 'NOT_FOUND'));
    }

    const template = await Template.create({
      organizationId: req.organizationId,
      userId: req.user._id,
      name: original.name + ' (Copy)',
      slug: Helpers.slugify(original.name + '-copy-' + Date.now()),
      subject: original.subject,
      htmlContent: original.htmlContent,
      textContent: original.textContent,
      previewText: original.previewText,
      variables: original.variables,
      category: original.category,
    });

    res.status(201).json({ success: true, template });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  duplicateTemplate,
};