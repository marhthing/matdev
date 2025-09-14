/**
 * MATDEV Centralized Cleanup Manager
 * Unified cleanup system for messages, media files, and storage
 */

const fs = require('fs-extra');
const path = require('path');
const Logger = require('./logger');

class CleanupManager {
    constructor(bot) {
        this.bot = bot;
        this.logger = new Logger();
        this.isRunning = false;
        this.cleanupInterval = null;
        this.mediaDir = path.join(__dirname, '../session/media');
        
        // Retention policies (in seconds)
        this.retentionPolicies = {
            status: 24 * 60 * 60,        // 24 hours for status messages
            channels: 24 * 60 * 60,      // 24 hours for channels/broadcasts  
            private: 3 * 24 * 60 * 60,   // 3 days for private chats
            groups: 3 * 24 * 60 * 60     // 3 days for group chats
        };
    }

    /**
     * Initialize cleanup manager and start scheduler
     */
    async initialize() {
        try {
            // Ensure media directory exists
            await fs.ensureDir(this.mediaDir);
            
            // Start cleanup scheduler (every 6 hours)
            this.startScheduler();
            
            this.logger.success('🧹 Centralized cleanup manager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize cleanup manager:', error);
            throw error;
        }
    }

    /**
     * Start automatic cleanup scheduler
     */
    startScheduler() {
        // Prevent multiple schedulers
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }

        // Run cleanup every 6 hours
        this.cleanupInterval = setInterval(async () => {
            if (!this.isRunning) {
                await this.runFullCleanup();
            }
        }, 6 * 60 * 60 * 1000); // 6 hours

