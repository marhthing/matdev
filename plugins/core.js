/**
 * MATDEV Core Plugin
 * Essential commands and functionality
 */

const config = require('../config');
const Utils = require('../lib/utils');

const utils = new Utils();

class CorePlugin {
    constructor() {
        this.name = 'core';
        this.description = 'Core bot functionality and commands';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        console.log('✅ Core plugin loaded');
    }

    /**
     * Register all core commands
     */
    registerCommands() {
        // Help command
        this.bot.messageHandler.registerCommand('help', this.helpCommand.bind(this), {
            description: 'Show available commands',
            usage: `${config.PREFIX}help [command]`,
            category: 'core',
            plugin: 'core',
            source: 'core.js'
        });

        // Ping command
        this.bot.messageHandler.registerCommand('ping', this.pingCommand.bind(this), {
            description: 'Check bot response time',
            usage: `${config.PREFIX}ping`,
            category: 'core',
            plugin: 'core',
            source: 'core.js'
        });



        // Menu command (enhanced system info menu)
        this.bot.messageHandler.registerCommand('menu', this.menuCommand.bind(this), {
            description: 'Display bot menu and information',
            usage: `${config.PREFIX}menu`,
            category: 'utility',
            plugin: 'core',
            source: 'core.js'
        });

        this.bot.messageHandler.registerCommand('time', this.timeCommand.bind(this), {
            description: 'Show current bot time in Lagos timezone',
            usage: `${config.PREFIX}time`,
            category: 'utility',
            plugin: 'core',
            source: 'core.js'
        });

        // JID command
        this.bot.messageHandler.registerCommand('jid', this.jidCommand.bind(this), {
            description: 'Get chat JID information',
            usage: `${config.PREFIX}jid`,
            category: 'core'
        });

        // Owner only commands
        this.bot.messageHandler.registerCommand('restart', this.restartCommand.bind(this), {
            description: 'Restart the bot',
            usage: `${config.PREFIX}restart`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('shutdown', this.shutdownCommand.bind(this), {
            description: 'Shutdown the bot',
            usage: `${config.PREFIX}shutdown`,
            category: 'admin',
            ownerOnly: true
        });

        // Update commands moved to system plugin



        // Permission management commands (owner only)
        this.bot.messageHandler.registerCommand('permissions', this.permissionsCommand.bind(this), {
            description: 'Manage user permissions (allow/disallow commands)',
            usage: `${config.PREFIX}permissions [allow|disallow] <jid> <cmd>`,
            category: 'admin',
            ownerOnly: true
        });

        // Permission aliases
        this.bot.messageHandler.registerCommand('pm', this.permissionsCommand.bind(this), {
            description: 'Manage user permissions (alias for permissions)',
            usage: `${config.PREFIX}pm [allow|disallow] <jid> <cmd>`,
            category: 'admin',
            ownerOnly: true
        });

        // Group LID registration command
        this.bot.messageHandler.registerCommand('rg', this.registerGroupLidCommand.bind(this), {
            description: 'Register your LID for this group (one-time only)',
            usage: `${config.PREFIX}rg`,
            category: 'group',
            groupOnly: true
        });

        // Group LID management commands (owner only)
        this.bot.messageHandler.registerCommand('clearlid', this.clearGroupLidCommand.bind(this), {
            description: 'Clear the registered group LID',
            usage: `${config.PREFIX}clearlid`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('lidinfo', this.groupLidInfoCommand.bind(this), {
            description: 'Show registered group LID information',
            usage: `${config.PREFIX}lidinfo`,
            category: 'admin',
            ownerOnly: true
        });

        // Bot reactions command
        this.bot.messageHandler.registerCommand('br', this.botReactionsCommand.bind(this), {
            description: 'Toggle bot auto-reactions on commands',
            usage: `${config.PREFIX}br [on|off]`,
            category: 'admin',
            ownerOnly: true
        });

        // Clear command
        this.bot.messageHandler.registerCommand('clear', this.clearCommand.bind(this), {
            description: 'Delete entire chat (like WhatsApp Delete Chat)',
            usage: `${config.PREFIX}clear`,
            category: 'utility',
            plugin: 'core',
            source: 'core.js'
        });

        // Stats command - manual status report
        this.bot.messageHandler.registerCommand('stats', this.statsCommand.bind(this), {
            description: 'Get bot statistics manually',
            usage: `${config.PREFIX}stats`,
            category: 'utility',
            ownerOnly: true,
            plugin: 'core',
            source: 'core.js'
        });


        // Sticker command binding commands (owner only)
        this.bot.messageHandler.registerCommand('setcmd', this.setStickerCommand.bind(this), {
            description: 'Bind a command to a sticker (reply to sticker)',
            usage: `${config.PREFIX}setcmd <command> (reply to sticker)`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('delcmd', this.deleteStickerCommand.bind(this), {
            description: 'Remove command binding from a sticker (reply to sticker)',
            usage: `${config.PREFIX}delcmd (reply to sticker)`,
            category: 'admin',
            ownerOnly: true
        });
    }

    /**
     * Help command handler
     */
    async helpCommand(messageInfo) {
        try {
            // console.log(`🔍 Help command executing for: ${messageInfo.chat_jid}`);
            // console.log(`🔍 Message info:`, {
            //     chat_jid: messageInfo.chat_jid,
            //     sender: messageInfo.sender,
            //     participant_jid: messageInfo.participant_jid,
            //     is_group: messageInfo.is_group
            // });
            const { args } = messageInfo;

            if (args.length > 0) {
                // Show specific command help
                const commandName = args[0].toLowerCase();
                const commands = this.bot.messageHandler.getCommands();
                const command = commands.find(cmd => cmd.name === commandName);

                if (command) {
                    const helpText = `*${command.name.toUpperCase()}*\n\n` +
                        `📝 *Description:* ${command.description}\n` +
                        `💡 *Usage:* ${command.usage}\n` +
                        `📂 *Category:* ${command.category}\n` +
                        `${command.ownerOnly ? '👑 *Owner Only*' : ''}\n` +
                        `${command.groupOnly ? '👥 *Group Only*' : ''}\n` +
                        `${command.privateOnly ? '💬 *Private Only*' : ''}`;

                    await this.bot.messageHandler.reply(messageInfo, helpText.trim());
                } else {
                    await this.bot.messageHandler.reply(messageInfo, `❌ Command "${commandName}" not found.`);
                }
            } else {
                // Show all commands grouped by category
                const commands = this.bot.messageHandler.getCommands();
                const categories = {};

                commands.forEach(cmd => {
                    if (!categories[cmd.category]) {
                        categories[cmd.category] = [];
                    }
                    categories[cmd.category].push(cmd);
                });

                let helpText = `*🤖 MATDEV COMMAND MENU*\n\n`;

                // Group commands by handler function to auto-detect aliases
                const handlerGroups = new Map();
                commands.forEach(cmd => {
                    const handlerKey = cmd.handler.toString();
                    if (!handlerGroups.has(handlerKey)) {
                        handlerGroups.set(handlerKey, []);
                    }
                    handlerGroups.get(handlerKey).push(cmd);
                });

                for (const [category, cmds] of Object.entries(categories)) {
                    helpText += `*${category.toUpperCase()}*\n`;

                    // Group commands with their auto-detected aliases
                    const processedCommands = new Set();

                    cmds.forEach(cmd => {
                        if (processedCommands.has(cmd.name)) return;

                        // Find all commands with the same handler (aliases)
                        const aliasGroup = handlerGroups.get(cmd.handler.toString());
                        const mainCommand = aliasGroup.find(c => !c.description.includes('alias for')) || aliasGroup[0];
                        const aliases = aliasGroup.filter(c => c !== mainCommand && cmds.includes(c)).map(c => c.name);

                        // Mark all commands in this group as processed
                        aliasGroup.forEach(c => processedCommands.add(c.name));

                        // Display command with auto-detected aliases
                        if (aliases.length > 0) {
                            helpText += `• ${config.PREFIX}${mainCommand.name} ~ ${aliases.map(a => config.PREFIX + a).join(' ~ ')} - ${mainCommand.description}\n`;
                        } else {
                            helpText += `• ${config.PREFIX}${mainCommand.name} - ${mainCommand.description}\n`;
                        }
                    });

                    helpText += '\n';
                }

                helpText += `_Total Commands: ${commands.length}_\n`;
                helpText += `_Type ${config.PREFIX}help <command> for detailed info_`;

                await this.bot.messageHandler.reply(messageInfo, helpText);
            }
        } catch (error) {
            console.error('❌ Help command error:', error);
            console.error('❌ Help command stack:', error.stack);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error displaying help.');
        }
    }

    /**
     * Ping command handler
     */
    async pingCommand(messageInfo) {
        const start = Date.now();

        try {
            // Send initial message
            const sentMessage = await this.bot.messageHandler.reply(messageInfo, `🏓 Pong! 0ms`);

            // Calculate actual latency after sending
            const latency = Date.now() - start;

            // Edit the message with actual latency
            if (sentMessage && sentMessage.key) {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🏓 Pong! ${latency}ms`,
                    edit: sentMessage.key
                });
            }

        } catch (error) {
            const errorLatency = Date.now() - start;
            this.bot.logger.error('Ping command error:', error);
            await this.bot.messageHandler.reply(messageInfo, `🏓 Pong! ${errorLatency}ms`);
        }
    }

    /**
     * Status command handler
     */
    async statusCommand(messageInfo) {
        try {
            const uptime = utils.formatUptime(Date.now() - this.bot.startTime);
            const memUsage = process.memoryUsage();
            const stats = this.bot.messageHandler.getStats();

            const statusText = `*🤖 MATDEV STATUS*\n\n` +
                `🟢 *Status:* Online\n` +
                `⏰ *Uptime:* ${uptime}\n` +
                `📨 *Messages Received:* ${utils.formatNumber(this.bot.messageStats.received)}\n` +
                `📤 *Messages Sent:* ${utils.formatNumber(this.bot.messageStats.sent)}\n` +
                `⚡ *Commands Executed:* ${utils.formatNumber(this.bot.messageStats.commands)}\n` +
                `🧠 *Memory Usage:* ${utils.formatFileSize(memUsage.heapUsed)}\n` +
                `📦 *Commands Loaded:* ${stats.commandsRegistered}\n` +
                `🛡️ *Security Status:* Active\n` +
                `🌐 *Platform:* ${config.PLATFORM}\n` +
                `⚙️ *Node Version:* ${process.version}`;

            await this.bot.messageHandler.reply(messageInfo, statusText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving status.');
        }
    }

    /**
     * Uptime command handler
     */
    async uptimeCommand(messageInfo) {
        try {
            const uptime = utils.formatUptime(Date.now() - this.bot.startTime);
            const systemUptime = utils.formatUptime(require('os').uptime() * 1000);

            const uptimeText = `*⏰ UPTIME INFORMATION*\n\n` +
                `🤖 *Bot Uptime:* ${uptime}\n` +
                `💻 *System Uptime:* ${systemUptime}\n` +
                `🕐 *Started At:* ${new Date(this.bot.startTime).toLocaleString()}\n` +
                `🔄 *Reconnections:* ${this.bot.reconnectAttempts}`;

            await this.bot.messageHandler.reply(messageInfo, uptimeText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving uptime.');
        }
    }

    /**
     * About command handler
     */
    async aboutCommand(messageInfo) {
        try {
            const aboutText = `*🚀 MATDEV WhatsApp Bot*\n\n` +
                `*Version:* 1.0.0\n` +
                `*Platform:* Node.js + Baileys\n` +
                `*Features:* High-Performance, Secure, Reliable\n\n` +
                `*🎯 Key Features:*\n` +
                `• Advanced message processing\n` +
                `• Intelligent anti-ban protection\n` +
                `• Dynamic plugin system\n` +
                `• High-performance caching\n` +
                `• Comprehensive security features\n` +
                `• Auto session management\n\n` +
                `*🔧 Technical Details:*\n` +
                `• Built with baileys\n` +
                `• In-memory database for speed\n` +
                `• Advanced error recovery\n` +
                `• Smart rate limiting\n` +
                `• Discreet operation mode\n\n` +
                `_Designed for superior performance and reliability._`;

            await this.bot.messageHandler.reply(messageInfo, aboutText);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error displaying about information.');
        }
    }

    /**
     * JID command handler
     */
    async jidCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, messageInfo.chat_jid);
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving JID information.');
        }
    }

    /**
     * Time command - Show current bot time
     */
    async timeCommand(messageInfo) {
        const moment = require('moment-timezone');
        const config = require('../config');

        const lagosTime = moment().tz(config.TIMEZONE);
        const utcTime = moment().utc();

        const timeInfo = `🇳🇬 *Lagos Time:* ${lagosTime.format('DD/MM/YYYY HH:mm:ss')}`;

        await this.bot.messageHandler.reply(messageInfo, timeInfo);
    }

    /**
     * Enhanced menu command with live system information
     */
    async menuCommand(messageInfo) {
        try {
            const os = require('os');
            const process = require('process');
            const utils = require('../lib/utils');
            const utilsInstance = new utils();
            const moment = require('moment-timezone'); // Added for timezone handling

            // Get live system information
            const systemInfo = utilsInstance.getSystemInfo();
            const memUsage = process.memoryUsage();
            const botUptime = utilsInstance.formatUptime(Date.now() - this.bot.startTime);

            // Get current time and date using config timezone
            const now = new Date();
            const timeOptions = {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            };
            const dateOptions = {
                weekday: 'long',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            };

            // Use moment-timezone for accurate time display based on config.TIMEZONE
            const currentTime = moment().tz(config.TIMEZONE).format('hh:mm:ss A');
            const currentDay = moment().tz(config.TIMEZONE).format('dddd');
            const currentDate = moment().tz(config.TIMEZONE).format('MM/DD/YYYY');

            // Get platform info
            const platformName = systemInfo.platform === 'linux' ? 'Linux' :
                               systemInfo.platform === 'win32' ? 'Windows' :
                               systemInfo.platform === 'darwin' ? 'macOS' : systemInfo.platform;

            // Calculate memory usage
            const totalMemMB = Math.round(systemInfo.memory.total / 1024 / 1024);
            const usedMemMB = Math.round(memUsage.heapUsed / 1024 / 1024);

            // Get bot user name (from WhatsApp profile or bot name)
            const botName = this.bot.sock?.user?.name || config.BOT_NAME;

            // Get all commands and organize by category with intelligent alias detection
            const commands = this.bot.messageHandler.getCommands();
            const categories = {};
            
            // Group commands by handler function to detect aliases
            const handlerGroups = new Map();
            commands.forEach(cmd => {
                const handlerKey = cmd.handler.toString();
                if (!handlerGroups.has(handlerKey)) {
                    handlerGroups.set(handlerKey, []);
                }
                handlerGroups.get(handlerKey).push(cmd);
            });
            
            const processedCommands = new Set();
            
            commands.forEach(cmd => {
                if (processedCommands.has(cmd.name)) return;
                
                const category = cmd.category || 'utility';
                
                if (!categories[category]) {
                    categories[category] = [];
                }
                
                // Find all commands that share the same handler (aliases)
                const aliasGroup = handlerGroups.get(cmd.handler.toString());
                
                // Filter to only include commands in the same category
                const categoryAliases = aliasGroup.filter(c => 
                    c.category === cmd.category && c.name !== cmd.name
                );
                
                // Use the shortest command name as primary, others as aliases
                const allInCategory = [cmd, ...categoryAliases];
                const primaryCmd = allInCategory.reduce((shortest, current) => 
                    current.name.length < shortest.name.length ? current : shortest
                );
                
                const aliases = allInCategory
                    .filter(c => c.name !== primaryCmd.name)
                    .map(c => c.name.toUpperCase());
                
                // Only add if this is the primary command
                if (cmd.name === primaryCmd.name) {
                    categories[category].push({
                        name: primaryCmd.name.toUpperCase(),
                        aliases: aliases
                    });
                }
                
                // Mark all commands in this alias group as processed
                allInCategory.forEach(c => processedCommands.add(c.name));
            });

            // Create modern menu design with better typography
            let menuText = `\`\`\`\n`;
            menuText += `┌─────────────────────────────────────┐\n`;
            menuText += `│    𝗠𝗔𝗧𝗗𝗘𝗩 • 𝗔𝗱𝘃𝗮𝗻𝗰𝗲𝗱 𝗔𝗜 𝗕𝗼𝘁    │\n`;
            menuText += `├─────────────────────────────────────┤\n`;
            menuText += `│ ⚡ Prefix      │ ${config.PREFIX.padEnd(21)} │\n`;
            menuText += `│ 👤 Owner       │ ${botName.padEnd(21)} │\n`;
            menuText += `│ 🕐 Time        │ ${currentTime.padEnd(21)} │\n`;
            menuText += `│ 📅 Day         │ ${currentDay.padEnd(21)} │\n`;
            menuText += `│ 📆 Date        │ ${currentDate.padEnd(21)} │\n`;
            menuText += `│ 🔧 Version     │ 1.0.0                 │\n`;
            menuText += `│ 🧩 Commands    │ ${commands.length.toString().padEnd(21)} │\n`;
            menuText += `│ 🧠 Memory      │ ${(usedMemMB + '/' + totalMemMB + 'MB').padEnd(21)} │\n`;
            menuText += `│ ⏰ Uptime      │ ${botUptime.padEnd(21)} │\n`;
            menuText += `│ 💻 Platform    │ ${(platformName + ' (' + systemInfo.arch + ')').padEnd(21)} │\n`;
            menuText += `└─────────────────────────────────────┘\n`;
            menuText += `\`\`\`\n`;

            // Add command categories in a list format for better readability
            const categoryIcons = {
                'core': '🔥',
                'admin': '👑',
                'media': '📸',
                'system': '⚙️',
                'privacy': '🛡️',
                'status': '📱',
                'utility': '🔧',
                'automation': '🤖',
                'group': '👥',
                'ai': '🧠',
                'fun': '🎮',
                'time': '🕐',
                'download': '⬇️'
            };

            for (const [category, cmds] of Object.entries(categories)) {
                const icon = categoryIcons[category] || '📋';
                const categoryName = category.toUpperCase();
                
                menuText += `\n${icon} ═══ ${categoryName} ═══ ${icon}\n`;
                
                cmds.forEach(commandEntry => {
                    if (commandEntry.aliases && commandEntry.aliases.length > 0) {
                        menuText += `▸ ${commandEntry.name} (${commandEntry.aliases.join(', ')})\n`;
                    } else {
                        menuText += `▸ ${commandEntry.name}\n`;
                    }
                });
            }

            menuText += `\`\`\`\n`;
            menuText += `┌─────────────────────────────────────┐\n`;
            menuText += `│  Type .help <command> for details   │\n`;
            menuText += `│                                     │\n`;
            menuText += `│    𝗣𝗼𝘄𝗲𝗿𝗲𝗱 𝗯𝘆 𝗠𝗔𝗧𝗗𝗘𝗩 ⚡        │\n`;
            menuText += `└─────────────────────────────────────┘\n`;
            menuText += `\`\`\``;

            await this.bot.messageHandler.reply(messageInfo, menuText);

        } catch (error) {
            console.error('Error in menu command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Failed to generate menu');
        }
    }

    /**
     * Restart command handler (owner only)
     */
    async restartCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🔄 Restarting MATDEV bot...');

            // Store restart info for completion message
            const restartInfo = {
                chatJid: messageInfo.chat_jid,
                timestamp: Date.now()
            };
            require('fs-extra').writeFileSync('.restart_info.json', JSON.stringify(restartInfo));

            // Use manager restart if available
            if (global.managerCommands && global.managerCommands.restart) {
                setTimeout(() => {
                    global.managerCommands.restart();
                }, 1000);
            } else {
                // Fallback to direct exit
                setTimeout(() => {
                    process.exit(0);
                }, 2000);
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during restart.');
        }
    }

    /**
     * Shutdown command handler (owner only)
     */
    async shutdownCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🛑 Shutting down MATDEV bot...');

            // Use manager shutdown if available
            if (global.managerCommands && global.managerCommands.shutdown) {
                setTimeout(() => {
                    global.managerCommands.shutdown();
                }, 1000);
            } else {
                // Fallback to direct shutdown
                setTimeout(() => {
                    this.bot.shutdown();
                }, 2000);
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during shutdown.');
        }
    }

    /**
     * Update command handler (owner only)
     */
    async updateCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🔍 Checking for updates...');

            if (global.managerCommands && global.managerCommands.checkUpdates) {
                const result = await global.managerCommands.checkUpdates();

                if (result.error) {
                    await this.bot.messageHandler.reply(messageInfo, `❌ Update check failed: ${result.error}`);
                } else if (result.updateAvailable) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `🔄 ${result.message}\n\nUse ${config.PREFIX}updatenow to update immediately.`);
                } else {
                    await this.bot.messageHandler.reply(messageInfo, `✅ ${result.message}`);
                }
            } else {
                // Fallback update info
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
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error checking for updates.');
        }
    }

    /**
     * Update now command handler (owner only)
     */
    async updateNowCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '⚠️ Force updating from GitHub...\n\n🔄 Bot will restart with latest code shortly.');

            if (global.managerCommands && global.managerCommands.updateNow) {
                setTimeout(() => {
                    global.managerCommands.updateNow();
                }, 1000);
            } else {
                await this.bot.messageHandler.reply(messageInfo, '❌ Manager commands not available. Please restart manually.');
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during force update.');
        }
    }

