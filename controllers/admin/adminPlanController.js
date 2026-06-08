const Plan = require('../../models/client/Plan');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

// @desc    Get all plans
// @route   GET /admin/api/plans
// @access  Private (Admin)
const getPlans = async (req, res, next) => {
  try {
    const plans = await Plan.find().sort('metadata.sortOrder');

    res.status(200).json({ success: true, count: plans.length, plans });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single plan
// @route   GET /admin/api/plans/:id
// @access  Private (Admin)
const getPlanById = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({ success: true, plan });
  } catch (error) {
    next(error);
  }
};

// @desc    Create plan
// @route   POST /admin/api/plans
// @access  Private (Admin)
const createPlan = async (req, res, next) => {
  try {
    const { name, description, tier, price, limits, features, overageCharges, metadata, trialPeriod } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    const plan = await Plan.create({
      name,
      slug,
      description,
      tier,
      price,
      limits,
      features,
      overageCharges,
      metadata,
      trialPeriod,
    });

    logger.info(`Admin created plan: ${plan.name}`);

    res.status(201).json({ success: true, plan });
  } catch (error) {
    next(error);
  }
};

// @desc    Update plan
// @route   PUT /admin/api/plans/:id
// @access  Private (Admin)
const updatePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!plan) {
      return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    }

    logger.info(`Admin updated plan: ${plan.name}`);

    res.status(200).json({ success: true, plan });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete plan
// @route   DELETE /admin/api/plans/:id
// @access  Private (Admin)
const deletePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    }

    if (plan.tier === 'free') {
      return next(new AppError('Cannot delete the free plan', 400, 'VALIDATION_001'));
    }

    // Check if users are on this plan
    const Subscription = require('../../models/client/Subscription');
    const activeSubs = await Subscription.countDocuments({ planId: plan._id, status: 'active' });

    if (activeSubs > 0) {
      return next(new AppError(`Cannot delete plan with ${activeSubs} active subscribers`, 400, 'VALIDATION_001'));
    }

    await Plan.findByIdAndDelete(req.params.id);

    logger.info(`Admin deleted plan: ${plan.name}`);

    res.status(200).json({ success: true, message: 'Plan deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Toggle plan active status
// @route   PUT /admin/api/plans/:id/toggle
// @access  Private (Admin)
const togglePlan = async (req, res, next) => {
  try {
    const plan = await Plan.findById(req.params.id);

    if (!plan) {
      return next(new AppError('Plan not found', 404, 'NOT_FOUND'));
    }

    plan.isActive = !plan.isActive;
    await plan.save();

    logger.info(`Admin ${plan.isActive ? 'activated' : 'deactivated'} plan: ${plan.name}`);

    res.status(200).json({
      success: true,
      plan: { id: plan._id, name: plan.name, isActive: plan.isActive },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlans,
  getPlanById,
  createPlan,
  updatePlan,
  deletePlan,
  togglePlan,
};