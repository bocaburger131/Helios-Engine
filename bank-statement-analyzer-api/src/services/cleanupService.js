const fs = require('fs').promises;
const path = require('path');
const logger = require('../config/logger');

class CleanupService {
    constructor() {
        this.uploadsDir = path.join(__dirname, '../../uploads');
        this.maxAge = 24 * 60 * 60 * 1000; // 24 hours
    }

    async startCleanupJob() {
        setInterval(async () => {
            try {
                await this.cleanupOldFiles();
            } catch (error) {
                logger.error('Cleanup job failed:', error);
            }
        }, 60 * 60 * 1000); // Run every hour
    }

    async cleanupOldFiles() {
        const files = await fs.readdir(this.uploadsDir);
        const now = Date.now();

        for (const file of files) {
            const filePath = path.join(this.uploadsDir, file);
            const stats = await fs.stat(filePath);

            if (now - stats.mtimeMs > this.maxAge) {
                await fs.unlink(filePath);
                logger.info(`Cleaned up old file: ${file}`);
            }
        }
    }
}

export default new CleanupService();