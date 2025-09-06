/**
 * MATDEV Cache Manager
 * High-performance in-memory caching system
 */

const NodeCache = require('node-cache');
const config = require('../config');
const Logger = require('./logger');

class CacheManager {
    constructor() {
        this.logger = new Logger();
        
        // Initialize multiple cache stores for different data types
        this.messageCache = new NodeCache({ 
            stdTTL: 3600, // 1 hour
            maxKeys: 10000,
            checkperiod: 600 // Check every 10 minutes
        });
        
        this.userCache = new NodeCache({
            stdTTL: 7200, // 2 hours
            maxKeys: 5000,
            checkperiod: 600
        });
        
        this.groupCache = new NodeCache({
            stdTTL: 3600, // 1 hour
            maxKeys: 1000,
            checkperiod: 600
        });
        
        // Enhanced group participant cache for faster group message processing
        this.groupParticipantCache = new NodeCache({
            stdTTL: 7200, // 2 hours - participants change less frequently
            maxKeys: 500,
            checkperiod: 600
        });
        
        this.mediaCache = new NodeCache({
            stdTTL: 1800, // 30 minutes
            maxKeys: 2000,
            checkperiod: 300
        });
        
        this.generalCache = new NodeCache({
            stdTTL: config.CACHE_TTL,
            maxKeys: 5000,
            checkperiod: 600
        });
        
        this.setupEventHandlers();
        this.startPeriodicTasks();
        
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0,
            errors: 0
        };
        
