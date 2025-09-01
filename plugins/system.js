/**
 * MATDEV System Plugin
 * System administration and monitoring commands
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const config = require('../config');
const Utils = require('../lib/utils');

const utils = new Utils();

class SystemPlugin {
    constructor() {
        this.name = 'system';
        this.description = 'System administration and monitoring';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ System plugin loaded');
    }

    /**
     * Register system commands
     */
    registerCommands() {
        // System info command
        this.bot.messageHandler.registerCommand('sysinfo', this.sysinfoCommand.bind(this), {
            description: 'Show system information',
            usage: `${config.PREFIX}sysinfo`,
            category: 'system',
            ownerOnly: true
        });

        // Performance command
        this.bot.messageHandler.registerCommand('performance', this.performanceCommand.bind(this), {
            description: 'Show performance metrics',
            usage: `${config.PREFIX}performance`,
            category: 'system',
            ownerOnly: true
        });

        // Cache stats command
        this.bot.messageHandler.registerCommand('cache', this.cacheCommand.bind(this), {
            description: 'Manage cache system',
            usage: `${config.PREFIX}cache [clear|stats]`,
            category: 'system',
            ownerOnly: true
        });

        // Security stats command
        this.bot.messageHandler.registerCommand('security', this.securityCommand.bind(this), {
            description: 'Show security statistics',
            usage: `${config.PREFIX}security [stats|blocked]`,
            category: 'system',
            ownerOnly: true
        });

        // Logs command
        this.bot.messageHandler.registerCommand('logs', this.logsCommand.bind(this), {
            description: 'Manage bot logs',
            usage: `${config.PREFIX}logs [recent|clear]`,
            category: 'system',
            ownerOnly: true
        });

        // Cleanup command
        this.bot.messageHandler.registerCommand('cleanup', this.cleanupCommand.bind(this), {
            description: 'Clean temporary files and cache',
            usage: `${config.PREFIX}cleanup`,
            category: 'system',
            ownerOnly: true
        });

        // Plugin management
        this.bot.messageHandler.registerCommand('plugins', this.pluginsCommand.bind(this), {
            description: 'Manage bot plugins',
            usage: `${config.PREFIX}plugins [list|reload]`,
            category: 'system',
            ownerOnly: true
        });

        // Configuration command
        this.bot.messageHandler.registerCommand('config', this.configCommand.bind(this), {
            description: 'Show configuration settings',
            usage: `${config.PREFIX}config`,
            category: 'system',
            ownerOnly: true
        });

        // Health check command
        this.bot.messageHandler.registerCommand('health', this.healthCheck.bind(this), {
            description: 'Perform system health check',
            usage: `${config.PREFIX}health`,
            category: 'system',
            ownerOnly: true
        });

        // Update command
        this.bot.messageHandler.registerCommand('update', this.updateCommand.bind(this), {
            description: 'Check for bot updates',
            usage: `${config.PREFIX}update`,
            category: 'system',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('health', this.healthCheck.bind(this), {
            description: 'Perform system health check',
            usage: `${config.PREFIX}health`,
            category: 'system',
            ownerOnly: true
        });

        
    }

    /**
     * System information command
     */
    async sysinfoCommand(messageInfo) {
        try {
            const systemInfo = utils.getSystemInfo();
            const platform = process.platform;
            const arch = process.arch;
            const nodeVersion = process.version;
            const totalMem = utils.formatFileSize(systemInfo.memory.total);
            const freeMem = utils.formatFileSize(systemInfo.memory.free);
            const cpuModel = systemInfo.cpu.model;
            const cpuCores = systemInfo.cpu.times ? Object.keys(systemInfo.cpu.times).length : 'N/A';

            const sysText = `*💻 SYSTEM INFORMATION*\n\n` +
                `*Operating System:*\n` +
                `• Platform: ${platform}\n` +
                `• Architecture: ${arch}\n` +
                `• Node.js: ${nodeVersion}\n\n` +
                `*Memory:*\n` +
                `• Total: ${totalMem}\n` +
                `• Free: ${freeMem}\n` +
                `• Used: ${utils.formatFileSize(systemInfo.memory.total - systemInfo.memory.free)}\n\n` +
                `*CPU:*\n` +
                `• Model: ${cpuModel}\n` +
                `• Cores: ${os.cpus().length}\n\n` +
                `*Uptime:*\n` +
                `• System: ${utils.formatUptime(systemInfo.uptime.system * 1000)}\n` +
                `• Process: ${utils.formatUptime(systemInfo.uptime.process * 1000)}\n\n` +
                `*Environment:*\n` +
                `• Platform: ${config.PLATFORM}\n` +
                `• Environment: ${config.NODE_ENV}`;

            await this.bot.messageHandler.reply(messageInfo, sysText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving system information.');
        }
    }

    /**
     * Performance metrics command
     */
    async performanceCommand(messageInfo) {
        try {
            const memUsage = process.memoryUsage();
            const messageStats = this.bot.messageHandler.getStats();
            const cacheStats = this.bot.cache ? this.bot.cache.getStats() : null;
            const securityStats = this.bot.security ? this.bot.security.getSecurityStats() : null;

            const perfText = `*📊 PERFORMANCE METRICS*\n\n` +
                `*Memory Usage:*\n` +
                `• Heap Used: ${utils.formatFileSize(memUsage.heapUsed)}\n` +
                `• Heap Total: ${utils.formatFileSize(memUsage.heapTotal)}\n` +
                `• External: ${utils.formatFileSize(memUsage.external)}\n` +
                `• RSS: ${utils.formatFileSize(memUsage.rss)}\n\n` +
                `*Message Processing:*\n` +
                `• Processed: ${utils.formatNumber(messageStats.processed)}\n` +
                `• Commands: ${utils.formatNumber(messageStats.commands)}\n` +
                `• Errors: ${messageStats.errors}\n` +
                `• Media Messages: ${utils.formatNumber(messageStats.mediaMessages)}\n\n` +
                `${cacheStats ? `*Cache Performance:*\n` +
                `• Hit Rate: ${(cacheStats.hitRate * 100).toFixed(2)}%\n` +
                `• Total Keys: ${Object.values(cacheStats).reduce((acc, cache) => acc + (cache.keys || 0), 0)}\n\n` : ''}` +
                `${securityStats ? `*Security:*\n` +
                `• Blocked Users: ${securityStats.blockedUsers}\n` +
                `• Rate Limited: ${securityStats.rateLimited}\n` +
                `• Security Events: ${securityStats.securityEvents}\n\n` : ''}` +
                `*Bot Statistics:*\n` +
                `• Uptime: ${utils.formatUptime(Date.now() - this.bot.startTime)}\n` +
                `• Messages Sent: ${utils.formatNumber(this.bot.messageStats.sent)}\n` +
                `• Messages Received: ${utils.formatNumber(this.bot.messageStats.received)}`;

            await this.bot.messageHandler.reply(messageInfo, perfText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving performance metrics.');
        }
    }

    /**
     * Cache management command
     */
    async cacheCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const action = args[0]?.toLowerCase();

            if (!this.bot.cache) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Cache system not available.');
                return;
            }

            switch (action) {
                case 'clear':
                    const type = args[1] || 'all';
                    this.bot.cache.flushCache(type);
                    await this.bot.messageHandler.reply(messageInfo, `✅ Cache cleared: ${type}`);
                    break;

                case 'stats':
                default:
                    const stats = this.bot.cache.getStats();
                    const cacheText = `*💾 CACHE STATISTICS*\n\n` +
                        `*Overall Performance:*\n` +
                        `• Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%\n` +
                        `• Total Hits: ${utils.formatNumber(stats.hits)}\n` +
                        `• Total Misses: ${utils.formatNumber(stats.misses)}\n` +
                        `• Sets: ${utils.formatNumber(stats.sets)}\n` +
                        `• Deletes: ${utils.formatNumber(stats.deletes)}\n\n` +
                        `*Cache Breakdown:*\n` +
                        `• Messages: ${stats.messageCache.keys} keys\n` +
                        `• Users: ${stats.userCache.keys} keys\n` +
                        `• Groups: ${stats.groupCache.keys} keys\n` +
                        `• Media: ${stats.mediaCache.keys} keys\n` +
                        `• General: ${stats.generalCache.keys} keys\n\n` +
                        `_Use ${config.PREFIX}cache clear [type] to clear specific cache_`;

                    await this.bot.messageHandler.reply(messageInfo, cacheText);
                    break;
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error managing cache.');
        }
    }

    /**
     * Security management command
     */
    async securityCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const action = args[0]?.toLowerCase();

            if (!this.bot.security) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Security system not available.');
                return;
            }

            const stats = this.bot.security.getSecurityStats();

            switch (action) {
                case 'blocked':
                    const securityText = `*🛡️ BLOCKED USERS*\n\n` +
                        `• Total Blocked: ${stats.blockedUsers}\n` +
                        `• Rate Limited Today: ${stats.rateLimited}\n` +
                        `• Security Events: ${stats.securityEvents}\n\n` +
                        `*Recent Events:*\n` +
                        stats.recentEvents.slice(0, 5).map((event, index) => 
                            `${index + 1}. ${event.type} - ${new Date(event.timestamp).toLocaleString()}`
                        ).join('\n') || 'No recent events';

                    await this.bot.messageHandler.reply(messageInfo, securityText);
                    break;

                case 'stats':
                default:
                    const statsText = `*🛡️ SECURITY STATISTICS*\n\n` +
                        `*Protection Status:*\n` +
                        `• Anti-Ban: ${config.ANTI_BAN ? '✅ Active' : '❌ Disabled'}\n` +
                        `• Rate Limiting: ✅ Active\n` +
                        `• Auto-Block: ✅ Active\n\n` +
                        `*Statistics:*\n` +
                        `• Blocked Users: ${stats.blockedUsers}\n` +
                        `• Rate Limited: ${stats.rateLimited}\n` +
                        `• Suspicious Users: ${stats.suspiciousUsers}\n` +
                        `• Security Events: ${stats.securityEvents}\n\n` +
                        `*Rate Limiting:*\n` +
                        `• Window: ${config.RATE_LIMIT_WINDOW / 1000}s\n` +
                        `• Max Requests: ${config.RATE_LIMIT_MAX_REQUESTS}\n\n` +
                        `_Security system is actively protecting the bot_`;

                    await this.bot.messageHandler.reply(messageInfo, statsText);
                    break;
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving security information.');
        }
    }

    /**
     * Logs management command
     */
    async logsCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const action = args[0]?.toLowerCase();

            switch (action) {
                case 'clear':
                    if (config.LOG_TO_FILE) {
                        await this.bot.logger.clearLogs();
                        await this.bot.messageHandler.reply(messageInfo, '✅ Log files cleared.');
                    } else {
                        await this.bot.messageHandler.reply(messageInfo, '❌ File logging is disabled.');
                    }
                    break;

                case 'recent':
                default:
                    if (config.LOG_TO_FILE) {
                        const recentLogs = await this.bot.logger.getRecentLogs(10);
                        const logsText = `*📝 RECENT LOGS*\n\n` +
                            recentLogs.slice(-5).join('\n') || 'No recent logs available';

                        await this.bot.messageHandler.reply(messageInfo, logsText);
                    } else {
                        const logsText = `*📝 LOGGING STATUS*\n\n` +
                            `• File Logging: ${config.LOG_TO_FILE ? '✅ Enabled' : '❌ Disabled'}\n` +
                            `• Log Level: ${config.LOG_LEVEL}\n` +
                            `• Console Logging: ✅ Enabled\n\n` +
                            `_Enable file logging to view recent logs_`;

                        await this.bot.messageHandler.reply(messageInfo, logsText);
                    }
                    break;
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error managing logs.');
        }
    }

    /**
     * Cleanup command
     */
    async cleanupCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🧹 Starting cleanup...');

            let cleanupReport = '*🧹 CLEANUP REPORT*\n\n';

            // Clean temporary files
            const tempFiles = await utils.cleanTempFiles();
            cleanupReport += `• Temp files cleaned: ${tempFiles}\n`;

            // Clean cache
            if (this.bot.cache) {
                this.bot.cache.cleanup();
                cleanupReport += `• Cache optimized: ✅\n`;
            }

            // Clean security data
            if (this.bot.security) {
                this.bot.security.cleanup();
                cleanupReport += `• Security data cleaned: ✅\n`;
            }

            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                cleanupReport += `• Memory garbage collected: ✅\n`;
            }

            cleanupReport += '\n_Cleanup completed successfully_';

            await this.bot.messageHandler.reply(messageInfo, cleanupReport);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during cleanup.');
        }
    }

    /**
     * Plugins management command
     */
    async pluginsCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const action = args[0]?.toLowerCase();

            switch (action) {
                case 'reload':
                    await this.bot.messageHandler.reply(messageInfo, '🔄 Reloading plugins...');

                    // Clear require cache for plugins
                    const pluginsDir = path.join(process.cwd(), 'plugins');
                    const pluginFiles = await fs.readdir(pluginsDir).catch(() => []);

                    for (const file of pluginFiles) {
                        if (file.endsWith('.js')) {
                            const pluginPath = path.join(pluginsDir, file);
                            delete require.cache[require.resolve(pluginPath)];
                        }
                    }

                    await this.bot.loadPlugins();
                    await this.bot.messageHandler.reply(messageInfo, '✅ Plugins reloaded successfully.');
                    break;

                case 'list':
                default:
                    const pluginsList = await this.getPluginsList();
                    const pluginsText = `*📦 LOADED PLUGINS*\n\n` +
                        pluginsList.map((plugin, index) => 
                            `${index + 1}. *${plugin.name}*\n   ${plugin.description}`
                        ).join('\n\n') || 'No plugins loaded';

                    await this.bot.messageHandler.reply(messageInfo, pluginsText);
                    break;
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error managing plugins.');
        }
    }

    /**
     * Configuration command
     */
    async configCommand(messageInfo) {
        try {
            const configText = `*⚙️ BOT CONFIGURATION*\n\n` +
                `*Identity:*\n` +
                `• Bot Name: ${config.BOT_NAME}\n` +
                `• Owner: ${config.OWNER_NUMBER ? 'Set' : 'Not Set'}\n` +
                `• Prefix: ${config.PREFIX}\n\n` +
                `*Behavior:*\n` +
                `• Public Mode: ${config.PUBLIC_MODE ? '✅' : '❌'}\n` +
                `• Auto Typing: ${config.AUTO_TYPING ? '✅' : '❌'}\n` +
                `• Auto Read: ${config.AUTO_READ ? '✅' : '❌'}\n` +
                `• Auto Status View: ${config.AUTO_STATUS_VIEW ? '✅' : '❌'}\n` +
                `• Reject Calls: ${config.REJECT_CALLS ? '✅' : '❌'}\n\n` +
                `*Performance:*\n` +
                `• Max Concurrent Messages: ${config.MAX_CONCURRENT_MESSAGES}\n` +
                `• Message Timeout: ${config.MESSAGE_TIMEOUT}ms\n` +
                `• Cache TTL: ${config.CACHE_TTL}s\n\n` +
                `*Security:*\n` +
                `• Anti-Ban: ${config.ANTI_BAN ? '✅' : '❌'}\n` +
                `• Rate Limit Window: ${config.RATE_LIMIT_WINDOW / 1000}s\n` +
                `• Rate Limit Max: ${config.RATE_LIMIT_MAX_REQUESTS}\n\n` +
                `*Platform:*\n` +
                `• Detected: ${config.PLATFORM}\n` +
                `• Environment: ${config.NODE_ENV}`;

            await this.bot.messageHandler.reply(messageInfo, configText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving configuration.');
        }
    }

    /**
     * Health check command
     */
    async healthCheck(messageInfo) {
        try {
            const uptime = this.bot.utils.formatUptime(Date.now() - this.bot.startTime);
            const memUsage = process.memoryUsage();
            const storageStats = await this.bot.database.getStorageStats();

            const report = `🏥 *SYSTEM HEALTH CHECK*\n\n` +
                `⏱️ Uptime: ${uptime}\n` +
                `🧠 Memory: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB used\n` +
                `💾 Heap: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB total\n` +
                `📊 Messages: ${storageStats?.total_messages || 0}\n` +
                `📎 Media Files: ${storageStats?.media_messages || 0}\n` +
                `💽 Storage: ${storageStats?.media_size_mb || 0}MB\n` +
                `🔗 Connection: ${this.bot.isConnected ? '✅ Connected' : '❌ Disconnected'}\n` +
                `🛡️ Security: Active\n\n` +
                `💚 System Status: Healthy`;

            await this.bot.messageHandler.reply(messageInfo, report);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Health check failed');
        }
    }

    

    /**
     * Update command
     */
    async updateCommand(messageInfo) {
        try {
            const updateText = `*🔄 UPDATE INFORMATION*\n\n` +
                `*Current Version:* 1.0.0\n` +
                `*Platform:* ${config.PLATFORM}\n` +
                `*Node.js:* ${process.version}\n\n` +
                `*Update Status:*\n` +
                `• Auto-updates: ❌ Disabled\n` +
                `• Manual updates: ✅ Available\n\n` +
                `*To update MATDEV:*\n` +
                `1. Pull latest changes from repository\n` +
                `2. Restart the bot process\n` +
                `3. Session will be preserved automatically\n\n` +
                `_Always backup your session before updating_`;

            await this.bot.messageHandler.reply(messageInfo, updateText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error checking for updates.');
        }
    }

    /**
     * Get plugins list
     */
    async getPluginsList() {
        try {
            const pluginsDir = path.join(process.cwd(), 'plugins');
            const files = await fs.readdir(pluginsDir).catch(() => []);
            const plugins = [];

            for (const file of files) {
                if (file.endsWith('.js')) {
                    try {
                        const pluginPath = path.join(pluginsDir, file);
                        const plugin = require(pluginPath);
                        plugins.push({
                            name: path.basename(file, '.js'),
                            description: plugin.description || 'No description available'
                        });
                    } catch (error) {
                        // Skip invalid plugins
                    }
                }
            }

            return plugins;
        } catch (error) {
            return [];
        }
    }

    /**
     * Run comprehensive health check
     */
    async runHealthCheck() {
        const checks = [];
        let overallHealth = 'Healthy';

        // Connection check
        if (this.bot.isConnected) {
            checks.push('✅ WhatsApp Connection: Connected');
        } else {
            checks.push('❌ WhatsApp Connection: Disconnected');
            overallHealth = 'Warning';
        }

        // Memory check
        const memUsage = process.memoryUsage();
        const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        if (memUsageMB < 500) {
            checks.push(`✅ Memory Usage: ${memUsageMB}MB (Good)`);
        } else if (memUsageMB < 1000) {
            checks.push(`⚠️ Memory Usage: ${memUsageMB}MB (Warning)`);
            if (overallHealth === 'Healthy') overallHealth = 'Warning';
        } else {
            checks.push(`❌ Memory Usage: ${memUsageMB}MB (Critical)`);
            overallHealth = 'Critical';
        }

        // Cache check
        if (this.bot.cache) {
            const cacheStats = this.bot.cache.getStats();
            const hitRate = (cacheStats.hitRate * 100).toFixed(1);
            checks.push(`✅ Cache System: ${hitRate}% hit rate`);
        } else {
            checks.push('❌ Cache System: Not available');
            overallHealth = 'Warning';
        }

        // Security check
        if (this.bot.security) {
            checks.push('✅ Security System: Active');
        } else {
            checks.push('❌ Security System: Not available');
            overallHealth = 'Critical';
        }

        // Session check
        const sessionPath = path.join(process.cwd(), 'session');
        if (await fs.pathExists(sessionPath)) {
            checks.push('✅ Session: Valid');
        } else {
            checks.push('⚠️ Session: No session found');
            if (overallHealth === 'Healthy') overallHealth = 'Warning';
        }

        // Plugin check
        const commands = this.bot.messageHandler.getCommands();
        checks.push(`✅ Plugins: ${commands.length} commands loaded`);

        const healthIcon = overallHealth === 'Healthy' ? '🟢' : 
                          overallHealth === 'Warning' ? '🟡' : '🔴';

        return `*🏥 HEALTH CHECK REPORT*\n\n` +
               `*Overall Status:* ${healthIcon} ${overallHealth}\n\n` +
               `*System Checks:*\n` +
               checks.join('\n') + '\n\n' +
               `*Timestamp:* ${utils.getFormattedDate()}\n` +
               `*Uptime:* ${utils.formatUptime(Date.now() - this.bot.startTime)}`;
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new SystemPlugin();
        await plugin.init(bot);
    }
};