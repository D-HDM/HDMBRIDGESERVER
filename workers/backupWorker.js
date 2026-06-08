require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const connectDB = require('../config/database');
const backupService = require('../services/backupService');
const logger = require('../utils/logger');
const cron = require('node-cron');

async function startWorker() {
  try {
    await connectDB();
    console.log('💾 Backup Worker Started');

    cron.schedule('0 2 * * *', async function() {
      console.log('Starting daily backup...');
      try {
        await backupService.createBackup('database');
        console.log('Daily backup completed');
      } catch (error) {
        console.error('Daily backup failed:', error.message);
      }
    });

    cron.schedule('0 3 * * 0', async function() {
      console.log('Starting weekly full backup...');
      try {
        await backupService.createBackup('full');
        console.log('Weekly backup completed');
      } catch (error) {
        console.error('Weekly backup failed:', error.message);
      }
    });

    console.log('Backup schedules: Daily 2AM | Weekly Sunday 3AM');

  } catch (error) {
    console.error('Backup worker failed:', error.message);
    process.exit(1);
  }
}

process.on('SIGTERM', function() { process.exit(0); });
process.on('SIGINT', function() { process.exit(0); });

startWorker();