        this.logger.info('🕐 Cleanup scheduler started (every 6 hours)');
    }

    /**
     * Stop cleanup scheduler
     */
    stopScheduler() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            this.logger.info('⏹️ Cleanup scheduler stopped');
        }
    }

    /**
     * Run complete cleanup process with mutex lock
     */
    async runFullCleanup() {
        if (this.isRunning) {
            this.logger.debug('Cleanup already running, skipping...');
            return;
        }

        this.isRunning = true;
        const startTime = Date.now();

        try {
            this.logger.info('🧹 Starting centralized cleanup process...');

            // Phase 1: Cleanup database messages and get media references
            const dbResults = await this.cleanupDatabaseMessages();
            
            // Phase 2: Cleanup JSON storage messages
            const jsonResults = await this.cleanupJSONMessages();
            
            // Phase 3: Cleanup orphaned media files
            const mediaResults = await this.cleanupOrphanedMedia();
            
            // Phase 4: Cleanup other storage files
            const otherResults = await this.cleanupOtherStorage();

            // Summary
            const totalMessages = dbResults.messages + jsonResults.messages;
            const totalMedia = dbResults.media + jsonResults.media + mediaResults.orphaned;
            const duration = Math.round((Date.now() - startTime) / 1000);

            this.logger.success(`✅ Cleanup completed in ${duration}s:`);
            this.logger.info(`   📄 Messages: ${totalMessages} cleaned`);
            this.logger.info(`   🎬 Media files: ${totalMedia} deleted`);
            this.logger.info(`   🗂️ Storage: ${otherResults.cleaned} items cleaned`);

        } catch (error) {
            this.logger.error('Cleanup process failed:', error);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Cleanup database messages and associated media
     */
    async cleanupDatabaseMessages() {
        const results = { messages: 0, media: 0 };

        try {
            if (!this.bot.database?.db) {
                this.logger.debug('Database not available, skipping database cleanup');
                return results;
            }

            const now = Math.floor(Date.now() / 1000);
            const threeDaysAgo = now - this.retentionPolicies.private;

            // Get media files to be deleted
            const getMediaSql = `
                SELECT media_url FROM messages 
                WHERE created_at < ? AND media_url IS NOT NULL
            `;

            return new Promise((resolve) => {
                this.bot.database.db.all(getMediaSql, [threeDaysAgo], async (error, rows) => {
                    if (error) {
                        this.logger.error('Database media query error:', error);
                        resolve(results);
                        return;
                    }

                    // Delete media files from disk
                    for (const row of rows) {
                        try {
                            const filePath = path.join(__dirname, '..', row.media_url);
                            if (await fs.pathExists(filePath)) {
                                await fs.remove(filePath);
                                results.media++;
                            }
                        } catch (fileError) {
                            this.logger.debug('Error deleting DB media file:', fileError.message);
                        }
                    }

                    // Delete database records
                    const deleteSql = `
                        DELETE FROM messages 
                        WHERE created_at < ? AND is_deleted = 0
                    `;

                    this.bot.database.db.run(deleteSql, [threeDaysAgo], function(dbError) {
                        if (!dbError) {
                            results.messages = this.changes;
                        }
                        resolve(results);
                    });
                });
            });

        } catch (error) {
            this.logger.error('Database cleanup error:', error);
            return results;
        }
    }

    /**
     * Cleanup JSON storage messages
     */
    async cleanupJSONMessages() {
        const results = { messages: 0, media: 0 };

        try {
            if (!this.bot.database?.messages) {
                this.logger.debug('JSON storage not available, skipping JSON cleanup');
                return results;
            }

            const now = Math.floor(Date.now() / 1000);
            const allMessages = Array.from(this.bot.database.messages.entries());

            for (const [id, msg] of allMessages) {
                let shouldDelete = false;
                let retentionPeriod;

                // Determine retention policy based on chat type
                if (msg.chat_jid === 'status@broadcast') {
                    retentionPeriod = this.retentionPolicies.status;
                } else if (msg.chat_jid.includes('@newsletter') || 
                          msg.chat_jid.includes('@broadcast') || 
                          msg.chat_jid.includes('channel')) {
                    retentionPeriod = this.retentionPolicies.channels;
                } else if (msg.chat_jid.endsWith('@g.us')) {
                    retentionPeriod = this.retentionPolicies.groups;
                } else if (msg.chat_jid.endsWith('@s.whatsapp.net')) {
                    retentionPeriod = this.retentionPolicies.private;
                }

                if (retentionPeriod) {
                    const cutoffTime = now - retentionPeriod;
                    shouldDelete = msg.created_at < cutoffTime;
                }

                if (shouldDelete && !msg.is_deleted) {
                    // Note: Media deletion is handled centrally in cleanupOrphanedMedia
                    // to avoid conflicts with database cleanup
                    
                    // Remove from memory
                    this.bot.database.messages.delete(id);
                    results.messages++;
                }
            }

            // Save updated messages if any were deleted
            if (results.messages > 0) {
                await this.bot.database.saveMessages();
            }

        } catch (error) {
            this.logger.error('JSON cleanup error:', error);
        }

        return results;
    }

    /**
     * Cleanup orphaned media files (files not referenced by any storage)
     */
    async cleanupOrphanedMedia() {
        const results = { orphaned: 0 };

        try {
            if (!(await fs.pathExists(this.mediaDir))) {
                return results;
            }

            // Get all media files
            const mediaFiles = await this.getAllMediaFiles(this.mediaDir);
            
            // Get all media references from both storages
            const referencedFiles = new Set();
            
            // References from database
            if (this.bot.database?.db) {
                const dbRefs = await this.getDatabaseMediaReferences();
                dbRefs.forEach(ref => referencedFiles.add(ref));
            }
            
            // References from JSON storage
            if (this.bot.database?.messages) {
                for (const msg of this.bot.database.messages.values()) {
                    if (msg.media_url) {
                        referencedFiles.add(msg.media_url);
                    }
                }
            }

            // Delete orphaned files
            for (const filePath of mediaFiles) {
                const relativePath = path.relative(path.join(__dirname, '..'), filePath);
                
                if (!referencedFiles.has(relativePath) && !referencedFiles.has(filePath)) {
                    try {
                        await fs.remove(filePath);
                        results.orphaned++;
                    } catch (error) {
                        this.logger.debug('Error deleting orphaned file:', error.message);
                    }
                }
            }

        } catch (error) {
            this.logger.error('Orphaned media cleanup error:', error);
        }

        return results;
    }

    /**
     * Get all media file paths recursively
     */
    async getAllMediaFiles(dir) {
        const files = [];
        
        try {
            const items = await fs.readdir(dir);
            
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = await fs.stat(fullPath);
                
                if (stat.isDirectory()) {
                    const subFiles = await this.getAllMediaFiles(fullPath);
                    files.push(...subFiles);
                } else {
                    files.push(fullPath);
                }
            }
        } catch (error) {
            this.logger.debug('Error reading media directory:', error.message);
        }
        
        return files;
    }

    /**
     * Get media references from database
     */
    async getDatabaseMediaReferences() {
        return new Promise((resolve) => {
            if (!this.bot.database?.db) {
                resolve([]);
                return;
            }

            const sql = 'SELECT DISTINCT media_url FROM messages WHERE media_url IS NOT NULL';
            
            this.bot.database.db.all(sql, [], (error, rows) => {
                if (error) {
                    this.logger.debug('Database media references query error:', error);
                    resolve([]);
                } else {
                    resolve(rows.map(row => row.media_url));
                }
            });
        });
    }

    /**
     * Cleanup other storage files (contextInfo, schedules, etc.)
     */
    async cleanupOtherStorage() {
        const results = { cleaned: 0 };

        try {
            // Cleanup old contextInfo backups (if JSON storage has this)
            if (this.bot.database?.cleanupOldContextInfo) {
                await this.bot.database.cleanupOldContextInfo();
                results.cleaned++;
            }

            // Add other storage cleanup tasks here as needed
            
        } catch (error) {
            this.logger.error('Other storage cleanup error:', error);
        }

        return results;
    }

    /**
     * Manual cleanup trigger
     */
    async runManualCleanup() {
        this.logger.info('🧹 Manual cleanup triggered');
        await this.runFullCleanup();
    }

    /**
     * Get cleanup statistics
     */
    getStats() {
        return {
            isRunning: this.isRunning,
            schedulerActive: !!this.cleanupInterval,
            retentionPolicies: this.retentionPolicies,
            mediaDirectory: this.mediaDir
        };
    }

    /**
     * Update retention policies
     */
    updateRetentionPolicies(policies) {
        this.retentionPolicies = { ...this.retentionPolicies, ...policies };
        this.logger.info('📝 Retention policies updated:', this.retentionPolicies);
    }

    /**
     * Cleanup on shutdown
     */
    async shutdown() {
        this.stopScheduler();
        
        // Wait for current cleanup to finish
        let attempts = 0;
        while (this.isRunning && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            attempts++;
        }
        
        this.logger.info('🛑 Cleanup manager shutdown');
    }
}

module.exports = CleanupManager;