        this.logger.success('💾 Cache manager initialized');
    }

    /**
     * Setup cache event handlers
     */
    setupEventHandlers() {
        const caches = [this.messageCache, this.userCache, this.groupCache, this.groupParticipantCache, this.mediaCache, this.generalCache];
        
        caches.forEach((cache, index) => {
            const names = ['message', 'user', 'group', 'groupParticipant', 'media', 'general'];
            const name = names[index];
            
            cache.on('set', (key, value) => {
                this.stats.sets++;
                this.logger.debug(`Cache SET [${name}]: ${key}`);
            });
            
            cache.on('del', (key, value) => {
                this.stats.deletes++;
                this.logger.debug(`Cache DEL [${name}]: ${key}`);
            });
            
            cache.on('expired', (key, value) => {
                this.logger.debug(`Cache EXPIRED [${name}]: ${key}`);
            });
            
            cache.on('flush', () => {
                this.logger.debug(`Cache FLUSH [${name}]`);
            });
        });
    }

    /**
     * Cache a message
     */
    cacheMessage(message) {
        try {
            const key = message.key.id;
            const cacheData = {
                message,
                timestamp: Date.now(),
                sender: message.key.remoteJid,
                type: Object.keys(message.message || {})[0]
            };
            
            this.messageCache.set(key, cacheData);
            return true;
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error caching message:', error);
            return false;
        }
    }

    /**
     * Get cached message
     */
    getMessage(messageId) {
        try {
            const cached = this.messageCache.get(messageId);
            if (cached) {
                this.stats.hits++;
                return cached.message;
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error getting cached message:', error);
            return null;
        }
    }

    /**
     * Cache user information
     */
    cacheUserInfo(jid, userInfo) {
        try {
            const key = `user:${jid}`;
            const cacheData = {
                ...userInfo,
                cached: Date.now()
            };
            
            this.userCache.set(key, cacheData);
            return true;
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error caching user info:', error);
            return false;
        }
    }

    /**
     * Get cached user information
     */
    getUserInfo(jid) {
        try {
            const key = `user:${jid}`;
            const cached = this.userCache.get(key);
            if (cached) {
                this.stats.hits++;
                return cached;
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error getting cached user info:', error);
            return null;
        }
    }

    /**
     * Cache group information
     */
    cacheGroupInfo(jid, groupInfo) {
        try {
            const key = `group:${jid}`;
            const cacheData = {
                ...groupInfo,
                cached: Date.now()
            };
            
            this.groupCache.set(key, cacheData);
            return true;
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error caching group info:', error);
            return false;
        }
    }

    /**
     * Get cached group information
     */
    getGroupInfo(jid) {
        try {
            const key = `group:${jid}`;
            const cached = this.groupCache.get(key);
            if (cached) {
                this.stats.hits++;
                return cached;
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error getting cached group info:', error);
            return null;
        }
    }

    /**
     * Cache media information
     */
    cacheMediaInfo(messageId, mediaInfo) {
        try {
            const key = `media:${messageId}`;
            const cacheData = {
                ...mediaInfo,
                cached: Date.now()
            };
            
            this.mediaCache.set(key, cacheData);
            return true;
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error caching media info:', error);
            return false;
        }
    }

    /**
     * Get cached media information
     */
    getMediaInfo(messageId) {
        try {
            const key = `media:${messageId}`;
            const cached = this.mediaCache.get(key);
            if (cached) {
                this.stats.hits++;
                return cached;
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error getting cached media info:', error);
            return null;
        }
    }

    /**
     * General purpose cache operations
     */
    set(key, value, ttl = null) {
        try {
            this.generalCache.set(key, value, ttl || config.CACHE_TTL);
            return true;
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error setting cache:', error);
            return false;
        }
    }

    get(key) {
        try {
            const value = this.generalCache.get(key);
            if (value !== undefined) {
                this.stats.hits++;
                return value;
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error getting from cache:', error);
            return null;
        }
    }

    has(key) {
        return this.generalCache.has(key);
    }

    delete(key) {
        try {
            return this.generalCache.del(key);
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error deleting from cache:', error);
            return false;
        }
    }

    /**
     * Get all keys from general cache
     */
    keys() {
        return this.generalCache.keys();
    }

    /**
     * Get all entries from general cache
     */
    entries() {
        const keys = this.generalCache.keys();
        const entries = new Map();
        
        keys.forEach(key => {
            const value = this.generalCache.get(key);
            if (value !== undefined) {
                entries.set(key, value);
            }
        });
        
        return entries;
    }

    /**
     * Flush specific cache
     */
    flushCache(type = 'all') {
        try {
            switch (type) {
                case 'message':
                case 'messages':
                    this.messageCache.flushAll();
                    break;
                case 'user':
                case 'users':
                    this.userCache.flushAll();
                    break;
                case 'group':
                case 'groups':
                    this.groupCache.flushAll();
                    break;
                case 'media':
                    this.mediaCache.flushAll();
                    break;
                case 'general':
                    this.generalCache.flushAll();
                    break;
                case 'all':
                default:
                    this.messageCache.flushAll();
                    this.userCache.flushAll();
                    this.groupCache.flushAll();
                    this.mediaCache.flushAll();
                    this.generalCache.flushAll();
                    break;
            }
            
            this.logger.info(`🗑️ Cache flushed: ${type}`);
            return true;
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error flushing cache:', error);
            return false;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            ...this.stats,
            hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
            messageCache: {
                keys: this.messageCache.keys().length,
                stats: this.messageCache.getStats()
            },
            userCache: {
                keys: this.userCache.keys().length,
                stats: this.userCache.getStats()
            },
            groupCache: {
                keys: this.groupCache.keys().length,
                stats: this.groupCache.getStats()
            },
            mediaCache: {
                keys: this.mediaCache.keys().length,
                stats: this.mediaCache.getStats()
            },
            generalCache: {
                keys: this.generalCache.keys().length,
                stats: this.generalCache.getStats()
            }
        };
    }

    /**
     * Start periodic maintenance tasks
     */
    startPeriodicTasks() {
        // Log cache statistics every hour
        setInterval(() => {
            const stats = this.getStats();
            this.logger.info(`📊 Cache stats - Hit rate: ${(stats.hitRate * 100).toFixed(2)}%, Total keys: ${stats.messageCache.keys + stats.userCache.keys + stats.groupCache.keys + stats.mediaCache.keys + stats.generalCache.keys}`);
        }, 60 * 60 * 1000);
        
        // Smart memory cleanup every 6 hours
        setInterval(() => {
            this.smartMemoryCleanup();
        }, 6 * 60 * 60 * 1000); // 6 hours
    }

    /**
     * Cleanup expired entries and optimize memory
     */
    cleanup() {
        try {
            // NodeCache handles TTL automatically, but we can trigger manual cleanup
            const beforeStats = this.getStats();
            
            // Force garbage collection on all caches
            const caches = [this.messageCache, this.userCache, this.groupCache, this.mediaCache, this.generalCache];
            caches.forEach(cache => {
                // This will check and remove expired keys
                cache.keys();
            });
            
            const afterStats = this.getStats();
            
            this.logger.debug(`🧹 Cache cleanup completed`);
            
            return {
                before: beforeStats,
                after: afterStats
            };
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error during cache cleanup:', error);
            return null;
        }
    }

    /**
     * Smart memory cleanup - aggressive cache clearing every 6 hours
     */
    smartMemoryCleanup() {
        try {
            this.logger.info('🧠 Starting smart memory cleanup...');
            
            const beforeStats = this.getStats();
            const totalKeysBefore = beforeStats.messageCache.keys + beforeStats.userCache.keys + 
                                  beforeStats.groupCache.keys + beforeStats.mediaCache.keys + beforeStats.generalCache.keys;
            
            // Get memory usage before cleanup
            const memBefore = process.memoryUsage();
            
            // Aggressive cleanup: Clear 80% of old entries from message cache (keep only recent)
            this.aggressiveCleanCache('message', 0.8);
            
            // Clear 60% of user cache (less aggressive as user data is useful)  
            this.aggressiveCleanCache('user', 0.6);
            
            // Clear 70% of group cache
            this.aggressiveCleanCache('group', 0.7);
            
            // Clear 90% of media cache (media takes most memory)
            this.aggressiveCleanCache('media', 0.9);
            
            // Clear 50% of general cache
            this.aggressiveCleanCache('general', 0.5);
            
            // Force Node.js garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const afterStats = this.getStats();
            const totalKeysAfter = afterStats.messageCache.keys + afterStats.userCache.keys + 
                                 afterStats.groupCache.keys + afterStats.mediaCache.keys + afterStats.generalCache.keys;
            
            const memAfter = process.memoryUsage();
            const memoryFreed = ((memBefore.heapUsed - memAfter.heapUsed) / 1024 / 1024).toFixed(2);
            const keysCleared = totalKeysBefore - totalKeysAfter;
            
            this.logger.info(`🧠 Smart cleanup completed: Cleared ${keysCleared} keys, Freed ${memoryFreed}MB memory`);
            
        } catch (error) {
            this.logger.error('Error in smart memory cleanup:', error);
        }
    }

    /**
     * Aggressively clean a specific cache by percentage
     */
    aggressiveCleanCache(type, percentage) {
        try {
            let cache;
            let cacheName;
            
            switch (type) {
                case 'message':
                    cache = this.messageCache;
                    cacheName = 'message';
                    break;
                case 'user':
                    cache = this.userCache;
                    cacheName = 'user';
                    break;
                case 'group':
                    cache = this.groupCache;
                    cacheName = 'group';
                    break;
                case 'media':
                    cache = this.mediaCache;
                    cacheName = 'media';
                    break;
                case 'general':
                    cache = this.generalCache;
                    cacheName = 'general';
                    break;
                default:
                    return;
            }
            
            const keys = cache.keys();
            const totalKeys = keys.length;
            const keysToDelete = Math.floor(totalKeys * percentage);
            
            if (keysToDelete > 0) {
                // Sort keys by access time if available, otherwise just take first portion
                const keysToRemove = keys.slice(0, keysToDelete);
                
                keysToRemove.forEach(key => {
                    cache.del(key);
                });
                
                this.logger.debug(`🗑️ Cleaned ${keysToRemove.length}/${totalKeys} keys from ${cacheName} cache`);
            }
            
        } catch (error) {
            this.logger.error(`Error in aggressive cache cleanup for ${type}:`, error);
        }
    }

    /**
     * Smart cache warming for frequently accessed data
     */
    async warmCache(bot) {
        try {
            this.logger.info('🔥 Starting cache warming...');
            
            // Cache bot user info
            if (bot.sock && bot.sock.user) {
                this.cacheUserInfo(bot.sock.user.id, {
                    name: bot.sock.user.name,
                    id: bot.sock.user.id,
                    isBot: true
                });
            }
            
            // Cache owner info if configured
            if (config.OWNER_NUMBER) {
                this.cacheUserInfo(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                    isOwner: true,
                    privileges: ['admin', 'owner']
                });
            }
            
            this.logger.success('✅ Cache warming completed');
        } catch (error) {
            this.logger.error('Error warming cache:', error);
        }
    }
}

module.exports = CacheManager;
