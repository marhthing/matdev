/**
 * MATDEV Message Handler
 * High-performance message processing with advanced features
 */

const path = require('path');
const fs = require('fs-extra');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');
const Logger = require('./logger');
const Utils = require('./utils');

class MessageHandler {
    constructor(bot, cache, security) {
        this.bot = bot;
        this.cache = cache;
        this.security = security;
        this.logger = new Logger();
        this.utils = new Utils();

        this.commands = new Map();
        this.middlewares = [];
        this.loadedPlugins = new Set();

        this.stats = {
            processed: 0,
            commands: 0,
            errors: 0,
            mediaMessages: 0
        };
    }

    /**
     * Process incoming message
     */
    async process(message) {
        try {
            const messageInfo = this.extractMessageInfo(message);
            if (!messageInfo) return;

            // Skip non-text messages for commands
            if (!messageInfo.text) return;

            // Debug log for troubleshooting
            console.log(`Processing message: "${messageInfo.text}" from ${messageInfo.sender}`);


            // Apply middlewares
            for (const middleware of this.middlewares) {
                const result = await middleware(messageInfo, this.bot);
                if (result === false) {
                    return; // Middleware blocked the message
                }
            }

            // Handle different message types
            if (messageInfo.isCommand) {
                await this.handleCommand(messageInfo);
            } else if (messageInfo.hasMedia) {
                await this.handleMedia(messageInfo);
            } else {
                await this.handleText(messageInfo);
            }

        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error processing message:', error);
        }
    }

    /**
     * Extract message information
     */
    extractMessageInfo(message) {
        try {
            const messageType = Object.keys(message.message || {})[0];
            if (!messageType) return null;

            const content = message.message[messageType];
            const text = content?.text || content?.caption || '';
            const sender = message.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const participant = isGroup ? message.key.participant : sender;

            // Check if it's a command
            const isCommand = text.startsWith(config.PREFIX);
            let command = '';
            let args = [];

            if (isCommand) {
                const parts = text.slice(config.PREFIX.length).trim().split(' ');
                command = parts[0].toLowerCase();
                args = parts.slice(1);
            }

            return {
                message,
                messageType,
                content,
                text,
                sender,
                participant,
                isGroup,
                isCommand,
                command,
                args,
                hasMedia: this.hasMedia(message),
                timestamp: message.messageTimestamp,
                key: message.key
            };

        } catch (error) {
            this.logger.error('Error extracting message info:', error);
            return null;
        }
    }

    /**
     * Check if message has media
     */
    hasMedia(message) {
        const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
        return mediaTypes.some(type => message.message?.[type]);
    }

    /**
     * Handle command messages
     */
    async handleCommand(messageInfo) {
        try {
            this.stats.commands++;

            const { command, args, sender, isGroup, participant } = messageInfo;

            // Check if command exists
            if (!this.commands.has(command)) {
                // Don't respond to unknown commands to stay discreet
                return;
            }

            const commandHandler = this.commands.get(command);

            // Check permissions
            if (!this.checkPermissions(commandHandler, participant, isGroup)) {
                await this.reply(messageInfo, '❌ You don\'t have permission to use this command.');
                return;
            }

            // Check rate limiting
            if (await this.security.isCommandRateLimited(participant, command)) {
                return; // Silently ignore rate limited commands
            }

            // Auto-read and typing indicators
            if (config.AUTO_READ) {
                await this.bot.sock.readMessages([messageInfo.key]);
            }

            if (config.AUTO_TYPING) {
                await this.bot.sock.sendPresenceUpdate('composing', sender);
            }

            // Execute command
            await commandHandler.handler(messageInfo, this.bot);

            // Update command statistics
            this.security.updateCommandStats(participant, command);

        } catch (error) {
            this.logger.error(`Error handling command ${messageInfo.command}:`, error);
            await this.reply(messageInfo, '⚠️ An error occurred while processing your request.');
        } finally {
            // Stop typing
            if (config.AUTO_TYPING) {
                await this.bot.sock.sendPresenceUpdate('available', messageInfo.sender);
            }
        }
    }

    /**
     * Handle media messages
     */
    async handleMedia(messageInfo) {
        try {
            this.stats.mediaMessages++;

            // Auto-view media if enabled
            if (config.AUTO_READ) {
                await this.bot.sock.readMessages([messageInfo.key]);
            }

            // Cache media info for potential processing
            this.cache.cacheMediaInfo(messageInfo.key.id, {
                type: messageInfo.messageType,
                sender: messageInfo.participant,
                timestamp: messageInfo.timestamp
            });

        } catch (error) {
            this.logger.error('Error handling media:', error);
        }
    }

