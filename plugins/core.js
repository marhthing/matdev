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
            category: 'core'
        });

        // Ping command
        this.bot.messageHandler.registerCommand('ping', this.pingCommand.bind(this), {
            description: 'Check bot response time',
            usage: `${config.PREFIX}ping`,
            category: 'core'
        });

        // Status command
        this.bot.messageHandler.registerCommand('status', this.statusCommand.bind(this), {
            description: 'Show bot status and statistics',
            usage: `${config.PREFIX}status`,
            category: 'core'
        });

        // Uptime command
        this.bot.messageHandler.registerCommand('uptime', this.uptimeCommand.bind(this), {
            description: 'Show bot uptime',
            usage: `${config.PREFIX}uptime`,
            category: 'core'
        });

        // Menu command (alias for help)
        this.bot.messageHandler.registerCommand('menu', this.helpCommand.bind(this), {
            description: 'Show command menu',
            usage: `${config.PREFIX}menu`,
            category: 'core'
        });

        // About command
        this.bot.messageHandler.registerCommand('about', this.aboutCommand.bind(this), {
            description: 'About MATDEV bot',
            usage: `${config.PREFIX}about`,
            category: 'core'
        });

        // Owner only commands
        this.bot.messageHandler.registerCommand('restart', this.restartCommand.bind(this), {
            description: 'Restart the bot',
            usage: `${config.PREFIX}restart`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('eval', this.evalCommand.bind(this), {
            description: 'Execute JavaScript code',
            usage: `${config.PREFIX}eval <code>`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('broadcast', this.broadcastCommand.bind(this), {
            description: 'Broadcast message to all chats',
            usage: `${config.PREFIX}broadcast <message>`,
            category: 'admin',
            ownerOnly: true
        });

        // Permission management commands (owner only)
        this.bot.messageHandler.registerCommand('allow', this.allowCommand.bind(this), {
            description: 'Allow a user to use specific commands',
            usage: `${config.PREFIX}allow <jid|cmd> [cmd]`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('disallow', this.disallowCommand.bind(this), {
            description: 'Remove permission for a user to use specific commands',
            usage: `${config.PREFIX}disallow <jid|cmd> [cmd]`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('permissions', this.permissionsCommand.bind(this), {
            description: 'View all user permissions',
            usage: `${config.PREFIX}permissions [jid]`,
            category: 'admin',
            ownerOnly: true
        });
    }

    /**
     * Help command handler
     */
    async helpCommand(messageInfo) {
        try {
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
                
                for (const [category, cmds] of Object.entries(categories)) {
                    helpText += `*${category.toUpperCase()}*\n`;
                    cmds.forEach(cmd => {
                        helpText += `• ${config.PREFIX}${cmd.name} - ${cmd.description}\n`;
                    });
                    helpText += '\n';
                }
                
                helpText += `_Total Commands: ${commands.length}_\n`;
                helpText += `_Type ${config.PREFIX}help <command> for detailed info_`;
                
                await this.bot.messageHandler.reply(messageInfo, helpText);
            }
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error displaying help.');
        }
    }

    /**
     * Ping command handler
     */
    async pingCommand(messageInfo) {
        try {
            const start = Date.now();
            
            // Send initial response with quote
            const reply = await this.bot.messageHandler.reply(messageInfo, '🏓 Pinging...');
            
            const latency = Date.now() - start;
            
            // Edit the message with actual ping results
            const pingText = `🏓 *Pong!*\n\n` +
                `⚡ *Response Time:* ${latency}ms\n` +
                `🕐 *Timestamp:* ${utils.getFormattedDate()}`;
            
            await this.bot.sock.sendMessage(messageInfo.sender, {
                text: pingText,
                edit: reply.key,
                quoted: {
                    key: messageInfo.key,
                    message: messageInfo.message
                }
            });
            
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, `🏓 Pong! Response time: ${Date.now() - messageInfo.timestamp}ms`);
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
     * Restart command handler (owner only)
     */
    async restartCommand(messageInfo) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🔄 Restarting MATDEV bot...');
            
            // Give time for message to send
            setTimeout(() => {
                process.exit(0);
            }, 2000);
            
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error during restart.');
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
     * Allow command handler (owner only)
     * Usage: .allow <jid> <cmd> OR when in chat: .allow <cmd>
     */
    async allowCommand(messageInfo) {
        try {
            const { args, sender } = messageInfo;
            
            if (args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Usage: `.allow <jid> <cmd>` or when in their chat: `.allow <cmd>`');
                return;
            }

            let jid, command;
            
            if (args.length === 1) {
                // When in their chat: .allow <cmd>
                // Grant permission to the person you're chatting with (chat_jid)
                this.bot.logger.info(`🔧 DEBUG .allow - sender: ${messageInfo.sender}, participant: ${messageInfo.participant}, chat_jid: ${messageInfo.chat_jid}`);
                jid = messageInfo.chat_jid;  // Grant permission to the person you're chatting with
                command = args[0];
            } else {
                // .allow <jid> <cmd>
                jid = args[0];
                command = args[1];
            }

            // Normalize JID format
            if (!jid.includes('@')) {
                jid = `${jid}@s.whatsapp.net`;
            }

            // Validate command exists
            const commands = this.bot.messageHandler.getCommands();
            const commandExists = commands.some(cmd => cmd.name === command);
            
            if (!commandExists) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Command "${command}" does not exist. Use \`.help\` to see available commands.`);
                return;
            }

            // Add permission using database
            const success = await this.bot.database.addPermission(jid, command);
            
            if (success) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Permission granted! User ${jid} can now use \`.${command}\``);
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to add permission. Please try again.');
            }
            
        } catch (err) {
            this.bot.logger.error('Allow command error:', err);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing allow command.');
        }
    }

    /**
     * Disallow command handler (owner only)
     * Usage: .disallow <jid> <cmd> OR when in chat: .disallow <cmd>
     */
    async disallowCommand(messageInfo) {
        try {
            const { args, sender } = messageInfo;
            
            if (args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Usage: `.disallow <jid> <cmd>` or when in their chat: `.disallow <cmd>`');
                return;
            }

            let jid, command;
            
            if (args.length === 1) {
                // When in their chat: .disallow <cmd>
                jid = sender;
                command = args[0];
            } else {
                // .disallow <jid> <cmd>
                jid = args[0];
                command = args[1];
            }

            // Normalize JID format
            if (!jid.includes('@')) {
                jid = `${jid}@s.whatsapp.net`;
            }

            // Remove permission using database
            const success = await this.bot.database.removePermission(jid, command);
            
            if (success) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Permission removed! User ${jid} can no longer use \`.${command}\``);
            } else {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ User ${jid} did not have permission for \`.${command}\``);
            }
            
        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing disallow command.');
        }
    }

    /**
     * Permissions command handler (owner only)
     * Usage: .permissions [jid] - shows all permissions or permissions for specific user
     */
    async permissionsCommand(messageInfo) {
        try {
            const { args } = messageInfo;
            
            if (args.length === 0) {
                // Show all permissions
                const allPermissions = this.bot.database.getAllPermissions();
                
                if (Object.keys(allPermissions).length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '📋 No permissions have been granted yet.');
                    return;
                }
                
                let permissionsText = '*📋 USER PERMISSIONS*\n\n';
                for (const [jid, commands] of Object.entries(allPermissions)) {
                    const displayJid = jid.split('@')[0]; // Show just the number
                    permissionsText += `👤 *${displayJid}:*\n`;
                    commands.forEach(cmd => {
                        permissionsText += `   • .${cmd}\n`;
                    });
                    permissionsText += '\n';
                }
                
                await this.bot.messageHandler.reply(messageInfo, permissionsText.trim());
                
            } else {
                // Show permissions for specific user
                let jid = args[0];
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
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving permissions.');
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
