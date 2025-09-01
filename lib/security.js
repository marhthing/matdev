/**
 * MATDEV Security Manager
 * Advanced security features including anti-ban protection and rate limiting
 */

const crypto = require('crypto');
const config = require('../config');
const Logger = require('./logger');

class SecurityManager {
    constructor(cache) {
        this.cache = cache;
        this.logger = new Logger();
        
        // Rate limiting storage
        this.rateLimits = new Map();
        this.commandLimits = new Map();
        this.autoResponseLimits = new Map();
        
        // Security tracking
        this.blockedUsers = new Set();
        this.suspiciousActivity = new Map();
        this.securityEvents = [];
        
        // Anti-ban settings
        this.messageDelayMin = 1000; // 1 second minimum delay
        this.messageDelayMax = 3000; // 3 seconds maximum delay
        this.burstLimit = 5; // Maximum messages in burst
        this.burstWindow = 30000; // 30 second window
        
        this.stats = {
            blocked: 0,
            rateLimited: 0,
            securityEvents: 0
        };
    }

    /**
     * Initialize security manager
     */
    async initialize(sock) {
        this.sock = sock;
        
        // Start periodic cleanup
        this.startCleanupTasks();
        
        this.logger.success('🛡️ Security manager initialized');
    }

    /**
     * Check if user is blocked
     */
    async isBlocked(jid) {
        const userId = this.extractUserId(jid);
        return this.blockedUsers.has(userId);
    }

    /**
     * Block user
     */
    async blockUser(jid, reason = 'Manual block') {
        const userId = this.extractUserId(jid);
        this.blockedUsers.add(userId);
        
        this.logSecurityEvent('user_blocked', {
            userId,
            reason,
            timestamp: Date.now()
        });
        
        this.stats.blocked++;
        this.logger.warn(`🚫 Blocked user: ${userId} (${reason})`);
    }

    /**
     * Unblock user
     */
    async unblockUser(jid) {
        const userId = this.extractUserId(jid);
        this.blockedUsers.delete(userId);
        
        this.logSecurityEvent('user_unblocked', {
            userId,
            timestamp: Date.now()
        });
        
        this.logger.info(`✅ Unblocked user: ${userId}`);
    }

    /**
     * Rate limiting check
     */
    async isRateLimited(jid) {
        if (!config.ANTI_BAN) return false;
        
        const userId = this.extractUserId(jid);
        const now = Date.now();
        const window = config.RATE_LIMIT_WINDOW;
        const maxRequests = config.RATE_LIMIT_MAX_REQUESTS;
        
        if (!this.rateLimits.has(userId)) {
            this.rateLimits.set(userId, []);
        }
        
        const userLimits = this.rateLimits.get(userId);
        
        // Remove old entries
        const cutoff = now - window;
        const recentRequests = userLimits.filter(time => time > cutoff);
        this.rateLimits.set(userId, recentRequests);
        
        // Check if over limit
        if (recentRequests.length >= maxRequests) {
            this.stats.rateLimited++;
            
            // Log suspicious activity
            this.recordSuspiciousActivity(userId, 'rate_limit_exceeded');
            
            this.logger.debug(`🚦 Rate limited: ${userId} (${recentRequests.length}/${maxRequests})`);
            return true;
        }
        
        // Add current request
        recentRequests.push(now);
        this.rateLimits.set(userId, recentRequests);
        
        return false;
    }

    /**
     * Command-specific rate limiting
     */
    async isCommandRateLimited(jid, command) {
        if (!config.ANTI_BAN) return false;
        
        const userId = this.extractUserId(jid);
        const key = `${userId}:${command}`;
        const now = Date.now();
        const window = 60000; // 1 minute
        const maxCommands = 10; // 10 commands per minute per user
        
        if (!this.commandLimits.has(key)) {
            this.commandLimits.set(key, []);
        }
        
        const commandHistory = this.commandLimits.get(key);
        
        // Clean old entries
        const cutoff = now - window;
        const recentCommands = commandHistory.filter(time => time > cutoff);
        this.commandLimits.set(key, recentCommands);
        
        if (recentCommands.length >= maxCommands) {
            this.recordSuspiciousActivity(userId, 'command_spam', { command });
            return true;
        }
        
        recentCommands.push(now);
        this.commandLimits.set(key, recentCommands);
        
        return false;
    }

    /**
     * Auto-response rate limiting
     */
    async isAutoResponseRateLimited(jid) {
        const userId = this.extractUserId(jid);
        const now = Date.now();
        const window = 300000; // 5 minutes
        const maxResponses = 3; // 3 auto-responses per 5 minutes
        
        if (!this.autoResponseLimits.has(userId)) {
            this.autoResponseLimits.set(userId, []);
        }
        
        const responseHistory = this.autoResponseLimits.get(userId);
        
        // Clean old entries
        const cutoff = now - window;
        const recentResponses = responseHistory.filter(time => time > cutoff);
        this.autoResponseLimits.set(userId, recentResponses);
        
        if (recentResponses.length >= maxResponses) {
            return true;
        }
        
        recentResponses.push(now);
        this.autoResponseLimits.set(userId, recentResponses);
        
        return false;
    }

