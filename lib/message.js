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
            // this.logger.info(`🔧 Updated global botJid: ${global.botJid}`);
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
            // this.logger.info(`🔍 About to extract JIDs from message:`, {
            //     messageKey: message.key,
            //     hasMessage: !!message.message
            // });
            
            const jids = this.jidUtils.extractJIDs(message);
            // this.logger.info(`🔍 JID extraction result:`, jids);
            
            if (!jids) {
                this.logger.error('❌ Failed to extract JIDs from message');
                return;
            }

            // this.logger.info(`🔍 Centralized JID extraction:`, {
            //     chat_jid: jids.chat_jid,
            //     sender_jid: jids.sender_jid,
            //     participant_jid: jids.participant_jid,
            //     is_business: jids.is_business,
            //     is_group: jids.is_group,
            //     from_me: jids.from_me
            // });

            // Extract message content - handle multiple message types
            const messageTypes = Object.keys(message.message || {});
            const messageType = messageTypes[0];
            let text = '';

            console.log(`🔍 Processing message types: [${messageTypes.join(', ')}]`);

            // Try to extract text from various message types
            for (const type of messageTypes) {
                const content = message.message[type];
                console.log(`🔍 Checking type: ${type}, hasCaption: ${!!content?.caption}, caption: "${content?.caption}"`);
                
                if (typeof content === 'string') {
                    text = content;
                    console.log(`📝 Found string content: "${text}"`);
                    break;
                } else if (content?.text) {
                    text = content.text;
                    console.log(`📝 Found text property: "${text}"`);
                    break;
                } else if (content?.caption) {
                    text = content.caption;
                    console.log(`📝 Found caption: "${text}"`);
                    break;
                } else if (type === 'editedMessage' && content?.message) {
                    // Handle edited messages - extract from nested message structure
                    const editedContent = content.message;
                    const editedTypes = Object.keys(editedContent);
                    console.log(`🔍 Edited message types: [${editedTypes.join(', ')}]`);
                    
                    // Debug: Show full structure
                    console.log('🔍 EditedMessage full structure:', JSON.stringify(content, null, 2));
                    
                    for (const editedType of editedTypes) {
                        const editedTypeContent = editedContent[editedType];
                        if (typeof editedTypeContent === 'string') {
                            text = editedTypeContent;
                            console.log(`📝 Found edited string content: "${text}"`);
                            break;
                        } else if (editedTypeContent?.text) {
                            text = editedTypeContent.text;
                            console.log(`📝 Found edited text property: "${text}"`);
                            break;
                        } else if (editedTypeContent?.caption) {
                            text = editedTypeContent.caption;
                            console.log(`📝 Found edited caption: "${text}"`);
                            break;
                        } else if (editedType === 'conversation') {
                            text = editedTypeContent;
                            console.log(`📝 Found edited conversation: "${text}"`);
                            break;
                        }
                    }
                    if (text) break;
                }
            }

            // Special handling for conversation messages
            if (!text && message.message && message.message.conversation) {
                text = message.message.conversation;
            }

            if (!text || !text.trim()) {
                // Check if this is a sticker with a bound command
                const messageTypes = Object.keys(message.message || {});
                if (messageTypes.includes('stickerMessage')) {
                    const stickerProcessed = await this.processStickerCommand(message, jids);
                    if (stickerProcessed) {
                        return; // Sticker command was executed
                    }
                }
                
                this.logger.info(`No text content found in message. Available types: ${Object.keys(message.message || {}).join(', ')}`);
                return;
            }

            // this.logger.info(`🔍 Extracted text: "${text}"`);
            // this.logger.info(`🔍 Message types found: ${Object.keys(message.message || {}).join(', ')}`);

            // Check if it's a command (allow space after prefix)
            const prefix = require('../config').PREFIX;
            const trimmedText = text.trim();
            
            // Check for exact prefix or prefix with space (like ". help" -> ".help")
            const hasExactPrefix = trimmedText.startsWith(prefix);
            const hasSpacedPrefix = trimmedText.startsWith(prefix + ' ');
            
            if (!hasExactPrefix && !hasSpacedPrefix) {
                return;
            }
            
            // Handle spaced prefix by removing the extra space
            let commandText = trimmedText;
            if (hasSpacedPrefix && !hasExactPrefix) {
                // Replace "prefix " with "prefix" (remove space after prefix)
                commandText = prefix + trimmedText.slice(prefix.length + 1);
            }

            this.logger.info(`⚡ Command: ${commandText.split(' ')[0]} from ${jids.is_group ? 'group' : 'private'}`);

            // Parse command first to get command name for deduplication
            const args = commandText.slice(require('../config').PREFIX.length).split(' ');
            const commandName = args.shift().toLowerCase();

            // Create a unique key for this command message to prevent duplicates
            const messageKey = `${message.key?.id || Date.now()}:${jids.participant_jid}:${commandName}`;
            const now = Date.now();

            // Check for duplicate commands within 2 seconds
            if (this.recentMessages.has(messageKey)) {
                const lastProcessed = this.recentMessages.get(messageKey);
                if (now - lastProcessed < 2000) {
                    // this.logger.debug(`🔄 Duplicate command blocked: "${commandName}"`);
                    return; // Processed but blocked duplicate
                }
            }

            // Record this command to prevent duplicates
            this.recentMessages.set(messageKey, now);

            // Archive the message (including edited messages)
            await this.archiveMessage(message, jids, messageType, text);

            // For edited messages, preserve the original contextInfo structure
            let processedMessage = message.message;
            if (messageTypes.includes('editedMessage') && message.message?.editedMessage?.message) {
                // Create a hybrid message structure that preserves contextInfo
                const editedContent = message.message.editedMessage.message;
                
                // Find contextInfo from any nested message type
                let contextInfo = null;
                for (const [typeKey, typeContent] of Object.entries(editedContent)) {
                    if (typeContent?.contextInfo) {
                        contextInfo = typeContent.contextInfo;
                        console.log(`🔗 Found contextInfo in edited message type: ${typeKey}`);
                        break;
                    }
                }
                
                // If we found contextInfo, preserve it
                if (contextInfo) {
                    processedMessage = {
                        ...message.message,
                        extendedTextMessage: {
                            text: commandText,
                            contextInfo: contextInfo
                        }
                    };
                    console.log('🔗 Preserved contextInfo from edited message for command processing');
                }
            }

            // Create standardized message info object using centralized JIDs
            const messageInfo = {
                key: message.key,
                message: processedMessage,
                text: commandText, // Use processed command text
                sender: jids.chat_jid,           // Where the conversation is happening
                participant: jids.participant_jid, // Who gets permission credit
                chat_jid: jids.chat_jid,         // This is the correct JID to reply to
                sender_jid: jids.sender_jid,
                participant_jid: jids.participant_jid,
                from_me: jids.from_me,
                is_business: jids.is_business,
                is_group: jids.is_group,
                messageType: messageType,
                timestamp: message.messageTimestamp || Date.now(),
                args: args,
                commandName: commandName
            };

            // this.logger.info(`🔍 Created messageInfo for command:`, {
            //     command: commandName,
            //     chat_jid: messageInfo.chat_jid,
            //     is_group: messageInfo.is_group,
            //     participant: messageInfo.participant_jid
            // });

            // this.logger.info(`📋 Command parsed: ${commandName} from ${jids.participant_jid}`);

            // Check permissions using centralized participant JID
            // this.logger.info(`🔍 About to check permissions for command: ${commandName}, participant: ${jids.participant_jid}, fromMe: ${jids.from_me}`);
            const hasPermission = await this.checkPermissions(commandName, jids.participant_jid, jids.from_me);
            // this.logger.info(`🔍 Permission check result: ${hasPermission}`);
            
            if (!hasPermission) {
                // this.logger.warn(`❌ Permission denied for ${jids.participant_jid} to use ${commandName}`);
                // Don't send DM - just log to console to avoid disturbing user
                return;
            }

            // this.logger.info(`✅ Permission granted for ${jids.participant_jid} to use ${commandName}`);

            // Execute command with auto-reactions
            // this.logger.info(`🚀 About to execute command: ${commandName}`);
            await this.executeCommandWithReactions(commandName, messageInfo);
            this.logger.info(`✅ ${commandName} completed`);

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
                // this.logger.info(`🔍 Group LID check: participant=${participantJid}, registered=${groupLidData.lid}`);
                if (participantJid === groupLidData.lid) {
                    // this.logger.info(`🔐 Owner permission granted via registered group LID: ${participantJid}`);
                    return true;
                }
            }
            // else {
            //     this.logger.info(`🔍 No group LID registered or database unavailable`);
            // }

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
            // this.logger.info(`🔐 Permission check for ${participantJid}: ${hasPermission ? 'ALLOWED' : 'DENIED'}`);

            return hasPermission;

        } catch (error) {
            this.logger.error('Error checking permissions:', error);
            return false;
        }
    }

    /**
     * Execute command with auto-reactions
     */
    async executeCommandWithReactions(commandName, messageInfo) {
        const config = require('../config');
        let reactionAdded = false;

        try {
            // Add loading reaction if bot reactions are enabled
            if (config.BOT_REACTIONS) {
                await this.addReaction(messageInfo, '⏳');
                reactionAdded = true;
            }

            const command = this.commands.get(commandName);

            if (!command) {
                // Command not found - use cancel reaction instead of reply
                if (config.BOT_REACTIONS && reactionAdded) {
                    await this.addReaction(messageInfo, '❌');
                    setTimeout(() => this.removeReaction(messageInfo), 3000);
                }
                return;
            }

            this.stats.commands++;
            this.bot.messageStats.commands++;

            // Execute the command handler
            const executionResult = await command.handler(messageInfo);
            
            // Command succeeded - use success reaction
            if (config.BOT_REACTIONS && reactionAdded) {
                await this.addReaction(messageInfo, '✅');
                setTimeout(() => this.removeReaction(messageInfo), 3000);
            }

        } catch (error) {
            this.stats.errors++;
            this.logger.error(`Error executing command ${commandName}:`, error);
            
            // Command failed - use error reaction
            if (config.BOT_REACTIONS && reactionAdded) {
                await this.addReaction(messageInfo, '❌');
                setTimeout(() => this.removeReaction(messageInfo), 3000);
            }
        }
    }

    /**
     * Execute command (legacy method for backward compatibility)
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

            // Execute the command handler
            const executionResult = await command.handler(messageInfo);

        } catch (error) {
            this.stats.errors++;
            this.logger.error(`Error executing command ${commandName}:`, error);
            await this.reply(messageInfo, '❌ An error occurred while executing the command.');
        }
    }

    /**
     * Add reaction to message
     */
    async addReaction(messageInfo, emoji) {
        try {
            if (this.bot.sock) {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    react: {
                        text: emoji,
                        key: messageInfo.key
                    }
                });
            }
        } catch (error) {
            this.logger.debug('Error adding reaction:', error);
        }
    }

    /**
     * Remove reaction from message
     */
    async removeReaction(messageInfo) {
        try {
            if (this.bot.sock) {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    react: {
                        text: '',
                        key: messageInfo.key
                    }
                });
            }
        } catch (error) {
            this.logger.debug('Error removing reaction:', error);
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
            privateOnly: options.privateOnly || false,
            plugin: options.plugin || 'unknown', // Track which plugin registered this command
            source: options.source || 'unknown'   // Track source file for hot reload
        };

        this.commands.set(name.toLowerCase(), command);
        this.stats.commandsRegistered++;

        // Command registered - logging disabled for cleaner console
    }

    /**
     * Unregister commands by plugin name (for hot reload)
     */
    unregisterCommandsByPlugin(pluginName) {
        const commandsToRemove = [];
        
        for (const [commandName, command] of this.commands) {
            if (command.plugin === pluginName || command.source === `${pluginName}.js`) {
                commandsToRemove.push(commandName);
            }
        }

        commandsToRemove.forEach(commandName => {
            this.commands.delete(commandName);
            this.logger.info(`🗑️ Unregistered command: ${commandName}`);
        });

        return commandsToRemove.length;
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

            // this.logger.info(`📤 Attempting to send reply to: ${targetJid}`);
            // this.logger.info(`📝 Reply text: "${text.substring(0, 100)}..."`);
            // this.logger.info(`🔍 Message info details:`, {
            //     is_group: messageInfo.is_group,
            //     chat_jid: messageInfo.chat_jid,
            //     participant_jid: messageInfo.participant_jid,
            //     sender: messageInfo.sender
            // });
            // this.logger.info(`🔍 Reply message object:`, JSON.stringify(replyMessage, null, 2));
            
            const sent = await this.bot.sock.sendMessage(targetJid, replyMessage);
            
            // this.logger.info(`✅ Reply sent successfully! Message ID:`, sent?.key?.id);
            // this.logger.info(`✅ Full sent response:`, JSON.stringify(sent, null, 2));

            // Record this message to prevent duplicates
            this.recentMessages.set(messageKey, now);

            // Clean up old entries periodically
            this.cleanupRecentMessages();

            this.stats.processed++;
            this.bot.messageStats.sent++;
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

    /**
     * Process sticker commands
     */
    async processStickerCommand(message, jids) {
        try {
            const stickerMessage = message.message.stickerMessage;
            if (!stickerMessage) {
                return false;
            }

            // Get multiple sticker identifiers for robust matching
            const stickerIdentifiers = this.getStickerIdentifiers(stickerMessage);
            
            if (stickerIdentifiers.length === 0) {
                return false;
            }

            // Check if this sticker has a bound command using any identifier
            const stickerCommands = this.database.getData('stickerCommands') || {};
            let boundCommand = null;
            let matchedIdentifier = null;
            
            // Try to find a match with any of the identifiers
            for (const identifier of stickerIdentifiers) {
                if (stickerCommands[identifier]) {
                    boundCommand = stickerCommands[identifier];
                    matchedIdentifier = identifier;
                    break;
                }
            }
            
            if (!boundCommand) {
                return false; // No command bound to this sticker
            }

            // Create a unique key for this sticker message to prevent duplicates
            const messageKey = `${message.key?.id || Date.now()}:${matchedIdentifier}:${boundCommand.command}`;
            const now = Date.now();

            // Check for duplicate sticker commands within 2 seconds
            if (this.recentMessages.has(messageKey)) {
                const lastProcessed = this.recentMessages.get(messageKey);
                if (now - lastProcessed < 2000) {
                    // console.log(`🔄 Duplicate sticker command blocked: "${boundCommand.command}"`);
                    return true; // Processed but blocked duplicate
                }
            }

            // Record this sticker command to prevent duplicates
            this.recentMessages.set(messageKey, now);

            console.log(`🎭 Sticker command triggered: ${boundCommand.command} (matched: ${matchedIdentifier})`);

            // Create fake text message with the bound command
            const prefix = require('../config').PREFIX;
            const commandText = prefix + boundCommand.command;

            // Create fake text message structure to preserve reply context if sticker was sent as reply
            let fakeMessage = { ...message.message };
            
            // If the sticker has contextInfo (meaning it was sent as a reply), preserve it
            if (stickerMessage.contextInfo) {
                fakeMessage.extendedTextMessage = {
                    text: commandText,
                    contextInfo: stickerMessage.contextInfo
                };
            } else {
                fakeMessage.conversation = commandText;
            }

            // Create messageInfo for the bound command
            const messageInfo = {
                key: message.key,
                message: fakeMessage,
                text: commandText,
                sender: jids.chat_jid,
                participant: jids.participant_jid,
                chat_jid: jids.chat_jid,
                sender_jid: jids.sender_jid,
                participant_jid: jids.participant_jid,
                from_me: jids.from_me,
                is_business: jids.is_business,
                is_group: jids.is_group,
                messageType: 'stickerMessage',
                timestamp: message.messageTimestamp || Date.now(),
                args: [],
                commandName: boundCommand.command
            };

            // Check permissions for the bound command
            const hasPermission = await this.checkPermissions(boundCommand.command, jids.participant_jid, jids.from_me);
            
            if (!hasPermission) {
                console.log(`❌ Permission denied for sticker command: ${boundCommand.command}`);
                return true; // Still processed, just denied
            }

            // Execute the bound command
            await this.executeCommandWithReactions(boundCommand.command, messageInfo);
            console.log(`✅ Sticker command completed: ${boundCommand.command}`);
            
            return true; // Sticker command was processed

        } catch (error) {
            console.error('Error processing sticker command:', error);
            return false;
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
            
            // console.log(`🔍 Generated ${identifiers.length} sticker identifiers for matching`);
            
        } catch (error) {
            console.error('Error generating sticker identifiers:', error);
        }
        
        return identifiers;
    }
    
    /**
     * Archive message to storage
     */
    async archiveMessage(message, jids, messageType, extractedText) {
        try {
            // Enhanced archiving with extracted text and JID information
            const archiveData = {
                ...message,
                extractedText: extractedText || '',
                jids: jids,
                processedType: messageType,
                archived_at: Date.now(),
                // Mark if this is an edited message
                isEdited: messageType === 'editedMessage' || (message.message?.editedMessage ? true : false)
            };
            
            await this.database.archiveMessage(archiveData);
            console.log(`📩 Message Archived (edited: ${archiveData.isEdited})`);
        } catch (error) {
            this.logger.error('Error archiving message:', error);
        }
    }
}

module.exports = MessageHandler;