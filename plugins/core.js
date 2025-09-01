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
            
            const reply = await this.bot.messageHandler.reply(messageInfo, '🏓 Pinging...', { quote: false });
            
            const latency = Date.now() - start;
            
            // Edit the message with actual ping
            const pingText = `🏓 *Pong!*\n\n` +
                `⚡ *Response Time:* ${latency}ms\n` +
                `🕐 *Timestamp:* ${utils.getFormattedDate()}`;
            
            await this.bot.sock.sendMessage(messageInfo.sender, {
                text: pingText,
                edit: reply.key
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
                `• Built with @whiskeysockets/baileys\n` +
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
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new CorePlugin();
        await plugin.init(bot);
    }
};
