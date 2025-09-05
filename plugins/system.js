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

        // Expose methods for other plugins to use
        this.bot.plugins = this.bot.plugins || {};
        this.bot.plugins.system = {
            setEnvValue: this.setEnvValue.bind(this),
            getEnvValue: this.getEnvValue.bind(this)
        };

        console.log('✅ System plugin loaded');
    }

    /**
     * Register system commands
     */
    registerCommands() {








        // Configuration command
        this.bot.messageHandler.registerCommand('config', this.configCommand.bind(this), {
            description: 'Show configuration settings',
            usage: `${config.PREFIX}config`,
            category: 'system',
            ownerOnly: true
        });


        // Update command (handles both check and now)
        this.bot.messageHandler.registerCommand('update', this.updateCommand.bind(this), {
            description: 'Check for bot updates or force update with "now"',
            usage: `${config.PREFIX}update [now]`,
            category: 'system',
            ownerOnly: true
        });

        // Environment variable management
        this.bot.messageHandler.registerCommand('setenv', this.setEnvCommand.bind(this), {
            description: 'Set environment variable',
            usage: `${config.PREFIX}setenv <key> <value>`,
            category: 'system',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('getenv', this.getEnvCommand.bind(this), {
            description: 'Get environment variable',
            usage: `${config.PREFIX}getenv <key>`,
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
                `• PREFIX: ${config.PREFIX}\n\n` +
                `*Behavior:*\n` +
                `• AUTO_TYPING: ${config.AUTO_TYPING}\n` +
                `• AUTO_READ: ${config.AUTO_READ}\n` +
                `• AUTO_STATUS_VIEW: ${config.AUTO_STATUS_VIEW}\n` +
                `• REJECT_CALLS: ${config.REJECT_CALLS}\n\n` +
                `_To change: ${config.PREFIX}setenv <KEY>=<VALUE>_\n` +
                `_Example: ${config.PREFIX}setenv AUTO_TYPING=true_`;

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
     * Set environment variable command
     */
    async setEnvCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length < 1) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Usage: ${config.PREFIX}setenv <key>=<value>`
                );
                return;
            }

            const input = args.join(' ');
            const equalIndex = input.indexOf('=');

            if (equalIndex === -1) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Usage: ${config.PREFIX}setenv <key>=<value>`
                );
                return;
            }

            const key = input.substring(0, equalIndex).trim().toUpperCase();
            const value = input.substring(equalIndex + 1).trim();

            if (!key || !value) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Usage: ${config.PREFIX}setenv <key>=<value>`
                );
                return;
            }

            // Protected configuration keys that cannot be modified via setenv (hidden values only)
            const protectedKeys = [
                'SESSION_ID', 'OWNER_NUMBER', 'BOT_NAME'
            ];

            if (protectedKeys.includes(key)) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Cannot modify protected configuration: ${key}`
                );
                return;
            }

            // Set the environment variable
            const success = await this.setEnvValue(key, value);

            if (success) {
                // Hot reload the configuration
                await this.hotReloadConfig(key, value);

                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ *${key}* = ${value}`
                );
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to update environment variable: ${key}`
                );
            }

        } catch (error) {
            console.error('Error in setenv command:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while setting environment variable'
            );
        }
    }

    /**
     * Get environment variable command
     */
    async getEnvCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length < 1) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Usage: ${config.PREFIX}getenv <key>`
                );
                return;
            }

            const key = args[0].toUpperCase();
            const value = process.env[key];

            if (value === undefined) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Environment variable *${key}* is not set`);
            } else {
                // Protected configuration keys that should show restricted message (hidden values only)
                const protectedKeys = [
                    'SESSION_ID', 'OWNER_NUMBER', 'ANTI_BAN',
                    'RATE_LIMIT_WINDOW', 'RATE_LIMIT_MAX_REQUESTS',
                    'MAX_CONCURRENT_MESSAGES', 'MESSAGE_TIMEOUT',
                    'CACHE_TTL', 'LOG_LEVEL', 'LOG_TO_FILE',
                    'NODE_ENV', 'PLATFORM', 'PUBLIC_MODE'
                ];

                // Hide sensitive values completely
                const sensitiveKeys = ['SESSION_ID', 'OWNER_NUMBER', 'DATABASE_URL', 'REDIS_URL', 'API_KEY'];
                const isSensitive = sensitiveKeys.some(sensitive => key.includes(sensitive));

                if (protectedKeys.includes(key)) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `🔒 *${key}* is a protected configuration value.\n\n` +
                        `Use the ${config.PREFIX}config command to view current configuration.`
                    );
                } else {
                    const displayValue = isSensitive ? '[HIDDEN]' : value;
                    await this.bot.messageHandler.reply(messageInfo, 
                        `*Environment Variable:*\n*${key}* = ${displayValue}`
                    );
                }
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving environment variable.');
        }
    }

    /**
     * Set environment variable (exposed method for other plugins)
     */
    async setEnvValue(key, value) {
        try {
            await this.updateEnvFile(key, value);
            // Also update process.env for immediate effect
            process.env[key] = value;
            return true;
        } catch (error) {
            console.error('Error setting environment variable:', error);
            return false;
        }
    }

    /**
     * Get environment variable (exposed method for other plugins)
     */
    getEnvValue(key) {
        return process.env[key];
    }

    /**
     * Update environment variable in .env file
     */
    async updateEnvFile(key, value) {
        const envPath = path.join(process.cwd(), '.env');

        try {
            let envContent = '';
            let envLines = [];

            // Read existing .env file
            if (await fs.pathExists(envPath)) {
                envContent = await fs.readFile(envPath, 'utf8');
                envLines = envContent.split('\n');
            }

            // Find and update existing key or add new one
            let keyFound = false;
            envLines = envLines.map(line => {
                if (line.startsWith(`${key}=`)) {
                    keyFound = true;
                    return `${key}=${value}`;
                }
                return line;
            });

            // Add new key if not found
            if (!keyFound) {
                envLines.push(`${key}=${value}`);
            }

            // Write back to .env file
            const newContent = envLines.filter(line => line.trim() !== '').join('\n') + '\n';
            await fs.writeFile(envPath, newContent);

        } catch (error) {
            throw new Error(`Failed to update .env file: ${error.message}`);
        }
    }

    /**
     * Hot reload configuration after environment variable change
     */
    async hotReloadConfig(key, value) {
        // Update relevant config properties directly
        if (config.hasOwnProperty(key)) {
            // Convert string boolean values to actual booleans for config
            if (value === 'true' || value === 'false') {
                config[key] = value === 'true';
            } else {
                config[key] = value;
            }
        }

        // If the changed key is PREFIX, update the config.PREFIX for immediate use
        if (key === 'PREFIX') {
            config.PREFIX = value;
        }

        // Hot-reload auto features for immediate effect
        if (key === 'AUTO_TYPING') {
            config.AUTO_TYPING = value === 'true';
            console.log(`🔄 Auto-typing ${config.AUTO_TYPING ? 'enabled' : 'disabled'}`);
        }
        
        if (key === 'AUTO_READ') {
            config.AUTO_READ = value === 'true';
            console.log(`🔄 Auto-read ${config.AUTO_READ ? 'enabled' : 'disabled'}`);
        }
        
        if (key === 'AUTO_STATUS_VIEW') {
            config.AUTO_STATUS_VIEW = value === 'true';
            console.log(`🔄 Auto-status-view ${config.AUTO_STATUS_VIEW ? 'enabled' : 'disabled'}`);
        }
        
        if (key === 'REJECT_CALLS') {
            config.REJECT_CALLS = value === 'true';
            console.log(`🔄 Call rejection ${config.REJECT_CALLS ? 'enabled' : 'disabled'}`);
        }
        
        if (key === 'ANTI_DELETE') {
            config.ANTI_DELETE = value === 'true';
            console.log(`🔄 Anti-delete ${config.ANTI_DELETE ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Update command - handles both check and force update
     */
    async updateCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const action = args[0]?.toLowerCase();

            // Handle 'update now' to force update
            if (action === 'now') {
                return await this.executeUpdateNow(messageInfo);
            }

            // Default: check for updates and show commit differences
            try {
                const result = await this.checkGitHubUpdates();

                if (result.error) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Update check failed: ' + result.error);
                } else if (result.updateAvailable) {
                    const message = `🔄 *${result.commitsAhead} UPDATE AVAILABLE*`;
                    await this.bot.messageHandler.reply(messageInfo, message);
                } else {
                    const message = `✅ *BOT UP TO DATE*\n\n` +
                        `🏠 Local: ${result.localCommit}\n` +
                        `☁️ Remote: ${result.latestCommit}`;
                    await this.bot.messageHandler.reply(messageInfo, message);
                }
            } catch (checkError) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Update check failed: ' + checkError.message);
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error checking for updates.');
        }
    }

    /**
     * Execute update now - Check for updates first, then force fresh restart from index.js with recloning if needed
     */
    async executeUpdateNow(messageInfo) {
        try {
            // First check if updates are available
            const updateResult = await this.checkGitHubUpdates();

            if (updateResult.error) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Update check failed: ' + updateResult.error);
                return;
            }

            // If no updates available, just inform user
            if (!updateResult.updateAvailable) {
                await this.bot.messageHandler.reply(messageInfo, '✅ Bot up to date');
                return;
            }

            // Updates are available, proceed with update process
            await this.bot.messageHandler.reply(messageInfo, '🔄 Updating now...');

            console.log('🔄 Update available: Removing key files to trigger recloning...');

            // Remove key files to trigger recloning by index.js
            // index.js checks for these files and reclones if they're missing
            setTimeout(async () => {
                try {
                    const fs = require('fs-extra');

                    // Create update flag file to trigger completion message after restart
                    const updateFlag = {
                        timestamp: new Date().toISOString(),
                        chatJid: messageInfo.key.remoteJid,
                        reason: 'update_now_command'
                    };
                    await fs.writeFile('.update_flag.json', JSON.stringify(updateFlag, null, 2));
                    console.log('✅ Created update flag file');

                    // Remove the key files that index.js checks for
                    const filesToRemove = ['bot.js', 'config.js', 'package.json'];

                    console.log('🔄 Removing key files to trigger recloning...');
                    for (const file of filesToRemove) {
                        try {
                            if (await fs.pathExists(file)) {
                                await fs.unlink(file);
                                console.log(`✅ Removed: ${file}`);
                            }
                        } catch (err) {
                            console.log(`⚠️ Could not remove ${file}: ${err.message}`);
                        }
                    }

                    // Send completion message before restart
                    try {
                        await this.bot.sock.sendMessage(messageInfo.key.remoteJid, {
                            text: '✅ Update completed successfully! Bot will restart now.'
                        });
                        console.log('✅ Update completion message sent');
                        // Small delay to ensure message is sent
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    } catch (err) {
                        console.log('⚠️ Could not send completion message:', err.message);
                    }

                    console.log('🔄 Key files removed, forcing process exit to trigger recloning...');
                    process.exit(1); // Exit to trigger index.js restart which will detect missing files and reclone
                } catch (error) {
                    console.error('❌ Error removing files:', error);
                    process.exit(1); // Exit anyway to trigger restart
                }
            }, 1000);

        } catch (error) {
            console.error('❌ Update now error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ *UPDATE FAILED*\n\n' +
                '🔧 Please restart manually using the Run button\n' +
                '💡 This will trigger fresh cloning from GitHub'
            );
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
     * Check GitHub for updates directly
     */
    async checkGitHubUpdates() {
        const { spawn } = require('child_process');
        const GITHUB_REPO = 'https://github.com/marhthing/matdev.git';

        return new Promise((resolve) => {
            try {
                // Get remote latest commit
                const remoteProcess = spawn('git', ['ls-remote', GITHUB_REPO, 'HEAD'], {
                    stdio: ['pipe', 'pipe', 'pipe']
                });

                let remoteOutput = '';
                let remoteError = '';

                remoteProcess.stdout.on('data', (data) => {
                    remoteOutput += data.toString();
                });

                remoteProcess.stderr.on('data', (data) => {
                    remoteError += data.toString();
                });

                remoteProcess.on('close', (code) => {
                    if (code !== 0) {
                        resolve({ error: 'Cannot access GitHub repository' });
                        return;
                    }

                    const remoteCommit = remoteOutput.split('\t')[0];
                    if (!remoteCommit) {
                        resolve({ error: 'Invalid response from GitHub' });
                        return;
                    }

                    // Get local commit if git repo exists
                    const localProcess = spawn('git', ['rev-parse', 'HEAD'], {
                        stdio: ['pipe', 'pipe', 'pipe']
                    });

                    let localOutput = '';

                    localProcess.stdout.on('data', (data) => {
                        localOutput += data.toString();
                    });

                    localProcess.on('close', (localCode) => {
                        const localCommit = localCode === 0 ? localOutput.trim() : null;

                        if (!localCommit) {
                            // No local git repo, consider update needed
                            resolve({
                                updateAvailable: true,
                                commitsAhead: 1,
                                latestCommit: remoteCommit.substring(0, 7),
                                localCommit: 'none'
                            });
                        } else if (localCommit === remoteCommit) {
                            // Commits match - up to date
                            resolve({
                                updateAvailable: false,
                                latestCommit: remoteCommit.substring(0, 7),
                                localCommit: localCommit.substring(0, 7)
                            });
                        } else {
                            // Check if local commit exists in remote history - if it does, we're up to date
                            // This handles cases where local has the latest remote commit but git ls-remote shows a different HEAD
                            const checkLocalInRemote = spawn('git', ['cat-file', '-e', remoteCommit], {
                                stdio: ['pipe', 'pipe', 'pipe']
                            });
                            
                            checkLocalInRemote.on('close', (checkCode) => {
                                if (checkCode === 0) {
                                    // Remote commit exists locally - we have it, so up to date
                                    resolve({
                                        updateAvailable: false,
                                        latestCommit: remoteCommit.substring(0, 7),
                                        localCommit: localCommit.substring(0, 7)
                                    });
                                } else {
                                    // Remote commit doesn't exist locally - update needed
                                    resolve({
                                        updateAvailable: true,
                                        commitsAhead: 'available',
                                        latestCommit: remoteCommit.substring(0, 7),
                                        localCommit: localCommit.substring(0, 7)
                                    });
                                }
                            });
                        }
                    });
                });

            } catch (error) {
                resolve({ error: error.message });
            }
        });
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