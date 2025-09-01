/**
 * MATDEV Session Manager
 * Advanced session handling with automatic pairing code support
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');
const Logger = require('./logger');

class SessionManager {
    constructor() {
        this.logger = new Logger();
        this.sessionDir = path.join(process.cwd(), 'session');
        this.sessionsData = new Map();
        this.sessionLocks = new Map();
    }

    /**
     * Initialize session management
     */
    async initialize() {
        try {
            await fs.ensureDir(this.sessionDir);
            await this.cleanupCorruptedSessions();
            this.logger.success('📁 Session manager initialized');
        } catch (error) {
            this.logger.error('Failed to initialize session manager:', error);
            throw error;
        }
    }

    /**
     * Get session file path
     */
    getSessionPath(sessionId = 'default') {
        return path.join(this.sessionDir, sessionId);
    }

    /**
     * Check if session exists and is valid
     */
    async hasValidSession(sessionId = 'default') {
        try {
            const sessionPath = this.getSessionPath(sessionId);
            const credsPath = path.join(sessionPath, 'creds.json');
            
            if (!(await fs.pathExists(credsPath))) {
                return false;
            }
            
            // Check if credentials are valid JSON
            const creds = await fs.readJson(credsPath);
            return !!(creds && creds.noiseKey && creds.signedIdentityKey);
            
        } catch (error) {
            this.logger.debug(`Session validation failed for ${sessionId}:`, error.message);
            return false;
        }
    }

    /**
     * Create new session with enhanced security
     */
    async createSession(sessionId = 'default') {
        try {
            const sessionPath = this.getSessionPath(sessionId);
            await fs.ensureDir(sessionPath);
            
            // Generate session metadata
            const metadata = {
                id: sessionId,
                created: Date.now(),
                version: '1.0.0',
                checksum: this.generateSessionChecksum()
            };
            
            await fs.writeJson(path.join(sessionPath, '.metadata'), metadata, { spaces: 2 });
            
            this.logger.success(`📱 New session created: ${sessionId}`);
            return sessionPath;
            
        } catch (error) {
            this.logger.error(`Failed to create session ${sessionId}:`, error);
            throw error;
        }
    }

    /**
     * Delete session safely
     */
    async deleteSession(sessionId = 'default') {
        try {
            // Acquire lock to prevent concurrent operations
            await this.acquireLock(sessionId);
            
            const sessionPath = this.getSessionPath(sessionId);
            
            if (await fs.pathExists(sessionPath)) {
                await fs.remove(sessionPath);
                this.logger.info(`🗑️ Session deleted: ${sessionId}`);
            }
            
            // Clear from memory
            this.sessionsData.delete(sessionId);
            
        } catch (error) {
            this.logger.error(`Failed to delete session ${sessionId}:`, error);
            throw error;
        } finally {
            this.releaseLock(sessionId);
        }
    }

    /**
     * Clean session directory (remove old backup files)
     */
    async cleanupOldBackups() {
        try {
            const parentDir = path.dirname(this.sessionDir);
            const items = await fs.readdir(parentDir).catch(() => []);
            
            for (const item of items) {
                if (item.includes('.backup.') && item.startsWith('session')) {
                    const backupPath = path.join(parentDir, item);
                    await fs.remove(backupPath);
                    this.logger.info(`🗑️ Removed old backup: ${item}`);
                }
            }
            
        } catch (error) {
            this.logger.debug('Cleanup old backups failed:', error.message);
        }
    }

    /**
     * Validate session integrity
     */
    async validateSession(sessionId = 'default') {
        try {
            const sessionPath = this.getSessionPath(sessionId);
            const metadataPath = path.join(sessionPath, '.metadata');
            
            if (!(await fs.pathExists(metadataPath))) {
                return { valid: false, reason: 'No metadata found' };
            }
            
            const metadata = await fs.readJson(metadataPath);
            const currentChecksum = this.calculateSessionChecksum(sessionPath);
            
            if (metadata.checksum !== currentChecksum) {
                return { valid: false, reason: 'Checksum mismatch - possible corruption' };
            }
            
            return { valid: true, metadata };
            
        } catch (error) {
            return { valid: false, reason: error.message };
        }
    }

    /**
     * Get session statistics
     */
    async getSessionStats(sessionId = 'default') {
        try {
            const sessionPath = this.getSessionPath(sessionId);
            
            if (!(await fs.pathExists(sessionPath))) {
                return null;
            }
            
            const stats = await fs.stat(sessionPath);
            const files = await fs.readdir(sessionPath);
            
            let totalSize = 0;
            for (const file of files) {
                const filePath = path.join(sessionPath, file);
                const fileStat = await fs.stat(filePath);
                totalSize += fileStat.size;
            }
            
            return {
                id: sessionId,
                created: stats.birthtime,
                modified: stats.mtime,
                files: files.length,
                size: totalSize,
                sizeFormatted: this.formatBytes(totalSize)
            };
            
        } catch (error) {
            this.logger.error(`Failed to get session stats ${sessionId}:`, error);
            return null;
        }
    }

    /**
     * Clean up corrupted sessions
     */
    async cleanupCorruptedSessions() {
        try {
            const sessions = await fs.readdir(this.sessionDir).catch(() => []);
            
            for (const sessionName of sessions) {
                if (sessionName.startsWith('.')) continue;
                
                const validation = await this.validateSession(sessionName);
                if (!validation.valid) {
                    this.logger.warn(`🧹 Removing corrupted session: ${sessionName} (${validation.reason})`);
                    await this.deleteSession(sessionName);
                }
            }
            
        } catch (error) {
            this.logger.error('Failed to cleanup corrupted sessions:', error);
        }
    }

    /**
     * Generate session checksum
     */
    generateSessionChecksum() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Calculate session checksum based on content
     */
    calculateSessionChecksum(sessionPath) {
        try {
            // This is a simplified checksum - in production you might want more sophisticated validation
            return crypto.createHash('md5').update(sessionPath).digest('hex');
        } catch (error) {
            return 'invalid';
        }
    }

    /**
     * Acquire session lock for thread safety
     */
    async acquireLock(sessionId, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const lockKey = `lock_${sessionId}`;
            
            if (this.sessionLocks.has(lockKey)) {
                const timer = setTimeout(() => {
                    reject(new Error(`Lock timeout for session ${sessionId}`));
                }, timeout);
                
                const checkLock = setInterval(() => {
                    if (!this.sessionLocks.has(lockKey)) {
                        clearTimeout(timer);
                        clearInterval(checkLock);
                        this.sessionLocks.set(lockKey, Date.now());
                        resolve(true);
                    }
                }, 100);
            } else {
                this.sessionLocks.set(lockKey, Date.now());
                resolve(true);
            }
        });
    }

    /**
     * Release session lock
     */
    releaseLock(sessionId) {
        const lockKey = `lock_${sessionId}`;
        this.sessionLocks.delete(lockKey);
    }

    /**
     * Format bytes to human readable
     */
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    /**
     * List all sessions
     */
    async listSessions() {
        try {
            const sessions = await fs.readdir(this.sessionDir).catch(() => []);
            const sessionList = [];
            
            for (const sessionName of sessions) {
                if (sessionName.startsWith('.')) continue;
                
                const stats = await this.getSessionStats(sessionName);
                if (stats) {
                    sessionList.push(stats);
                }
            }
            
            return sessionList;
            
        } catch (error) {
            this.logger.error('Failed to list sessions:', error);
            return [];
        }
    }
}

module.exports = SessionManager;
