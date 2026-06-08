const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const Backup = require('../models/admin/Backup');
const logger = require('../utils/logger');

class BackupService {
  async createBackup(type = 'database', collections = []) {
    const backup = await Backup.create({
      name: `backup_${Date.now()}`,
      type,
      status: 'in_progress',
      collections,
      storageType: process.env.BACKUP_STORAGE_TYPE || 'local',
      encrypted: true,
    });

    try {
      const backupDir = path.join(process.env.BACKUP_PATH || './backups', backup._id.toString());
      await fs.mkdir(backupDir, { recursive: true });

      let backupCollections = collections;
      if (type === 'full' || type === 'database' || collections.length === 0) {
        backupCollections = Object.keys(mongoose.connection.collections);
      }

      if (type === 'users') {
        backupCollections = backupCollections.filter(c => c.startsWith('client_'));
      }

      // Export using mongodump
      const uri = process.env.MONGODB_URI;
      const collectionsStr = backupCollections.join(' ');
      
      const cmd = `mongodump --uri="${uri}" --out="${backupDir}" --collection=${collectionsStr}`;
      
      await this.execCommand(cmd);

      // Compress
      const archivePath = `${backupDir}.tar.gz`;
      await this.execCommand(`tar -czf ${archivePath} -C ${backupDir} .`);

      // Clean up uncompressed
      await fs.rm(backupDir, { recursive: true });

      const stats = await fs.stat(archivePath);

      backup.status = 'completed';
      backup.size = stats.size;
      backup.filePath = archivePath;
      backup.duration = Date.now() - backup.createdAt.getTime();
      
      await backup.save();

      logger.info(`Backup completed: ${backup._id} - ${stats.size} bytes`);
      return backup;
      
    } catch (error) {
      backup.status = 'failed';
      backup.error = error.message;
      await backup.save();
      
      logger.error(`Backup failed: ${error.message}`);
      throw error;
    }
  }

  async restoreFromBackup(backupId) {
    const backup = await Backup.findById(backupId);
    if (!backup || backup.status !== 'completed') {
      throw new Error('Backup not found or not completed');
    }

    backup.status = 'restoring';
    await backup.save();

    try {
      const tempDir = path.join('/tmp', `restore_${backupId}`);
      await fs.mkdir(tempDir, { recursive: true });

      // Extract
      await this.execCommand(`tar -xzf ${backup.filePath} -C ${tempDir}`);

      // Restore using mongorestore
      const uri = process.env.MONGODB_URI;
      await this.execCommand(`mongorestore --uri="${uri}" --dir="${tempDir}" --drop`);

      // Clean up
      await fs.rm(tempDir, { recursive: true });

      backup.restoredAt = new Date();
      await backup.save();

      logger.info(`Backup restored: ${backupId}`);
      return { success: true };

    } catch (error) {
      backup.status = 'completed';
      backup.error = error.message;
      await backup.save();
      
      logger.error(`Restore failed: ${error.message}`);
      throw error;
    }
  }

  async listBackups(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [backups, total] = await Promise.all([
      Backup.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Backup.countDocuments(),
    ]);

    return {
      backups,
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  async deleteBackup(backupId) {
    const backup = await Backup.findById(backupId);
    if (!backup) throw new Error('Backup not found');

    if (backup.filePath) {
      try {
        await fs.unlink(backup.filePath);
      } catch (error) {
        logger.warn(`Failed to delete backup file: ${error.message}`);
      }
    }

    await Backup.findByIdAndDelete(backupId);
    return { success: true };
  }

  execCommand(cmd) {
    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  }
}

module.exports = new BackupService();