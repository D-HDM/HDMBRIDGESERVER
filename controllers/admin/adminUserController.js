const mongoose = require('mongoose');
const User = require('../../models/client/User');
const Organization = require('../../models/client/Organization');
const { AppError } = require('../../middleware/common/errorHandler');
const logger = require('../../utils/logger');

const getUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { search, status, role, sort = '-createdAt' } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (status === 'active') filter.isActive = true;
    if (status === 'suspended') filter.isActive = false;
    if (role) filter.role = role;
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      User.find(filter).populate('organizationId', 'name email').sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.status(200).json({ success: true, data: users, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
  } catch (error) { next(error); }
};

const getUserById = async (req, res, next) => {
  try { const user = await User.findById(req.params.id).populate('organizationId'); if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND')); res.status(200).json({ success: true, user }); } catch (error) { next(error); }
};

const updateUser = async (req, res, next) => {
  try { const { firstName, lastName, phone, role, isActive } = req.body; const user = await User.findByIdAndUpdate(req.params.id, { firstName, lastName, phone, role, isActive }, { new: true, runValidators: true }); if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND')); logger.info('Admin updated user: ' + user.email); res.status(200).json({ success: true, user }); } catch (error) { next(error); }
};

const suspendUser = async (req, res, next) => {
  try { const user = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true }); if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND')); logger.info('Admin suspended user: ' + user.email); res.status(200).json({ success: true, message: 'User suspended', user: { id: user._id, email: user.email, isActive: user.isActive } }); } catch (error) { next(error); }
};

const activateUser = async (req, res, next) => {
  try { const user = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true }); if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND')); logger.info('Admin activated user: ' + user.email); res.status(200).json({ success: true, message: 'User activated', user: { id: user._id, email: user.email, isActive: user.isActive } }); } catch (error) { next(error); }
};

const deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found', 404, 'NOT_FOUND'));
    if (user.role === 'owner') {
      const orgUserCount = await User.countDocuments({ organizationId: user.organizationId });
      if (orgUserCount <= 1) return next(new AppError('Cannot delete the only owner. Delete the organization instead.', 400, 'VALIDATION_001'));
    }
    await User.findByIdAndDelete(req.params.id);
    logger.info('Admin deleted user: ' + user.email);
    res.status(200).json({ success: true, message: 'User deleted' });
  } catch (error) { next(error); }
};

const getOrganizations = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { search } = req.query;
    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    const skip = (page - 1) * limit;
    const [organizations, total] = await Promise.all([
      Organization.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Organization.countDocuments(filter),
    ]);
    const orgsWithCounts = await Promise.all(organizations.map(async (org) => {
      const userCount = await User.countDocuments({ organizationId: org._id });
      return { ...org, userCount };
    }));
    res.status(200).json({ success: true, data: orgsWithCounts, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, hasPrev: page > 1 } });
  } catch (error) { next(error); }
};

const getOrganizationById = async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.params.id).lean();
    if (!organization) return next(new AppError('Organization not found', 404, 'NOT_FOUND'));
    const userCount = await User.countDocuments({ organizationId: organization._id });
    const users = await User.find({ organizationId: organization._id }).select('firstName lastName email role isActive').lean();
    res.status(200).json({ success: true, organization: { ...organization, userCount, users } });
  } catch (error) { next(error); }
};

const deleteOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const org = await Organization.findById(orgId);
    if (!org) return next(new AppError('Organization not found', 404, 'NOT_FOUND'));

    console.log('🗑️ Deleting organization: ' + org.name + ' (' + orgId + ')');
    const db = mongoose.connection.db;
    const ObjectId = mongoose.Types.ObjectId;

    const collections = [
      { name: 'users', label: 'Users' },
      { name: 'subscriptions', label: 'Subscriptions' },
      { name: 'transactions', label: 'Transactions' },
      { name: 'apikeys', label: 'API Keys' },
      { name: 'emaillogs', label: 'Email Logs' },
      { name: 'templates', label: 'Templates' },
      { name: 'domains', label: 'Domains' },
      { name: 'senders', label: 'Senders' },
      { name: 'aichatsessions', label: 'Chat Sessions' },
      { name: 'aichatmessages', label: 'Chat Messages' },
      { name: 'userconsents', label: 'User Consents' },
    ];

    let totalDeleted = 0;

    for (const col of collections) {
      try {
        const result = await db.collection(col.name).deleteMany({ organizationId: new ObjectId(orgId) });
        totalDeleted += result.deletedCount || 0;
        console.log('  ' + col.label + ': ' + (result.deletedCount || 0));
      } catch (e) {
        console.log('  ' + col.label + ': skipped (collection may not exist)');
      }
    }

    await Organization.findByIdAndDelete(orgId);
    console.log('  Organization: deleted');
    console.log('✅ Total records removed: ' + totalDeleted);

    logger.info('Admin deleted organization: ' + org.name + ' (' + totalDeleted + ' records)');
    res.status(200).json({ success: true, message: 'Organization and all associated data deleted', deletedRecords: totalDeleted });
  } catch (error) { next(error); }
};

module.exports = { getUsers, getUserById, updateUser, suspendUser, activateUser, deleteUser, getOrganizations, getOrganizationById, deleteOrganization };