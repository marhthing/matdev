/**
 * MATDEV Message Handler
 * High-performance message processing with advanced features
 */

const path = require('path');
const fs = require('fs-extra');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');
const Logger = require('./logger');
const Utils = require('./utils');
const JIDUtils = require('./jid-utils');

class MessageHandler {
    constructor(bot, cache, security, database) {
        this.bot = bot;
        this.cache = cache;
        this.security = security;
        this.database = database;
        this.logger = bot.logger || console;
        this.commands = new Map();
        this.stats = {
            processed: 0,
            commands: 0,
            errors: 0,
            mediaMessages: 0,
            commandsRegistered: 0
        };
        
        // Initialize centralized JID utils
        this.jidUtils = new JIDUtils(this.logger);
        
        // Set bot JID globally when handler is initialized
        this.updateBotJid();
    }
    
    /**
     * Update bot JID globally for consistent JID handling
     */
    updateBotJid() {
        if (this.bot.sock?.user?.id) {
            const botNumber = this.bot.sock.user.id.split(':')[0];
            global.botJid = `${botNumber}@s.whatsapp.net`;
            this.logger.info(`🔧 Updated global botJid: ${global.botJid}`);
        }
    }

    /**
     * Process incoming message
     */
    async process(message) {
        try {
            this.stats.processed++;
            
            // Update bot JID if needed
            this.updateBotJid();
            
            // Use centralized JID extraction
            const jids = this.jidUtils.extractJIDs(message);
            if (!jids) {
                this.logger.error('Failed to extract JIDs from message');
                return;
            }
            
            this.logger.info(`🔍 Centralized JID extraction:`, {
                chat_jid: jids.chat_jid,
                sender_jid: jids.sender_jid,
                participant_jid: jids.participant_jid,
                is_business: jids.is_business,
                is_group: jids.is_group,
                from_me: jids.from_me
            });

            // Extract message content
            const messageType = Object.keys(message.message || {})[0];
            const content = message.message[messageType];
            let text = '';

            if (typeof content === 'string') {
                text = content;
            } else if (content?.text) {
                text = content.text;
            } else if (content?.caption) {
                text = content.caption;
            }

            if (!text || !text.trim()) {
                this.logger.debug('No text content found in message');
                return;
            }

            // Check if it's a command
            if (!text.trim().startsWith(require('../config').PREFIX)) {
                this.logger.debug('Not a command message');
                return;
            }

            // Create standardized message info object using centralized JIDs
            const messageInfo = {
                key: message.key,
                message: message.message,
                text: text,
                sender: jids.chat_jid,           // Where the conversation is happening
                participant: jids.participant_jid, // Who gets permission credit
                chat_jid: jids.chat_jid,
                sender_jid: jids.sender_jid,
                participant_jid: jids.participant_jid,
                from_me: jids.from_me,
                is_business: jids.is_business,
                is_group: jids.is_group,
                messageType: messageType,
                timestamp: message.messageTimestamp || Date.now()
            };

            // Parse command
            const args = text.trim().slice(require('../config').PREFIX.length).split(' ');
            const commandName = args.shift().toLowerCase();
            messageInfo.args = args;
            messageInfo.commandName = commandName;

            this.logger.info(`📋 Command parsed: ${commandName} from ${jids.participant_jid}`);

            // Check permissions using centralized participant JID
            if (!await this.checkPermissions(commandName, jids.participant_jid, jids.from_me)) {
                this.logger.warn(`❌ Permission denied for ${jids.participant_jid} to use ${commandName}`);
                await this.reply(messageInfo, '❌ You do not have permission to use this command.');
                return;
            }

            // Execute command
            await this.executeCommand(commandName, messageInfo);
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error('Error processing message:', error);
        }
    }

    /**
     * Check if user has permission to use command
     */
    async checkPermissions(commandName, participantJid, fromMe) {
        try {
            const config = require('../config');
            
            // Owner always has permission (check multiple formats)
            const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            if (fromMe || 
                participantJid === ownerJid ||
                participantJid.startsWith(`${config.OWNER_NUMBER}:`) ||
                participantJid.includes(`${config.OWNER_NUMBER}@lid`)) {
                return true;
            }

            // Check if command exists
            const command = this.commands.get(commandName);
            if (!command) {
                return false; // Command doesn't exist
            }

            // Check if command is owner-only
            if (command.ownerOnly) {
                return false; // Only owner can use this command
            }

            // Check database permissions for regular users
            const hasPermission = this.database.hasPermission(participantJid, commandName);
            this.logger.info(`🔐 Permission check for ${participantJid}: ${hasPermission ? 'ALLOWED' : 'DENIED'}`);
            
            return hasPermission;
            
        } catch (error) {
            this.logger.error('Error checking permissions:', error);
            return false;
        }
    }

