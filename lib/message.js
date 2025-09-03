
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
