const Backup = require('../../models/admin/Backup');
const backupService = require('../../services/backupService');
const { AppError } = require('../../middleware/common/errorHandler');
const Helpers = require('../../utils/helpers');
const logger = require('../../utils/logger');

// @desc    Get all backups
// @route   GET /admin/api/backup
// @access  Private (Admin)
const getBackups = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const result = await backupService.listBackups(page, limit);

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single backup
// @route   GET /admin/api/backup/:id
// @access  Private (Admin)
const getBackupById = async (req, res, next) => {
  try {
    const backup = await Backup.findById(req.params.id);

    if (!backup) {
      return next(new AppError('Backup not found', 404, 'NOT_FOUND'));
    }

    res.status(200).json({ success: true, backup });
  } catch (error) {
    next(error);
  }
};

// @desc    Create backup
// @route   POST /admin/api/backup
// @access  Private (Admin)
const createBackup = async (req, res, next) => {
  try {
    const { type = 'database', collections = [] } = req.body;

    logger.info(`Admin initiated ${type} backup`);

    // Start backup in background
    backupService.createBackup(type, collections).then(backup => {
      logger.info(`Backup completed: ${backup._id}`);
    }).catch(err => {
      logger.error(`Backup failed: ${err.message}`);
    });

    res.status(202).json({
      success: true,
      message: 'Backup initiated',
      type,
      status: 'in_progress',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore from backup
// @route   POST /admin/api/backup/:id/restore
// @access  Private (Admin)
const restoreBackup = async (req, res, next) => {
  try {
    const backup = await Backup.findById(req.params.id);

    if (!backup) {
      return next(new AppError('Backup not found', 404, 'NOT_FOUND'));
    }

    if (backup.status !== 'completed') {
      return next(new AppError('Backup is not ready for restore', 400, 'VALIDATION_001'));
    }

    logger.info(`Admin initiated restore from backup: ${backup._id}`);

    // Start restore in background
    backupService.restoreFromBackup(backup._id).then(() => {
      logger.info(`Restore completed from backup: ${backup._id}`);
    }).catch(err => {
      logger.error(`Restore failed: ${err.message}`);
    });

    res.status(202).json({
      success: true,
      message: 'Restore initiated',
      backupId: backup._id,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete backup
// @route   DELETE /admin/api/backup/:id
// @access  Private (Admin)
const deleteBackup = async (req, res, next) => {
  try {
    await backupService.deleteBackup(req.params.id);

    logger.info(`Admin deleted backup: ${req.params.id}`);

    res.status(200).json({ success: true, message: 'Backup deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Get backup schedules
// @route   GET /admin/api/backup/schedules
// @access  Private (Admin)
const getSchedules = async (req, res, next) => {
  try {
    const schedules = await Backup.find({ isScheduled: true, 'scheduleConfig.enabled': true });

    res.status(200).json({ success: true, schedules });
  } catch (error) {
    next(error);
  }
};

// @desc    Create backup schedule
// @route   POST /admin/api/backup/schedules
// @access  Private (Admin)
const createSchedule = async (req, res, next) => {
  try {
    const { name, type, cronExpression, frequency, time, day } = req.body;

    const schedule = await Backup.create({
      name,
      type: type || 'database',
      isScheduled: true,
      scheduleConfig: {
        cronExpression: cronExpression || '0 2 * * *',
        frequency: frequency || 'daily',
        time: time || '02:00',
        day: day || '*',
        enabled: true,
      },
      status: 'in_progress',
    });

    logger.info(`Admin created backup schedule: ${schedule.name}`);

    res.status(201).json({ success: true, schedule });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBackups,
  getBackupById,
  createBackup,
  restoreBackup,
  deleteBackup,
  getSchedules,
  createSchedule,
};