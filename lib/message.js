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

        // Message deduplication - prevent sending same message twice
        this.recentMessages = new Map();
        this.messageTimeoutMs = 5000; // 5 seconds to detect duplicates
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
            this.logger.info(`🔍 About to extract JIDs from message:`, {
                messageKey: message.key,
                hasMessage: !!message.message
            });
            
            const jids = this.jidUtils.extractJIDs(message);
            this.logger.info(`🔍 JID extraction result:`, jids);
            
            if (!jids) {
                this.logger.error('❌ Failed to extract JIDs from message');
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

            // Extract message content - handle multiple message types
            const messageTypes = Object.keys(message.message || {});
            const messageType = messageTypes[0];
            let text = '';

            // Try to extract text from various message types
            for (const type of messageTypes) {
                const content = message.message[type];
                
                if (typeof content === 'string') {
                    text = content;
                    break;
                } else if (content?.text) {
                    text = content.text;
                    break;
                } else if (content?.caption) {
                    text = content.caption;
                    break;
                }
            }

            // Special handling for conversation messages
            if (!text && message.message.conversation) {
                text = message.message.conversation;
            }

            if (!text || !text.trim()) {
                this.logger.info(`No text content found in message. Available types: ${Object.keys(message.message || {}).join(', ')}`);
                return;
            }

            this.logger.info(`🔍 Extracted text: "${text}"`);
            this.logger.info(`🔍 Message types found: ${Object.keys(message.message || {}).join(', ')}`);

            // Check if it's a command
            const prefix = require('../config').PREFIX;
            this.logger.info(`🔍 Checking prefix: "${prefix}" against text: "${text.trim()}"`);
            
            if (!text.trim().startsWith(prefix)) {
                this.logger.debug(`Not a command message - text doesn't start with ${prefix}`);
                return;
            }

            this.logger.info(`✅ Command detected with prefix: ${prefix}`);

            // Create standardized message info object using centralized JIDs
            const messageInfo = {
                key: message.key,
                message: message.message,
                text: text,
                sender: jids.chat_jid,           // Where the conversation is happening
                participant: jids.participant_jid, // Who gets permission credit
                chat_jid: jids.chat_jid,         // This is the correct JID to reply to
                sender_jid: jids.sender_jid,
                participant_jid: jids.participant_jid,
                from_me: jids.from_me,
                is_business: jids.is_business,
                is_group: jids.is_group,
                messageType: messageType,
                timestamp: message.messageTimestamp || Date.now()
            };

            // Parse command first, then log
            const args = text.trim().slice(require('../config').PREFIX.length).split(' ');
            const commandName = args.shift().toLowerCase();
            messageInfo.args = args;
            messageInfo.commandName = commandName;

            this.logger.info(`🔍 Created messageInfo for command:`, {
                command: commandName,
                chat_jid: messageInfo.chat_jid,
                is_group: messageInfo.is_group,
                participant: messageInfo.participant_jid
            });

            

            this.logger.info(`📋 Command parsed: ${commandName} from ${jids.participant_jid}`);

            // Check permissions using centralized participant JID
            this.logger.info(`🔍 About to check permissions for command: ${commandName}, participant: ${jids.participant_jid}, fromMe: ${jids.from_me}`);
            const hasPermission = await this.checkPermissions(commandName, jids.participant_jid, jids.from_me);
            this.logger.info(`🔍 Permission check result: ${hasPermission}`);
            
            if (!hasPermission) {
                this.logger.warn(`❌ Permission denied for ${jids.participant_jid} to use ${commandName}`);
                // Don't send DM - just log to console to avoid disturbing user
                return;
            }

            this.logger.info(`✅ Permission granted for ${jids.participant_jid} to use ${commandName}`);

            // Execute command
            this.logger.info(`🚀 About to execute command: ${commandName}`);
            await this.executeCommand(commandName, messageInfo);
            this.logger.info(`🏁 Finished processing command: ${commandName}`);

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
                this.logger.info(`🔐 Owner permission granted via standard JID: ${participantJid}`);
                return true;
            }

            // Check if participant matches registered group LID (owner's LID in groups) - PRIORITY CHECK
            if (this.database && this.database.isGroupLidRegistered()) {
                const groupLidData = this.database.getGroupLidData();
                this.logger.info(`🔍 Group LID check: participant=${participantJid}, registered=${groupLidData.lid}`);
                if (participantJid === groupLidData.lid) {
                    this.logger.info(`🔐 Owner permission granted via registered group LID: ${participantJid}`);
                    return true;
                }
            } else {
                this.logger.info(`🔍 No group LID registered or database unavailable`);
            }

            // Check if command exists
            const command = this.commands.get(commandName);
            if (!command) {
                return false; // Command doesn't exist
            }

            // Special case: .rg command is available to anyone in groups (no permission needed)
            if (commandName === 'rg') {
                this.logger.info(`🔐 Special permission: .rg command allowed for anyone in groups`);
                return true;
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
            this.logger.info(`🔍 Command handler exists:`, typeof command.handler === 'function');

            // Execute the command handler
            const executionResult = await command.handler(messageInfo);
            
            this.logger.info(`✅ Command execution completed for: ${commandName}`);

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
     * Reply to a message
     */
    async reply(messageInfo, text, options = {}) {
        try {
            // Check for duplicate messages
            const messageKey = `${messageInfo.sender}:${text}`;
            const now = Date.now();

            if (this.recentMessages.has(messageKey)) {
                const lastSent = this.recentMessages.get(messageKey);
                if (now - lastSent < this.messageTimeoutMs) {
                    this.logger.debug(`🔄 Duplicate message blocked: "${text.substring(0, 50)}..."`);
                    return null; // Don't send duplicate
                }
            }

            await this.security.smartDelay();

            // Use the correct chat JID for replies - ensure we reply to the right place
            const targetJid = messageInfo.chat_jid || messageInfo.sender;
            
            const replyMessage = {
                text: text,
                quoted: {
                    key: messageInfo.key,
                    message: messageInfo.message
                },
                ...options
            };

            this.logger.info(`📤 Attempting to send reply to: ${targetJid}`);
            this.logger.info(`📝 Reply text: "${text.substring(0, 100)}..."`);
            this.logger.info(`🔍 Message info details:`, {
                is_group: messageInfo.is_group,
                chat_jid: messageInfo.chat_jid,
                participant_jid: messageInfo.participant_jid,
                sender: messageInfo.sender
            });
            this.logger.info(`🔍 Reply message object:`, JSON.stringify(replyMessage, null, 2));
            
            const sent = await this.bot.sock.sendMessage(targetJid, replyMessage);
            
            this.logger.info(`✅ Reply sent successfully! Message ID:`, sent?.key?.id);
            this.logger.info(`✅ Full sent response:`, JSON.stringify(sent, null, 2));

            // Record this message to prevent duplicates
            this.recentMessages.set(messageKey, now);

            // Clean up old entries periodically
            this.cleanupRecentMessages();

            this.stats.processed++;
            return sent;
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
     * Clean up old recent messages to prevent memory leaks
     */
    cleanupRecentMessages() {
        const now = Date.now();
        const cutoff = now - this.messageTimeoutMs;

        for (const [key, timestamp] of this.recentMessages.entries()) {
            if (timestamp < cutoff) {
                this.recentMessages.delete(key);
            }
        }
    }

    /**
     * Get handler statistics
     */
    getStats() {
        return {
            ...this.stats,
            commandsRegistered: this.commands.size,
            recentMessagesTracked: this.recentMessages.size
        };
    }
}

module.exports = MessageHandler;