    /**
     * Eval command handler (owner only)
     */
    async evalCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide code to execute.');
                return;
            }

            const code = args.join(' ');

            // Security warning
            if (code.includes('process.exit') || code.includes('require(')) {
                await this.bot.messageHandler.reply(messageInfo, '⚠️ Potentially dangerous code detected.');
                return;
            }

            try {
                let result = eval(code);

                if (typeof result === 'object') {
                    result = JSON.stringify(result, null, 2);
                }

                const resultText = `*📝 EVAL RESULT*\n\n` +
                    `*Code:* \`${code}\`\n\n` +
                    `*Result:*\n\`\`\`${result}\`\`\``;

                await this.bot.messageHandler.reply(messageInfo, resultText);

            } catch (evalError) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ *Execution Error:*\n\`\`\`${evalError.message}\`\`\``);
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during code execution.');
        }
    }

    /**
     * Broadcast command handler (owner only)
     */
    async broadcastCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide a message to broadcast.');
                return;
            }

            const message = args.join(' ');

            await this.bot.messageHandler.reply(messageInfo,
                '📢 Broadcasting message... This may take a while.');

            // This is a simplified broadcast - in production you'd want to track chats
            // For now, we'll just confirm the broadcast was initiated
            const broadcastText = `📢 *BROADCAST MESSAGE*\n\n${message}\n\n_This is an automated message from MATDEV bot._`;

            // In a real implementation, you would:
            // 1. Get all chat IDs from your database/cache
            // 2. Loop through them with rate limiting
            // 3. Track success/failure rates
            // 4. Provide detailed statistics

            await this.bot.messageHandler.reply(messageInfo,
                '✅ Broadcast initiated. Note: This is a basic implementation.');

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during broadcast.');
        }
    }

    

    /**
     * Permissions command handler (handles subcommands: allow, disallow, or view)
     */
    async permissionsCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length === 0) {
                // Show all permissions
                const allPermissions = this.bot.database.getAllPermissions();

                if (Object.keys(allPermissions).length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '📋 No permissions set.');
                    return;
                }

                let permissionsText = '';

                for (const [jid, commands] of Object.entries(allPermissions)) {
                    commands.forEach(cmd => {
                        permissionsText += `• .${cmd}\n`;
                    });
                }

                await this.bot.messageHandler.reply(messageInfo, permissionsText.trim());
                return;
            }

            const subCommand = args[0].toLowerCase();

            if (subCommand === 'allow') {
                // Smart JID detection for .pm allow <command>
                if (args.length === 2) {
                    const command = args[1].replace('.', '').toLowerCase();
                    let targetJid = null;

                    // Check if this is a private chat
                    if (!messageInfo.is_group) {
                        // Use the chat JID (the person we're talking to)
                        targetJid = messageInfo.chat_jid;
                    } else {
                        // This is a group - check if message is replying to someone
                        const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                        if (quotedMessage) {
                            // Get the participant JID from quoted message
                            const quotedParticipant = messageInfo.message?.extendedTextMessage?.contextInfo?.participant;
                            if (quotedParticipant) {
                                targetJid = quotedParticipant;
                            }
                        }

                        if (!targetJid) {
                            await this.bot.messageHandler.reply(messageInfo,
                                `❌ In groups, reply to a message to give permissions to that user.\n\n` +
                                `Usage: Reply to someone's message, then use \`${config.PREFIX}pm allow ${command}\``);
                            return;
                        }
                    }

                    const success = await this.bot.database.addPermission(targetJid, command);

                    if (success) {
                        const displayJid = targetJid.split('@')[0];
                        const contextText = messageInfo.is_group ? ' (from quoted message)' : ' (from this chat)';
                        await this.bot.messageHandler.reply(messageInfo,
                            `✅ User ${displayJid}${contextText} can now use .${command}`);
                    } else {
                        await this.bot.messageHandler.reply(messageInfo,
                            '❌ Failed to add permission. User may already have this permission.');
                    }
                    return;
                }

                // Legacy method: .pm allow <jid> <cmd>
                if (args.length < 3) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `❌ Usage: \n` +
                        `• \`${config.PREFIX}pm allow <command>\` - Give permission to current chat or quoted user\n` +
                        `• \`${config.PREFIX}pm allow <jid> <command>\` - Give permission to specific user`);
                    return;
                }

                let jid = args[1];
                const command = args[2].replace('.', '').toLowerCase();

                // Handle phone numbers without @ symbol
                if (!jid.includes('@')) {
                    jid = `${jid}@s.whatsapp.net`;
                }

                const success = await this.bot.database.addPermission(jid, command);

                if (success) {
                    const displayJid = jid.split('@')[0];
                    await this.bot.messageHandler.reply(messageInfo,
                        `✅ User ${displayJid} can now use .${command}`);
                } else {
                    await this.bot.messageHandler.reply(messageInfo,
                        '❌ Failed to add permission. User may already have this permission.');
                }

            } else if (subCommand === 'disallow') {
                // Smart JID detection for .pm disallow <command>
                if (args.length === 2) {
                    const command = args[1].replace('.', '').toLowerCase();
                    let targetJid = null;

                    // Check if this is a private chat
                    if (!messageInfo.is_group) {
                        // Use the chat JID (the person we're talking to)
                        targetJid = messageInfo.chat_jid;
                    } else {
                        // This is a group - check if message is replying to someone
                        const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                        if (quotedMessage) {
                            // Get the participant JID from quoted message
                            const quotedParticipant = messageInfo.message?.extendedTextMessage?.contextInfo?.participant;
                            if (quotedParticipant) {
                                targetJid = quotedParticipant;
                            }
                        }

                        if (!targetJid) {
                            await this.bot.messageHandler.reply(messageInfo,
                                `❌ In groups, reply to a message to remove permissions from that user.\n\n` +
                                `Usage: Reply to someone's message, then use \`${config.PREFIX}pm disallow ${command}\``);
                            return;
                        }
                    }

                    const success = await this.bot.database.removePermission(targetJid, command);

                    if (success) {
                        const displayJid = targetJid.split('@')[0];
                        const contextText = messageInfo.is_group ? ' (from quoted message)' : ' (from this chat)';
                        await this.bot.messageHandler.reply(messageInfo,
                            `✅ Removed .${command} permission from ${displayJid}${contextText}`);
                    } else {
                        await this.bot.messageHandler.reply(messageInfo,
                            '❌ Failed to remove permission. User may not have this permission.');
                    }
                    return;
                }

                // Legacy method: .pm disallow <jid> <cmd>
                if (args.length < 3) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `❌ Usage: \n` +
                        `• \`${config.PREFIX}pm disallow <command>\` - Remove permission from current chat or quoted user\n` +
                        `• \`${config.PREFIX}pm disallow <jid> <command>\` - Remove permission from specific user`);
                    return;
                }

                let jid = args[1];
                const command = args[2].replace('.', '').toLowerCase();

                // Handle phone numbers without @ symbol
                if (!jid.includes('@')) {
                    jid = `${jid}@s.whatsapp.net`;
                }

                const success = await this.bot.database.removePermission(jid, command);

                if (success) {
                    const displayJid = jid.split('@')[0];
                    await this.bot.messageHandler.reply(messageInfo,
                        `✅ Removed .${command} permission from ${displayJid}`);
                } else {
                    await this.bot.messageHandler.reply(messageInfo,
                        '❌ Failed to remove permission. User may not have this permission.');
                }

            } else {
                // Show permissions for specific user: .permissions <jid>
                let jid = args[0];

                // Handle phone numbers without @ symbol
                if (!jid.includes('@')) {
                    jid = `${jid}@s.whatsapp.net`;
                }

                const userPermissions = this.bot.database.getUserPermissions(jid);
                const displayJid = jid.split('@')[0];

                if (userPermissions.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `📋 User ${displayJid} has no permissions.`);
                } else {
                    let permissionsText = `*📋 PERMISSIONS FOR ${displayJid}*\n\n`;
                    userPermissions.forEach(cmd => {
                        permissionsText += `• .${cmd}\n`;
                    });

                    await this.bot.messageHandler.reply(messageInfo, permissionsText.trim());
                }
            }

        } catch (error) {
            console.error('Permissions command error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error managing permissions.');
        }
    }

    /**
     * Register Group LID command handler (.rg)
     * Only works in groups and only when no group LID is registered yet
     */
    async registerGroupLidCommand(messageInfo) {
        try {
            // Verify this is a group
            if (!messageInfo.is_group) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ This command only works in groups.');
                return;
            }

            // Check if a group LID is already registered
            if (this.bot.database.isGroupLidRegistered()) {
                // Silent - LID already registered, do nothing
                return;
            }

            // Extract the sender's LID from the message
            const message = messageInfo.key ? { key: messageInfo.key } : null;
            if (!message) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Unable to extract message information.');
                return;
            }

            // Look for LID information in the message key
            let senderLid = null;

            // Check for senderLid in the original message (multiple possible locations)
            if (messageInfo.key && messageInfo.key.senderLid) {
                senderLid = messageInfo.key.senderLid;
            } else if (messageInfo.key && messageInfo.key.participantLid) {
                senderLid = messageInfo.key.participantLid;
            } else if (messageInfo.participant_jid && messageInfo.participant_jid.includes('@lid')) {
                // If participant_jid already contains LID, use it directly
                senderLid = messageInfo.participant_jid;
            }

            // Log what we found for debugging
            // console.log(`🔍 LID extraction attempt:`, {
            //     messageKey: messageInfo.key,
            //     participantJid: messageInfo.participant_jid,
            //     extractedLid: senderLid
            // });

            if (!senderLid) {
                // Silent - no LID found, do nothing
                return;
            }

            // Verify the LID format
            if (!senderLid.includes('@lid')) {
                // Silent - invalid LID format, do nothing
                return;
            }

            // Register the group LID
            const result = await this.bot.database.registerGroupLid(senderLid, messageInfo.participant_jid);

            if (result.success) {
                // Silent - LID registered successfully, do nothing
                return;
            } else {
                // Silent - registration failed, do nothing
                return;
            }

        } catch (error) {
            console.error('Register Group LID command error:', error);
            await this.bot.messageHandler.reply(messageInfo,
                '❌ An error occurred while registering the group LID.');
        }
    }

    /**
     * Clear Group LID command handler (.clearlid) - Owner only
     */
    async clearGroupLidCommand(messageInfo) {
        try {
            const result = await this.bot.database.clearGroupLid();

            if (result.success) {
                await this.bot.messageHandler.reply(messageInfo,
                    `✅ *Group LID Cleared*\n\n` +
                    `🗑️ *Previous LID:* ${result.previousLid}\n` +
                    `📅 *Cleared:* ${new Date().toLocaleString()}\n\n` +
                    `_The .rg command is now available for registration again._`);
            } else {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ *Clear Failed*\n\n${result.message}`);
            }

        } catch (error) {
            console.error('Clear Group LID command error:', error);
            await this.bot.messageHandler.reply(messageInfo,
                '❌ An error occurred while clearing the group LID.');
        }
    }

    /**
     * Group LID Info command handler (.lidinfo) - Owner only
     */
    async groupLidInfoCommand(messageInfo) {
        try {
            if (!this.bot.database.isGroupLidRegistered()) {
                await this.bot.messageHandler.reply(messageInfo,
                    `📋 *Group LID Status*\n\n` +
                    `❌ *Status:* No group LID registered\n` +
                    `💡 *Info:* Use .rg in a group to register a LID\n\n` +
                    `_Only users with WhatsApp Business accounts can register._`);
                return;
            }

            const lidData = this.bot.database.getGroupLidData();
            const registeredAt = new Date(lidData.registeredAt).toLocaleString();
            const registeredBy = lidData.registeredBy.split('@')[0];

            await this.bot.messageHandler.reply(messageInfo,
                `📋 *Group LID Information*\n\n` +
                `✅ *Status:* Registered\n` +
                `🆔 *LID:* ${lidData.lid}\n` +
                `👤 *Registered By:* ${registeredBy}\n` +
                `📅 *Date:* ${registeredAt}\n\n` +
                `*Management:*\n` +
                `• Use \`.clearlid\` to clear registration\n` +
                `• Use \`.rg\` (in groups) to register new LID after clearing\n\n` +
                `_LID registration is one-time only until cleared._`);

        } catch (error) {
            console.error('Group LID Info command error:', error);
            await this.bot.messageHandler.reply(messageInfo,
                '❌ An error occurred while retrieving group LID information.');
        }
    }

    /**
     * Bot reactions command handler
     */
    async botReactionsCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            const status = args[0]?.toLowerCase();
            const config = require('../config');

            if (status === 'on') {
                config.BOT_REACTIONS = true;
                // Persist to .env file
                if (this.bot.plugins && this.bot.plugins.system && this.bot.plugins.system.setEnvValue) {
                    await this.bot.plugins.system.setEnvValue('BOT_REACTIONS', 'true');
                }
                await this.bot.messageHandler.reply(messageInfo, '✅ Bot auto-reactions enabled (persistent)');
            } else if (status === 'off') {
                config.BOT_REACTIONS = false;
                // Persist to .env file
                if (this.bot.plugins && this.bot.plugins.system && this.bot.plugins.system.setEnvValue) {
                    await this.bot.plugins.system.setEnvValue('BOT_REACTIONS', 'false');
                }
            } else if (!status) {
                // No argument provided - show status
                const currentStatus = config.BOT_REACTIONS ? 'ON' : 'OFF';
                await this.bot.messageHandler.reply(messageInfo,
                    `🤖 *Bot Auto-Reactions Status:* ${currentStatus}`);
            } else {
                // Invalid argument provided - silently ignore
                return;
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling bot reactions.');
        }
    }

    /**
     * Manual stats command handler (owner only)
     */
    async statsCommand(messageInfo) {
        try {
            const uptime = utils.formatUptime(Date.now() - this.bot.startTime);
            const memUsage = process.memoryUsage();

            // Access security manager from the bot's message handler
            const securityStats = this.bot.messageHandler.security ?
                this.bot.messageHandler.security.getSecurityStats() :
                { securityEvents: 0 };

            const report = `📊 *MATDEV Status Report*\n\n` +
                `⏱️ Uptime: ${uptime}\n` +
                `📨 Messages Received: ${this.bot.messageStats.received}\n` +
                `📤 Messages Sent: ${this.bot.messageStats.sent}\n` +
                `⚡ Commands Executed: ${this.bot.messageStats.commands}\n` +
                `🧠 Memory Usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB\n` +
                `🔒 Security Events: ${securityStats.securityEvents}\n` +
                `🏃‍♂️ Status: Running optimally`;

            await this.bot.messageHandler.reply(messageInfo, report);
        } catch (error) {
            console.error('❌ Stats command error:', error);
            console.error('❌ Stats command stack:', error.stack);
            await this.bot.messageHandler.reply(messageInfo, `❌ Error retrieving bot statistics: ${error.message}`);
        }
    }

    /**
     * Set sticker command binding
     */
    async setStickerCommand(messageInfo) {
        try {
            const { args } = messageInfo;

            if (args.length === 0) {
                console.log('❌ No command specified for sticker binding');
                return;
            }

            const commandName = args[0].toLowerCase();

            // Check if the command exists
            const commands = this.bot.messageHandler.getCommands();
            const command = commands.find(cmd => cmd.name === commandName);

            if (!command) {
                console.log(`❌ Command "${commandName}" not found`);
                return;
            }

            // Check if this is a reply to a sticker
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quotedMessage || !quotedMessage.stickerMessage) {
                console.log('❌ Please reply to a sticker when using .setcmd');
                return;
            }

            // Get multiple sticker identifiers for robust matching
            const stickerData = quotedMessage.stickerMessage;
            const stickerIdentifiers = this.getStickerIdentifiers(stickerData);

            if (stickerIdentifiers.length === 0) {
                console.log('❌ Could not identify sticker');
                return;
            }

            // Store sticker command binding with all identifiers
            const stickerCommands = this.bot.database.getData('stickerCommands') || {};

            // Store the binding using all possible identifiers
            stickerIdentifiers.forEach(identifier => {
                stickerCommands[identifier] = {
                    command: commandName,
                    boundAt: Date.now(),
                    boundBy: messageInfo.sender,
                    identifiers: stickerIdentifiers // Store all identifiers for this sticker
                };
            });

            this.bot.database.setData('stickerCommands', stickerCommands);

            console.log(`✅ Sticker bound to command: ${commandName} (${stickerIdentifiers.length} identifiers stored)`);

        } catch (error) {
            console.error(`Error in set sticker command: ${error.message}`);
        }
    }

    /**
     * Delete sticker command binding
     */
    async deleteStickerCommand(messageInfo) {
        try {
            // Check if this is a reply to a sticker
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage;

            if (!quotedMessage || !quotedMessage.stickerMessage) {
                console.log('❌ Please reply to a sticker when using .delcmd');
                return;
            }

            // Get multiple sticker identifiers for robust matching
            const stickerData = quotedMessage.stickerMessage;
            const stickerIdentifiers = this.getStickerIdentifiers(stickerData);

            if (stickerIdentifiers.length === 0) {
                console.log('❌ Could not identify sticker');
                return;
            }

            // Remove sticker command binding using any matching identifier
            const stickerCommands = this.bot.database.getData('stickerCommands') || {};
            let removedCommand = null;
            let identifiersRemoved = 0;

            // Check all identifiers and remove any matches
            stickerIdentifiers.forEach(identifier => {
                if (stickerCommands[identifier]) {
                    if (!removedCommand) {
                        removedCommand = stickerCommands[identifier].command;
                    }
                    delete stickerCommands[identifier];
                    identifiersRemoved++;
                }
            });

            if (removedCommand) {
                this.bot.database.setData('stickerCommands', stickerCommands);
                console.log(`✅ Removed command binding: ${removedCommand} (${identifiersRemoved} identifiers removed)`);
            } else {
                console.log('❌ This sticker has no command binding');
            }

        } catch (error) {
            console.error(`Error in delete sticker command: ${error.message}`);
        }
    }

    /**
     * Generate multiple sticker identifiers for robust matching
     */
    getStickerIdentifiers(stickerData) {
        const identifiers = [];

        try {
            // Method 1: File SHA256 hash (most reliable when available)
            if (stickerData.fileSha256) {
                const sha256Hash = Buffer.from(stickerData.fileSha256).toString('hex');
                identifiers.push(`sha256:${sha256Hash}`);
            }

            // Method 2: Direct URL (when available)
            if (stickerData.url) {
                identifiers.push(`url:${stickerData.url}`);
            }

            // Method 3: Media key hash (another reliable identifier)
            if (stickerData.mediaKey) {
                const mediaKeyHash = Buffer.from(stickerData.mediaKey).toString('hex');
                identifiers.push(`mediakey:${mediaKeyHash}`);
            }

            // Method 4: File size + mime type combination (less reliable but useful)
            if (stickerData.fileLength && stickerData.mimetype) {
                identifiers.push(`size-mime:${stickerData.fileLength}-${stickerData.mimetype}`);
            }

            // Method 5: Sticker pack info (if available)
            if (stickerData.packname && stickerData.author) {
                identifiers.push(`pack:${stickerData.packname}-${stickerData.author}`);
            }

            console.log(`🔍 Generated ${identifiers.length} sticker identifiers:`, identifiers);

        } catch (error) {
            console.error('Error generating sticker identifiers:', error);
        }

        return identifiers;
    }

    /**
     * Clear chat using best method for chat type (2025 approach)
     */
    async clearCommand(messageInfo) {
        try {
            const chatJid = messageInfo.chat_jid;
            const isGroup = chatJid.includes('@g.us');

            if (isGroup) {
                // For GROUPS: Use message flooding method (works 100%)
                await this.clearGroupChat(messageInfo);
            } else {
                // For PRIVATE CHATS: Try chat deletion first, fallback to flooding
                await this.clearPrivateChat(messageInfo);
            }

        } catch (error) {
            console.error('Error in clear command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error clearing chat.');
        }
    }

    /**
     * Clear private chat by attempting deletion
     */
    async clearPrivateChat(messageInfo) {
        const chatJid = messageInfo.chat_jid;

        try {
            // Get the last message for deletion method
            const lastMessage = await this.getLastMessageForChat(chatJid);

            if (lastMessage) {
                // Try to delete entire private chat
                await this.bot.sock.chatModify({
                    delete: true,
                    lastMessages: [{
                        key: lastMessage.key,
                        messageTimestamp: lastMessage.messageTimestamp || Date.now()
                    }]
                }, chatJid);

                console.log(`✅ Private chat deleted for ${chatJid}`);
                return;
            }
        } catch (deleteError) {
            // Fail silently - no error message to user
            console.log('Private chat deletion failed, using fallback method');
        }

        // Fallback to message flooding for private chats too
        await this.clearGroupChat(messageInfo);
    }

    /**
     * Clear group chat using message flooding method
     */
    async clearGroupChat(messageInfo) {
        const chatJid = messageInfo.chat_jid;

        // Send clearing indicator
        const clearingMsg = await this.bot.messageHandler.reply(messageInfo, '🧹 Clearing chat...');

        // Use invisible characters and spaces to push chat up
        const invisibleChars = [
            '⠀', // Braille space
            '​', // Zero-width space
            '⠀⠀⠀⠀⠀', // Multiple braille spaces
            '​​​​​', // Multiple zero-width spaces
            ' ', // Regular space
        ];

        try {
            // Send 25 messages with different invisible characters
            for (let i = 0; i < 25; i++) {
                const char = invisibleChars[i % invisibleChars.length];
                await this.bot.sock.sendMessage(chatJid, {
                    text: char
                });

                // Small delay between messages to avoid spam detection
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            // Send completion message
            await this.bot.sock.sendMessage(chatJid, {
                text: '✅ Chat area cleared!',
                edit: clearingMsg.key
            });

            console.log(`✅ Group chat cleared using flooding method for ${chatJid}`);

        } catch (error) {
            // Fail silently - no error message to user
            console.error('Group clearing failed:', error);
            try {
                await this.bot.sock.sendMessage(chatJid, {
                    text: '✅ Chat area cleared!',
                    edit: clearingMsg.key
                });
            } catch (editError) {
                // Even editing failed, completely silent
            }
        }
    }

    /**
     * Get the last message from a chat for deletion purposes
     */
    async getLastMessageForChat(chatJid) {
        try {
            // Get messages from our storage
            const allMessages = Array.from(this.bot.database.messages.values());

            // Find the most recent message in this chat
            const chatMessages = allMessages
                .filter(msg => msg.chat_jid === chatJid)
                .sort((a, b) => b.timestamp - a.timestamp);

            if (chatMessages.length === 0) {
                return null;
            }

            const lastMsg = chatMessages[0];

            // Return in the format needed for chatModify
            return {
                key: {
                    id: lastMsg.id,
                    fromMe: lastMsg.from_me,
                    remoteJid: chatJid
                },
                messageTimestamp: lastMsg.timestamp
            };

        } catch (error) {
            console.error('Error getting last message:', error);
            return null;
        }
    }


}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new CorePlugin();
        await plugin.init(bot);
    }
};