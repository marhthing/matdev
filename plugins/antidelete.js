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
        // Check if socket is available now
        if (this.bot.sock && this.bot.sock.ev) {
            this.bot.sock.ev.on('messages.update', this.handleMessageUpdates.bind(this));
            console.log('✅ Anti-delete event listeners attached');
            return;
        }

        // Wait for socket to be available
        const checkSocket = () => {
            if (this.bot.sock && this.bot.sock.ev) {
                this.bot.sock.ev.on('messages.update', this.handleMessageUpdates.bind(this));
                console.log('✅ Anti-delete event listeners attached');
            } else {
                // Check again in 1 second
                setTimeout(checkSocket, 1000);
            }
        };

        // Start checking for socket availability
        setTimeout(checkSocket, 100);
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
     * Handle message updates (deletions)
     */
    async handleMessageUpdates(updates) {
        for (const update of updates) {
            if (update.update?.messageStubType === 68) { // Message deleted
                await this.handleDeletedMessage(update);
            }
        }
    }

    /**
     * Handle deleted message
     */
    async handleDeletedMessage(update) {
        try {
            const messageId = update.key.id;
            const chatJid = update.key.remoteJid;

            // Try to get the original message from database
            const archivedMessage = await this.bot.database.getArchivedMessage(messageId);

            if (archivedMessage && config.OWNER_NUMBER) {
                // Mark as deleted in database
                await this.bot.database.markMessageDeleted(messageId, chatJid);

                // Format the anti-delete notification
                const chatName = chatJid.endsWith('@g.us') ? 
                    chatJid.split('@')[0] : 
                    archivedMessage.sender_jid.split('@')[0];

                const senderName = archivedMessage.participant_jid ? 
                    archivedMessage.participant_jid.split('@')[0] : 
                    archivedMessage.sender_jid.split('@')[0];

                const deleteNotification = `🗑️ *DELETED MESSAGE DETECTED*\n\n` +
                    `👤 *Sender:* ${senderName}\n` +
                    `💬 *Chat:* ${chatName}\n` +
                    `📅 *Original Time:* ${new Date(archivedMessage.timestamp).toLocaleString()}\n` +
                    `🕐 *Deleted At:* ${new Date().toLocaleString()}\n\n` +
                    `📝 *Content:*\n${archivedMessage.content || 'No text content'}\n\n` +
                    `_Anti-delete detection by MATDEV_`;

                // Send to owner
                await this.bot.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                    text: deleteNotification
                });

                // If message had media, try to recover and send it
                if (archivedMessage.media_url) {
                    const mediaData = await this.bot.database.getArchivedMedia(messageId);

                    if (mediaData) {
                        const mediaMessage = {
                            caption: `📎 *Recovered Media*\n\nThis ${archivedMessage.message_type.replace('Message', '')} was deleted from the above message.`
                        };

                        // Send media based on type
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
                        this.bot.logger.success(`📎 Recovered and sent deleted ${archivedMessage.message_type}`);
                    } else {
                        await this.bot.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                            text: `❌ Media file could not be recovered (file may have been corrupted or deleted from disk)`
                        });
                    }
                }

                this.bot.logger.info(`🗑️ Detected deleted message from ${senderName} in ${chatName}`);
            }

        } catch (error) {
            this.bot.logger.error('Error handling deleted message:', error);
        }
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
    }
};