const Domain = require('../../models/client/Domain');
const DnsValidator = require('../../utils/dnsValidator');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getDomains = async (req, res, next) => {
  try {
    const domains = await Domain.find({ organizationId: req.organizationId });

    res.status(200).json({
      success: true,
      count: domains.length,
      domains,
    });
  } catch (error) {
    next(error);
  }
};

const addDomain = async (req, res, next) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return next(new AppError('Domain is required', 400, 'VALIDATION_001'));
    }

    const currentCount = await Domain.countDocuments({ organizationId: req.organizationId });
    if (req.planLimits && currentCount >= req.planLimits.domains) {
      return next(new AppError('Domain limit reached for your plan', 429, 'LIMIT_001'));
    }

    const existingDomain = await Domain.findOne({
      organizationId: req.organizationId,
      domain: domain.toLowerCase(),
    });
    if (existingDomain) {
      return next(new AppError('Domain already exists', 409, 'CONFLICT_001'));
    }

    const dkimKeys = DnsValidator.generateDKIMKeyPair();

    const newDomain = await Domain.create({
      organizationId: req.organizationId,
      userId: req.user._id,
      domain: domain.toLowerCase(),
      'dnsRecords.dkim.publicKey': dkimKeys.publicKey,
      'dnsRecords.dkim.privateKey': dkimKeys.privateKey,
    });

    const verification = await DnsValidator.verifyDomain(domain.toLowerCase());

    logger.info('Domain added: ' + domain + ' for org ' + req.organizationId);

    res.status(201).json({
      success: true,
      domain: newDomain,
      dnsRecommendations: verification.recommendations,
    });
  } catch (error) {
    next(error);
  }
};

const verifyDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findOne({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!domain) {
      return next(new AppError('Domain not found', 404, 'NOT_FOUND'));
    }

    const verification = await DnsValidator.verifyDomain(domain.domain);

    domain.dnsRecords.spf.exists = verification.records.spf.exists;
    domain.dnsRecords.spf.value = verification.records.spf.value;
    domain.dnsRecords.spf.verified = verification.records.spf.exists;
    domain.dnsRecords.dkim.verified = verification.records.dkim.exists;
    domain.dnsRecords.dmarc.exists = verification.records.dmarc.exists;
    domain.dnsRecords.dmarc.value = verification.records.dmarc.value;

    domain.isVerified = verification.verified;
    domain.verificationStatus = verification.verified ? 'verified' : 'pending';
    domain.lastVerifiedAt = new Date();

    if (verification.verified) {
      domain.dnsRecords.spf.verifiedAt = new Date();
      domain.dnsRecords.dkim.verifiedAt = new Date();
    }

    domain.verificationRetries += 1;
    await domain.save();

    logger.info('Domain verification: ' + domain.domain + ' - ' + (verification.verified ? 'Verified' : 'Failed'));

    res.status(200).json({
      success: true,
      verified: domain.isVerified,
      verification,
      domain,
    });
  } catch (error) {
    next(error);
  }
};

const deleteDomain = async (req, res, next) => {
  try {
    const domain = await Domain.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.organizationId,
    });

    if (!domain) {
      return next(new AppError('Domain not found', 404, 'NOT_FOUND'));
    }

    logger.info('Domain deleted: ' + domain.domain);

    res.status(200).json({
      success: true,
      message: 'Domain deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getDomains,
  addDomain,
  verifyDomain,
  deleteDomain,
};