    /**
     * Execute command
     */
    async executeCommand(commandName, messageInfo) {
        try {
            const command = this.commands.get(commandName);
            
            if (!command) {
                await this.reply(messageInfo, `❌ Command "${commandName}" not found. Use .help to see available commands.`);
                return;
            }

            this.stats.commands++;
            this.bot.messageStats.commands++;

            this.logger.info(`⚡ Executing command: ${commandName}`);
            
            // Execute the command handler
            await command.handler(messageInfo);
            
        } catch (error) {
            this.stats.errors++;
            this.logger.error(`Error executing command ${commandName}:`, error);
            await this.reply(messageInfo, '❌ An error occurred while executing the command.');
        }
    }

    /**
     * Register a command
     */
    registerCommand(name, handler, options = {}) {
        const command = {
            name: name.toLowerCase(),
            handler,
            description: options.description || 'No description',
            usage: options.usage || `${require('../config').PREFIX}${name}`,
            category: options.category || 'general',
            ownerOnly: options.ownerOnly || false,
            groupOnly: options.groupOnly || false,
            privateOnly: options.privateOnly || false
        };

        this.commands.set(name.toLowerCase(), command);
        this.stats.commandsRegistered++;
        
        this.logger.info(`📝 Registered command: ${name}`);
    }

    /**
     * Reply to a message using centralized JIDs
     */
    async reply(messageInfo, text, options = {}) {
        try {
            const replyMessage = {
                text: text,
                ...options
            };

            // Add quote if requested
            if (options.quoted !== false) {
                replyMessage.quoted = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
            }

            // Send to the chat using centralized chat JID
            const result = await this.bot.sock.sendMessage(messageInfo.chat_jid, replyMessage);
            
            this.bot.messageStats.sent++;
            
            return result;
            
        } catch (error) {
            this.logger.error('Error sending reply:', error);
            throw error;
        }
    }

    /**
     * Get all registered commands
     */
    getCommands() {
        return Array.from(this.commands.values());
    }

    /**
     * Get handler statistics
     */
    getStats() {
        return { ...this.stats };
    }
}

module.exports = MessageHandler;

