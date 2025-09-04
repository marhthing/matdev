/**
 * MATDEV Anti-Delete Plugin
 * Detects deleted messages and forwards them to bot owner
 */

const config = require('../config');

class AntiDeletePlugin {
    constructor() {
        this.name = 'antidelete';
        this.description = 'Anti-delete message detection';
        this.version = '1.0.0';
        this.messageTracker = new Map(); // Track recent messages by chat
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;

        // Register commands immediately
        this.registerCommands();

        // Set up event listener when socket becomes available
        this.setupEventListeners();

        console.log('✅ Anti-delete plugin loaded');
    }

    /**
     * Setup event listeners when socket is available
     */
    setupEventListeners() {
        // No need for event listeners - the main bot handles REVOKE messages
        // and calls our handleMessageDeletion method directly
        console.log('✅ Anti-delete plugin ready to handle deletions via direct calls');
    }

    /**
     * Register anti-delete commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('antidelete', this.toggleAntiDelete.bind(this), {
            description: 'Toggle anti-delete monitoring',
            usage: `${config.PREFIX}antidelete [on|off]`,
            category: 'admin',
            ownerOnly: true
        });

        this.bot.messageHandler.registerCommand('getdeleted', this.getDeletedMessages.bind(this), {
            description: 'Get recent deleted messages',
            usage: `${config.PREFIX}getdeleted [count]`,
            category: 'admin',
            ownerOnly: true
        });
    }

    /**
     * Handle message update events (for deletions)
     */
    async handleMessageUpdates(updates) {
        try {
            for (const update of updates) {
                // Handle direct revoke type
                if (update.update.messageStubType === 'REVOKE') {
                    await this.handleMessageDeletion(update.key.id, update.key.remoteJid);
                }

                // Handle protocol message revoke (more common)
                if (update.update.message?.protocolMessage?.type === 'REVOKE') {
                    const revokedKey = update.update.message.protocolMessage.key;
                    if (revokedKey && revokedKey.id) {
                        await this.handleMessageDeletion(revokedKey.id, revokedKey.remoteJid || update.key.remoteJid);
                    }
                }
            }
        } catch (error) {
            console.error('Error handling message updates:', error);
        }
    }