    /**
     * Smart message delay to avoid detection
     */
    async smartDelay() {
        if (!config.ANTI_BAN) return;
        
        const delay = Math.random() * (this.messageDelayMax - this.messageDelayMin) + this.messageDelayMin;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Record suspicious activity
     */
    recordSuspiciousActivity(userId, type, metadata = {}) {
        const now = Date.now();
        
        if (!this.suspiciousActivity.has(userId)) {
            this.suspiciousActivity.set(userId, []);
        }
        
        const userActivity = this.suspiciousActivity.get(userId);
        userActivity.push({
            type,
            timestamp: now,
            metadata
        });
        
        // Keep only recent activity (last 24 hours)
        const cutoff = now - (24 * 60 * 60 * 1000);
        const recentActivity = userActivity.filter(activity => activity.timestamp > cutoff);
        this.suspiciousActivity.set(userId, recentActivity);
        
        // Auto-block if too much suspicious activity
        if (recentActivity.length >= 10) {
            this.blockUser(`${userId}@s.whatsapp.net`, 'Excessive suspicious activity');
        }
        
        this.logSecurityEvent('suspicious_activity', {
            userId,
            type,
            metadata,
            timestamp: now
        });
    }

    /**
     * Log security event
     */
    logSecurityEvent(type, data) {
        const event = {
            id: crypto.randomUUID(),
            type,
            data,
            timestamp: Date.now()
        };
        
        this.securityEvents.push(event);
        this.stats.securityEvents++;
        
        // Keep only recent events (last 1000)
        if (this.securityEvents.length > 1000) {
            this.securityEvents = this.securityEvents.slice(-1000);
        }
        
        // Log critical events
        if (['user_blocked', 'spam_detected', 'attack_detected'].includes(type)) {
            this.logger.warn(`🚨 Security event: ${type}`, data);
        }
    }

    /**
     * Update command statistics
     */
    updateCommandStats(jid, command) {
        const userId = this.extractUserId(jid);
        const key = `stats:${userId}:${command}`;
        
        // Simple counter - in production you might want more sophisticated tracking
        const current = this.cache.get(key) || 0;
        this.cache.set(key, current + 1, 3600); // Cache for 1 hour
    }

    /**
     * Get user statistics
     */
    getUserStats(jid) {
        const userId = this.extractUserId(jid);
        
        return {
            blocked: this.blockedUsers.has(userId),
            rateLimited: this.rateLimits.has(userId),
            suspiciousActivity: this.suspiciousActivity.get(userId) || [],
            commandUsage: this.getUserCommandStats(userId)
        };
    }

    /**
     * Get user command statistics
     */
    getUserCommandStats(userId) {
        const stats = {};
        
        // This is simplified - in production you'd want better storage
        for (const [key, value] of this.cache.entries()) {
            if (key.startsWith(`stats:${userId}:`)) {
                const command = key.split(':')[2];
                stats[command] = value;
            }
        }
        
        return stats;
    }

    /**
     * Extract user ID from JID
     */
    extractUserId(jid) {
        return jid.split('@')[0];
    }

    /**
     * Get security statistics
     */
    getSecurityStats() {
        return {
            ...this.stats,
            blockedUsers: this.blockedUsers.size,
            rateLimitEntries: this.rateLimits.size,
            suspiciousUsers: this.suspiciousActivity.size,
            recentEvents: this.securityEvents.slice(-10)
        };
    }

    /**
     * Start cleanup tasks
     */
    startCleanupTasks() {
        // Clean up rate limits every 5 minutes
        setInterval(() => {
            this.cleanupRateLimits();
        }, 5 * 60 * 1000);
        
        // Clean up suspicious activity every hour
        setInterval(() => {
            this.cleanupSuspiciousActivity();
        }, 60 * 60 * 1000);
    }

    /**
     * Clean up old rate limit entries
     */
    cleanupRateLimits() {
        const now = Date.now();
        const window = config.RATE_LIMIT_WINDOW;
        const cutoff = now - window;
        
        for (const [userId, timestamps] of this.rateLimits.entries()) {
            const recent = timestamps.filter(time => time > cutoff);
            if (recent.length === 0) {
                this.rateLimits.delete(userId);
            } else {
                this.rateLimits.set(userId, recent);
            }
        }
        
        // Also clean command limits
        for (const [key, timestamps] of this.commandLimits.entries()) {
            const recent = timestamps.filter(time => time > cutoff);
            if (recent.length === 0) {
                this.commandLimits.delete(key);
            } else {
                this.commandLimits.set(key, recent);
            }
        }
        
        this.logger.debug('🧹 Rate limit cleanup completed');
    }

    /**
     * Clean up old suspicious activity
     */
    cleanupSuspiciousActivity() {
        const now = Date.now();
        const cutoff = now - (24 * 60 * 60 * 1000); // 24 hours
        
        for (const [userId, activities] of this.suspiciousActivity.entries()) {
            const recent = activities.filter(activity => activity.timestamp > cutoff);
            if (recent.length === 0) {
                this.suspiciousActivity.delete(userId);
            } else {
                this.suspiciousActivity.set(userId, recent);
            }
        }
        
        this.logger.debug('🧹 Suspicious activity cleanup completed');
    }

    /**
     * General cleanup method
     */
    cleanup() {
        this.cleanupRateLimits();
        this.cleanupSuspiciousActivity();
        
        // Clean security events (keep last 500)
        if (this.securityEvents.length > 500) {
            this.securityEvents = this.securityEvents.slice(-500);
        }
    }

    /**
     * Emergency security lockdown
     */
    async emergencyLockdown() {
        this.logger.error('🚨 EMERGENCY LOCKDOWN ACTIVATED');
        
        // Block all new interactions temporarily
        this.emergencyMode = true;
        
        // Notify owner
        if (this.sock && config.OWNER_NUMBER) {
            try {
                await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                    text: '🚨 *SECURITY ALERT*\n\nEmergency lockdown activated due to suspicious activity.\nBot is temporarily restricted.'
                });
            } catch (error) {
                this.logger.error('Failed to send emergency notification:', error);
            }
        }
        
        // Auto-release after 1 hour
        setTimeout(() => {
            this.emergencyMode = false;
            this.logger.info('🔓 Emergency lockdown lifted');
        }, 60 * 60 * 1000);
    }
}

module.exports = SecurityManager;
