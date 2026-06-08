const LegalDocument = require('../../models/admin/LegalDocument');
const UserConsent = require('../../models/admin/UserConsent');
const { AppError } = require('../../middleware/common/errorHandler');
const Helpers = require('../../utils/helpers');
const logger = require('../../utils/logger');

// @desc    Get all legal documents
// @route   GET /admin/api/legal
// @access  Private (Admin)
const getDocuments = async (req, res, next) => {
  try {
    const documents = await LegalDocument.find().sort({ type: 1, version: -1 });

    res.status(200).json({ success: true, documents });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single legal document
// @route   GET /admin/api/legal/:id
// @access  Private (Admin)
const getDocumentById = async (req, res, next) => {
  try {
    const document = await LegalDocument.findById(req.params.id);

    if (!document) {
      return next(new AppError('Document not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({ success: true, document });
  } catch (error) {
    next(error);
  }
};

// @desc    Create legal document
// @route   POST /admin/api/legal
// @access  Private (Admin)
const createDocument = async (req, res, next) => {
  try {
    const { type, title, content, effectiveDate, requiresAcceptance } = req.body;

    const document = await LegalDocument.create({
      type,
      title,
      content,
      effectiveDate: effectiveDate || new Date(),
      requiresAcceptance: requiresAcceptance !== undefined ? requiresAcceptance : true,
      createdBy: req.admin._id,
    });

    logger.info(`Admin created legal document: ${document.title} v${document.version}`);

    res.status(201).json({ success: true, document });
  } catch (error) {
    next(error);
  }
};

// @desc    Update legal document (creates new version)
// @route   PUT /admin/api/legal/:id
// @access  Private (Admin)
const updateDocument = async (req, res, next) => {
  try {
    const current = await LegalDocument.findById(req.params.id);

    if (!current) {
      return next(new AppError('Document not found', 404, 'NOT_FOUND'));
    }

    // Create new version
    const document = await LegalDocument.create({
      type: current.type,
      title: req.body.title || current.title,
      content: req.body.content || current.content,
      version: current.version + 1,
      effectiveDate: req.body.effectiveDate || new Date(),
      requiresAcceptance: req.body.requiresAcceptance !== undefined ? req.body.requiresAcceptance : current.requiresAcceptance,
      forceReAcceptance: req.body.forceReAcceptance || false,
      createdBy: req.admin._id,
      changeLog: req.body.changeLog || 'Updated',
    });

    // Unpublish old version
    current.isPublished = false;
    await current.save();

    logger.info(`Admin updated legal document: ${document.title} v${document.version}`);

    res.status(200).json({ success: true, document });
  } catch (error) {
    next(error);
  }
};

// @desc    Publish legal document
// @route   PUT /admin/api/legal/:id/publish
// @access  Private (Admin)
const publishDocument = async (req, res, next) => {
  try {
    const document = await LegalDocument.findByIdAndUpdate(
      req.params.id,
      { isPublished: true, publishedAt: new Date() },
      { new: true }
    );

    if (!document) {
      return next(new AppError('Document not found', 404, 'NOT_FOUND'));
    }

    logger.info(`Admin published legal document: ${document.title} v${document.version}`);

    res.status(200).json({ success: true, document });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user consents
// @route   GET /admin/api/legal/consents
// @access  Private (Admin)
const getUserConsents = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, documentId } = req.query;
    const filter = {};
    if (documentId) filter.documentId = documentId;

    const { skip, limit: pageLimit } = Helpers.paginate(page, limit);

    const [consents, total] = await Promise.all([
      UserConsent.find(filter)
        .populate('userId', 'firstName lastName email')
        .populate('documentId', 'title version type')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageLimit),
      UserConsent.countDocuments(filter),
    ]);

    res.status(200).json(Helpers.buildPaginationResponse(consents, total, page, pageLimit));
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  createDocument,
  updateDocument,
  publishDocument,
  getUserConsents,
};