    /**
     * Handle individual message deletion
     */
    async handleMessageDeletion(messageId, chatJid) {
        try {
            // Filter out status and newsletter messages
            if (this.shouldIgnoreChat(chatJid)) {
                console.log('ℹ️ ANTI-DELETE: Ignoring deletion from filtered chat:', chatJid);
                return;
            }

            console.log('🗑️ ANTI-DELETE: Detected deleted message:', messageId, 'in chat:', chatJid);

            // Add delay to ensure message is properly stored before checking
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Get the original message from our JSON storage
            const originalMessage = await this.bot.database.getArchivedMessage(messageId);

            if (originalMessage) {
                console.log('📋 ANTI-DELETE: Original message found in database:', {
                    id: originalMessage.id,
                    sender: originalMessage.sender_jid,
                    participant: originalMessage.participant_jid,
                    content: originalMessage.content?.substring(0, 50) + '...',
                    timestamp: originalMessage.timestamp,
                    from_me: originalMessage.from_me
                });

                // Send alert to owner for incoming messages (use centralized from_me flag)
                const config = require('../config');
                if (config.OWNER_NUMBER && !originalMessage.from_me) {
                    console.log('🚨 ANTI-DELETE: Sending alert for incoming message deletion');
                    await this.sendDeletedMessageAlert(originalMessage, chatJid);
                    await this.bot.database.markMessageDeleted(messageId, chatJid);
                    console.log('✅ ANTI-DELETE: Alert sent for message:', messageId);
                } else if (!originalMessage.from_me) { // This condition is now handled above, but keeping for logical flow if needed elsewhere
                    console.log('ℹ️ ANTI-DELETE: Skipping own message deletion:', messageId);
                } else {
                    console.log('⚠️ ANTI-DELETE: No owner number configured, skipping alert');
                }
            } else {
                console.log('❌ ANTI-DELETE: Original message not found in database:', messageId);
                // Only send notification if we're sure it wasn't our own message
                // Check if the chat is with someone else (not status or our own number)
                const isOtherPersonChat = chatJid !== 'status@broadcast' &&
                                        !chatJid.startsWith(config.OWNER_NUMBER) &&
                                        chatJid.includes('@s.whatsapp.net');

                if (config.OWNER_NUMBER && isOtherPersonChat) {
                    console.log('🚨 ANTI-DELETE: Sending unknown deletion alert');
                    const unknownDeleteNotification = `🗑️ *MESSAGE DELETION DETECTED*\n\n` +
                        `⚠️ *Warning:* A message was deleted but could not be recovered\n` +
                        `📱 *Chat:* ${chatJid.split('@')[0]}\n` +
                        `🆔 *Message ID:* ${messageId}\n` +
                        `🕐 *Detected At:* ${new Date().toLocaleString()}\n\n` +
                        `_This might be due to the message being sent before the bot started monitoring._`;

                    await this.bot.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                        text: unknownDeleteNotification
                    });
                    console.log('✅ ANTI-DELETE: Unknown deletion alert sent');
                }
            }
        } catch (error) {
            console.error('❌ ANTI-DELETE: Error handling message deletion:', error);
        }
    }

    /**
     * Send alert about deleted message to the owner
     */
    async sendDeletedMessageAlert(archivedMessage, chatJid) {
        try {
            // Get the actual sender JID from the archived message
            const senderJid = archivedMessage.participant_jid || archivedMessage.sender_jid;
            const senderNumber = senderJid.split('@')[0];
            
            // Get chat name/info
            const isGroup = chatJid.includes('@g.us');
            let groupName = '';
            
            if (isGroup) {
                try {
                    // Try to get group metadata
                    const groupMetadata = await this.bot.sock.groupMetadata(chatJid);
                    groupName = groupMetadata.subject || 'Unknown Group';
                } catch (error) {
                    console.log('Could not fetch group name:', error);
                    groupName = 'Group Chat';
                }
            }
            
            // Check if it's a media message first
            if (archivedMessage.media_url) {
                const mediaData = await this.bot.database.getArchivedMedia(archivedMessage.id);

                if (mediaData && mediaData.buffer && mediaData.buffer.length > 0) {
                    // Create media message with tagged format
                    // Tag area shows "deletedMessage" and group name if applicable
                    const tagText = isGroup ? `deletedMessage • ${groupName}` : 'deletedMessage';
                    
                    const mediaMessage = {
                        caption: archivedMessage.content || '',
                        contextInfo: {
                            quotedMessage: {
                                conversation: tagText
                            },
                            participant: senderJid,
                            remoteJid: senderJid,
                            fromMe: false,
                            quotedMessageId: archivedMessage.id
                        }
                    };

                    // Add media based on type
                    switch (archivedMessage.message_type) {
                        case 'imageMessage':
                            mediaMessage.image = mediaData.buffer;
                            break;
                        case 'videoMessage':
                            mediaMessage.video = mediaData.buffer;
                            break;
                        case 'audioMessage':
                            mediaMessage.audio = mediaData.buffer;
                            mediaMessage.mimetype = archivedMessage.media_type || 'audio/mpeg';
                            delete mediaMessage.caption; // Audio doesn't show captions well
                            break;
                        case 'documentMessage':
                            mediaMessage.document = mediaData.buffer;
                            mediaMessage.fileName = mediaData.filename;
                            mediaMessage.mimetype = archivedMessage.media_type || 'application/octet-stream';
                            break;
                        case 'stickerMessage':
                            mediaMessage.sticker = mediaData.buffer;
                            delete mediaMessage.caption; // Stickers don't have captions
                            break;
                    }

                    await this.bot.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, mediaMessage);
                    console.log(`📎 Recovered and sent deleted ${archivedMessage.message_type}`);
                } else {
                    // If media couldn't be recovered, send text notification
                    const tagText = isGroup ? `Deleted Media • ${groupName}` : 'Deleted Media';
                    
                    const alertMessage = {
                        text: `❌ Deleted ${(archivedMessage.message_type || 'media').replace('Message', '')} could not be recovered`,
                        contextInfo: {
                            quotedMessage: {
                                conversation: tagText
                            },
                            participant: senderJid,
                            remoteJid: senderJid,
                            fromMe: false,
                            quotedMessageId: archivedMessage.id
                        }
                    };
                    await this.bot.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, alertMessage);
                }
            } else {
                // For text messages, use the original format with group name in tag
                const alertText = archivedMessage.content || 'deletedMessage';
                const tagText = isGroup ? `deletedMessage • ${groupName}` : (archivedMessage.content || 'deletedMessage');

                const alertMessage = {
                    text: alertText,
                    contextInfo: {
                        quotedMessage: {
                            conversation: tagText
                        },
                        participant: senderJid,
                        remoteJid: senderJid,
                        fromMe: false,
                        quotedMessageId: archivedMessage.id
                    }
                };

                await this.bot.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, alertMessage);
            }

            console.log(`🗑️ Detected deleted message from ${senderNumber}`);

        } catch (error) {
            console.error('❌ ANTI-DELETE: Error sending deleted message alert:', error);
        }
    }

    /**
     * Check if chat should be ignored by anti-delete monitoring
     */
    shouldIgnoreChat(chatJid) {
        // Ignore status messages
        if (chatJid === 'status@broadcast' || chatJid.includes('status@broadcast')) {
            return true;
        }
        
        // Ignore newsletters and channels
        if (chatJid.includes('@newsletter') || chatJid.includes('@broadcast') || chatJid.includes('channel')) {
            return true;
        }
        
        // Monitor groups (@g.us), private chats (@s.whatsapp.net), and lid chats (@lid)
        const isGroup = chatJid.endsWith('@g.us');
        const isPrivateChat = chatJid.endsWith('@s.whatsapp.net');
        const isLidChat = chatJid.endsWith('@lid');
        
        return !(isGroup || isPrivateChat || isLidChat);
    }

    /**
     * Toggle anti-delete monitoring
     */
    async toggleAntiDelete(messageInfo) {
        try {
            const { args } = messageInfo;
            const status = args[0]?.toLowerCase();

            if (status === 'on') {
                config.ANTI_DELETE = true;
                await this.bot.messageHandler.reply(messageInfo, '✅ Anti-delete monitoring enabled');
            } else if (status === 'off') {
                config.ANTI_DELETE = false;
                await this.bot.messageHandler.reply(messageInfo, '❌ Anti-delete monitoring disabled');
            } else {
                const currentStatus = config.ANTI_DELETE ? 'ON' : 'OFF';
                await this.bot.messageHandler.reply(messageInfo,
                    `🗑️ *Anti-Delete Status:* ${currentStatus}\n\n` +
                    `Use \`${config.PREFIX}antidelete on\` or \`${config.PREFIX}antidelete off\` to toggle.`);
            }

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error toggling anti-delete.');
        }
    }

    /**
     * Get recent deleted messages
     */
    async getDeletedMessages(messageInfo) {
        try {
            const { args } = messageInfo;
            const limit = parseInt(args[0]) || 10;

            const deletedMessages = await this.bot.database.getRecentDeletedMessages(limit);

            if (deletedMessages.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '📭 No deleted messages found');
                return;
            }

            let report = `🗑️ *RECENT DELETED MESSAGES*\n\n`;

            deletedMessages.forEach((row, index) => {
                const sender = row.sender_jid.split('@')[0];
                const chat = row.chat_jid.split('@')[0];
                const deletedAt = new Date(row.deleted_at * 1000).toLocaleString();
                const content = row.content || 'No content';

                report += `*${index + 1}.* ${sender} in ${chat}\n`;
                report += `🕐 ${deletedAt}\n`;
                report += `📝 ${content.substring(0, 100)}${content.length > 100 ? '...' : ''}\n\n`;
            });

            await this.bot.messageHandler.reply(messageInfo, report);

        } catch (error) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving deleted messages.');
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AntiDeletePlugin();
        await plugin.init(bot);
        return plugin; // Return the plugin instance so it can be referenced
    }
};