class MessageHandler {
    constructor(bot, cache, security, database) {
        this.bot = bot;
        this.cache = cache;
        this.security = security;
        this.database = database;
        this.logger = new Logger();
        this.utils = new Utils();
        this.jidUtils = new JIDUtils(this.logger);

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
            // NOTE: Message archiving is now handled in index.js before this method
            // This ensures ALL messages are archived regardless of processing outcome

            const messageInfo = this.extractMessageInfo(message);
            if (!messageInfo) return;

            // Debug logging for all messages
            this.logger.info(`📝 Processing message type: ${messageInfo.messageType}`);
            if (messageInfo.text) {
                this.logger.info(`📝 Text content: "${messageInfo.text}"`);
                this.logger.info(`🔍 Is command: ${messageInfo.isCommand}`);
                if (messageInfo.isCommand) {
                    this.logger.info(`⚡ Command: "${messageInfo.command}" with args: [${messageInfo.args.join(', ')}]`);
                }
            } else if (messageInfo.hasMedia) {
                this.logger.info(`📎 Media message type: ${messageInfo.messageType}`);
            }

            // Apply middlewares
            for (const middleware of this.middlewares) {
                const result = await middleware(messageInfo, this.bot);
                if (result === false) {
                    return; // Middleware blocked the message
                }
            }

            // Handle different message types
            if (messageInfo.isCommand) {
                this.logger.info(`🎯 Executing command: ${messageInfo.command}`);
                await this.handleCommand(messageInfo);
            } else if (messageInfo.hasMedia) {
                await this.handleMedia(messageInfo);
            } else if (messageInfo.text) {
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
            if (!messageType) {
                this.logger.debug(`📋 No message type found in message:`, message);
                return null;
            }

            // Use centralized JID extraction
            const jids = this.jidUtils.extractJIDs(message);
            if (!jids) {
                this.logger.error('Failed to extract JIDs from message');
                return null;
            }

            // Set bot JID globally for JID utils
            if (this.bot?.sock?.user?.id) {
                const botNumber = this.bot.sock.user.id.split(':')[0];
                global.botJid = `${botNumber}@s.whatsapp.net`;
            }

            // Log message details for debugging
            this.logger.info(`📦 Message type: ${messageType}`);
            this.logger.info(`🔑 Raw message key:`, message.key);

            const content = message.message[messageType];
            const text = content?.text || content?.caption || content || '';

            this.logger.info(`📬 Sender: ${jids.sender_jid}`);
            this.logger.info(`👤 Participant: ${jids.participant_jid}`);
            this.logger.info(`💬 Chat: ${jids.chat_jid}`);

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
                sender: jids.chat_jid,          // Chat JID - where the conversation is
                participant: jids.participant_jid, // Who should get credit for permissions
                sender_jid: jids.sender_jid,    // Who actually sent the message
                chat_jid: jids.chat_jid,        // Chat/conversation JID
                isGroup: jids.is_group,
                isBusiness: jids.is_business,
                fromMe: jids.from_me,
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

            this.logger.info(`🔧 Handling command: "${command}"`);
            this.logger.info(`📋 Available commands: [${Array.from(this.commands.keys()).join(', ')}]`);

            // Check if command exists
            if (!this.commands.has(command)) {
                this.logger.warn(`❌ Command "${command}" not found in registered commands`);
                // Don't respond to unknown commands to stay discreet
                return;
            }

            const commandHandler = this.commands.get(command);
            this.logger.info(`✅ Command handler found for: ${command}`);

            // Check permissions
            if (!this.checkPermissions(commandHandler, participant, isGroup)) {
                this.logger.warn(`🚫 Permission denied for command: ${command}`);
                // Stay silent - don't send any response
                return;
            }

            // Check rate limiting
            if (await this.security.isCommandRateLimited(participant, command)) {
                this.logger.warn(`⏱️ Rate limited for command: ${command}`);
                return; // Silently ignore rate limited commands
            }

            // Auto-read and typing indicators
            if (config.AUTO_READ) {
                await this.bot.sock.readMessages([messageInfo.key]);
            }

            if (config.AUTO_TYPING) {
                await this.bot.sock.sendPresenceUpdate('composing', sender);
            }

            this.logger.info(`🚀 Executing command handler for: ${command}`);
            // Execute command
            await commandHandler.handler(messageInfo, this.bot);
            this.logger.success(`✅ Command executed successfully: ${command}`);

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

        // Personal assistant mode - more responsive to owner
        const ownerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;

        // Only provide auto-responses to the owner
        if (participant !== ownerJid) {
            return;
        }

        // Personal assistant triggers
        const triggers = {
            'help': 0.8, // 80% chance to respond to help requests
            'hello': 0.7, // 70% chance to respond to greetings
            'hi': 0.7,
            'hey': 0.7,
            'good morning': 0.9,
            'good afternoon': 0.9,
            'good evening': 0.9,
            'thanks': 0.6,
            'thank you': 0.6
        };

        for (const [trigger, chance] of Object.entries(triggers)) {
            if (text.toLowerCase().includes(trigger) && Math.random() < chance) {
                // Only respond if not rate limited
                if (!(await this.security.isAutoResponseRateLimited(participant))) {
                    const responses = {
                        'help': [
                            '👋 Hello! I\'m your personal assistant. How can I help you today?',
                            '🤖 I\'m here to assist you! What do you need?',
                            '💡 How may I assist you today?'
                        ],
                        'hello': ['👋 Hello!', '🤖 Hi there!', '😊 Hey!'],
                        'hi': ['👋 Hi!', '🤖 Hello!', '😊 Hey there!'],
                        'hey': ['👋 Hey!', '🤖 Hi!', '😊 Hello!'],
                        'good morning': ['🌅 Good morning!', '☀️ Morning!', '🌞 Good morning to you too!'],
                        'good afternoon': ['🌞 Good afternoon!', '😊 Afternoon!', '🌤️ Good afternoon to you too!'],
                        'good evening': ['🌅 Good evening!', '🌙 Evening!', '🌆 Good evening to you too!'],
                        'thanks': ['😊 You\'re welcome!', '🤖 Happy to help!', '👍 Anytime!'],
                        'thank you': ['😊 You\'re very welcome!', '🤖 My pleasure!', '👍 Always here to help!']
                    };

                    const triggerResponses = responses[trigger] || responses['hello'];
                    const response = triggerResponses[Math.floor(Math.random() * triggerResponses.length)];
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
        const ownerNumber = `${config.OWNER_NUMBER}@s.whatsapp.net`;
        const isOwner = participant === ownerNumber;

        // Owner always has access to everything
        if (isOwner) {
            return true;
        }

        // Owner-only commands are restricted to owner only
        if (commandHandler.ownerOnly) {
            return false;
        }

        // Check if user has specific permission for this command
        const hasPermission = this.bot.database.hasPermission(participant, commandHandler.name);
        if (!hasPermission) {
            // User doesn't have permission for this command
            return false;
        }

        // Group/private restrictions still apply even with permissions
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

            // Always quote the original message for command responses (unless explicitly disabled)
            if (options.quote !== false) {
                replyOptions.quoted = {
                    key: messageInfo.key,
                    message: messageInfo.message
                };
            }

            // Always reply to the chat where the command was sent (sender), not to the participant
            const replyJid = messageInfo.sender;

            await this.bot.sock.sendMessage(replyJid, replyOptions);
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