    /**
     * Handle text messages
     */
    async handleText(messageInfo) {
        try {
            // Auto-read if enabled
            if (config.AUTO_READ) {
                await this.bot.sock.readMessages([messageInfo.key]);
            }

            // Process text for potential auto-responses or triggers
            await this.processTextTriggers(messageInfo);

        } catch (error) {
            this.logger.error('Error handling text:', error);
        }
    }

    /**
     * Process text triggers and auto-responses
     */
    async processTextTriggers(messageInfo) {
        const { text, participant } = messageInfo;

        // Keep auto-responses minimal and discreet
        const triggers = {
            'bot': 0.1, // 10% chance to respond
            'help': 0.2, // 20% chance to respond
            'hello': 0.05 // 5% chance to respond
        };

        for (const [trigger, chance] of Object.entries(triggers)) {
            if (text.toLowerCase().includes(trigger) && Math.random() < chance) {
                // Only respond if not rate limited
                if (!(await this.security.isAutoResponseRateLimited(participant))) {
                    const responses = [
                        '👋',
                        '🤖',
                        'Hello!',
                        'Hi there!'
                    ];

                    const response = responses[Math.floor(Math.random() * responses.length)];
                    await this.reply(messageInfo, response);

                    break; // Only one auto-response per message
                }
            }
        }
    }

    /**
     * Register command
     */
    registerCommand(name, handler, options = {}) {
        const commandInfo = {
            name: name.toLowerCase(),
            handler,
            description: options.description || 'No description',
            category: options.category || 'general',
            usage: options.usage || `${config.PREFIX}${name}`,
            ownerOnly: options.ownerOnly || false,
            groupOnly: options.groupOnly || false,
            privateOnly: options.privateOnly || false,
            cooldown: options.cooldown || 0
        };

        this.commands.set(name.toLowerCase(), commandInfo);
        this.logger.debug(`Registered command: ${name}`);
    }

    /**
     * Register middleware
     */
    registerMiddleware(middleware) {
        if (typeof middleware === 'function') {
            this.middlewares.push(middleware);
            this.logger.debug('Registered middleware');
        }
    }

    /**
     * Check command permissions
     */
    checkPermissions(commandHandler, participant, isGroup) {
        // Owner check
        if (commandHandler.ownerOnly) {
            const ownerNumber = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            return participant === ownerNumber;
        }

        // Group/private restrictions
        if (commandHandler.groupOnly && !isGroup) {
            return false;
        }

        if (commandHandler.privateOnly && isGroup) {
            return false;
        }

        return true;
    }

    /**
     * Reply to message
     */
    async reply(messageInfo, text, options = {}) {
        try {
            const replyOptions = {
                text,
                ...options
            };

            // Quote original message if specified
            if (options.quote !== false) {
                replyOptions.quoted = messageInfo.message;
            }

            await this.bot.sock.sendMessage(messageInfo.sender, replyOptions);
            this.bot.messageStats.sent++;

        } catch (error) {
            this.logger.error('Error sending reply:', error);
            throw error;
        }
    }

    /**
     * Send message
     */
    async sendMessage(jid, content, options = {}) {
        try {
            await this.bot.sock.sendMessage(jid, content, options);
            this.bot.messageStats.sent++;
        } catch (error) {
            this.logger.error('Error sending message:', error);
            throw error;
        }
    }

    /**
     * Download media from message
     */
    async downloadMedia(message, filename = null) {
        try {
            const buffer = await downloadMediaMessage(message, 'buffer', {});

            if (filename) {
                const filepath = path.join(process.cwd(), 'tmp', filename);
                await fs.writeFile(filepath, buffer);
                return filepath;
            }

            return buffer;

        } catch (error) {
            this.logger.error('Error downloading media:', error);
            throw error;
        }
    }

    /**
     * Get command list
     */
    getCommands(category = null) {
        const commands = Array.from(this.commands.values());

        if (category) {
            return commands.filter(cmd => cmd.category === category);
        }

        return commands;
    }

    /**
     * Get message statistics
     */
    getStats() {
        return {
            ...this.stats,
            commandsRegistered: this.commands.size,
            middlewaresRegistered: this.middlewares.length
        };
    }

    /**
     * Clear command cache
     */
    clearCommands() {
        this.commands.clear();
        this.logger.info('Command cache cleared');
    }

    /**
     * Reload commands
     */
    async reloadCommands() {
        this.clearCommands();

        // Reload plugins would go here
        // This is handled by the main bot instance

        this.logger.success('Commands reloaded');
    }
}

module.exports = MessageHandler;