/**
 * MATDEV JSON Storage Manager
 * JSON file-based persistent storage for anti-delete features
 */

const path = require('path');
const fs = require('fs-extra');
const Logger = require('./logger');

class JSONStorageManager {
    constructor() {
        this.logger = new Logger();
        this.storageDir = path.join(__dirname, '../session/storage');
        this.messagesFile = path.join(this.storageDir, 'messages.json');
        this.deletedMessagesFile = path.join(this.storageDir, 'deleted_messages.json');
        this.mediaDir = path.join(__dirname, '../session/media');
        
        // In-memory cache for faster access
        this.messages = new Map();
        this.deletedMessages = new Map();
    }

    /**
     * Initialize JSON storage
     */
    async initialize() {
        try {
            // Ensure storage directories exist
            await fs.ensureDir(this.storageDir);
            await fs.ensureDir(this.mediaDir);
            
            // Load existing data
            await this.loadMessages();
            await this.loadDeletedMessages();
            
            // Start automatic cleanup scheduler (every 6 hours)
            this.startCleanupScheduler();
            
            this.logger.success('📂 JSON Storage initialized successfully');
        } catch (error) {
            this.logger.error('JSON Storage initialization failed:', error);
            throw error;
        }
    }

    /**
     * Start automatic cleanup scheduler
     */
    startCleanupScheduler() {
        // Run cleanup every 6 hours
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cleanupOldMessages();
            } catch (error) {
                this.logger.error('Scheduled cleanup failed:', error);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours

        this.logger.info('🕐 Automatic storage cleanup scheduled every 6 hours');
    }

    /**
     * Load messages from JSON file
     */
    async loadMessages() {
        try {
            if (await fs.pathExists(this.messagesFile)) {
                const data = await fs.readJson(this.messagesFile);
                this.messages = new Map(Object.entries(data));
            }
        } catch (error) {
            this.logger.error('Error loading messages:', error);
            this.messages = new Map();
        }
    }

    /**
     * Load deleted messages from JSON file
     */
    async loadDeletedMessages() {
        try {
            if (await fs.pathExists(this.deletedMessagesFile)) {
                const data = await fs.readJson(this.deletedMessagesFile);
                this.deletedMessages = new Map(Object.entries(data));
            }
        } catch (error) {
            this.logger.error('Error loading deleted messages:', error);
            this.deletedMessages = new Map();
        }
    }

    /**
     * Save messages to JSON file
     */
    async saveMessages() {
        try {
            const data = Object.fromEntries(this.messages);
            await fs.writeJson(this.messagesFile, data, { spaces: 2 });
        } catch (error) {
            this.logger.error('Error saving messages:', error);
        }
    }

    /**
     * Save deleted messages to JSON file
     */
    async saveDeletedMessages() {
        try {
            const data = Object.fromEntries(this.deletedMessages);
            await fs.writeJson(this.deletedMessagesFile, data, { spaces: 2 });
        } catch (error) {
            this.logger.error('Error saving deleted messages:', error);
        }
    }

    /**
     * Archive a message with full media support
     */
    async archiveMessage(message) {
        try {
            const messageType = Object.keys(message.message || {})[0];
            const content = message.message[messageType];
            const text = content?.text || content?.caption || content || '';
            
            const sender = message.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const isStatus = sender === 'status@broadcast';
            
            // Enhanced participant extraction
            let participant = sender;
            if (isGroup || isStatus) {
                // Handle LID format participants
                if (message.key.participant) {
                    participant = message.key.participant;
                } else if (message.key.participantPn) {
                    participant = message.key.participantPn;
                } else if (message.key.participantLid) {
                    // Extract phone number from LID if available
                    const lidMatch = message.key.participantLid.match(/(\d+)@lid/);
                    if (lidMatch) {
                        participant = `${lidMatch[1]}@s.whatsapp.net`;
                    } else {
                        participant = message.key.participantLid;
                    }
                }
            }

            let mediaUrl = null;
            let mediaType = null;

            // Handle media messages
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            if (mediaTypes.includes(messageType)) {
                try {
                    const downloadResult = await this.downloadAndSaveMedia(message, messageType, isStatus);
                    if (downloadResult) {
                        mediaUrl = downloadResult.path;
                        mediaType = downloadResult.type;
                    }
                } catch (mediaError) {
                    this.logger.error(`Error downloading ${isStatus ? 'status ' : ''}media:`, mediaError);
                    // Continue without media but log the error
                }
            }
            
            // Fix sender_jid for outgoing messages
            let actualSender = sender;
            let actualParticipant = participant;
            
            if (message.key.fromMe) {
                // For outgoing messages, the sender is the bot/owner, not the recipient
                const botNumber = this.bot?.sock?.user?.id?.split(':')[0];
                if (botNumber) {
                    actualSender = `${botNumber}@s.whatsapp.net`;
                    actualParticipant = actualSender;
                }
            }

            const messageData = {
                id: message.key.id,
                chat_jid: sender,
                sender_jid: actualSender,
                participant_jid: actualParticipant,
                message_type: messageType,
                content: text,
                media_url: mediaUrl,
                media_type: mediaType,
                timestamp: message.messageTimestamp || Date.now(),
                is_deleted: false,
                created_at: Math.floor(Date.now() / 1000)
            };

            // Store in memory cache and save to file
            this.messages.set(message.key.id, messageData);
            await this.saveMessages();
            
            return true;
            
        } catch (error) {
            this.logger.error('Error archiving message:', error);
            return false;
        }
    }

    /**
     * Download and save media file
     */
    async downloadAndSaveMedia(message, messageType, isStatus = false) {
        try {
            const { downloadMediaMessage } = require('baileys');
            
            // Download media buffer with retry for status messages
            let buffer;
            let retries = isStatus ? 3 : 1;
            
            for (let i = 0; i < retries; i++) {
                try {
                    buffer = await downloadMediaMessage(message, 'buffer', {
                        reuploadRequest: this.bot?.sock?.sendMessage,
                    });
                    if (buffer) break;
                } catch (downloadError) {
                    this.logger.warn(`Media download attempt ${i + 1} failed:`, downloadError.message);
                    if (i === retries - 1) throw downloadError;
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
                }
            }
            
            if (!buffer) return null;

            // Generate unique filename
            const timestamp = Date.now();
            const messageId = message.key.id.replace(/[^a-zA-Z0-9]/g, '_');
            
            let extension = '';
            const content = message.message[messageType];
            
            // Determine file extension based on message type and mimetype
            if (content.mimetype) {
                const mimeToExt = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/gif': '.gif',
                    'image/webp': '.webp',
                    'video/mp4': '.mp4',
                    'video/3gpp': '.3gp',
                    'video/quicktime': '.mov',
                    'audio/mpeg': '.mp3',
                    'audio/ogg': '.ogg',
                    'audio/wav': '.wav',
                    'audio/aac': '.aac',
                    'application/pdf': '.pdf',
                    'application/msword': '.doc',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx'
                };
                extension = mimeToExt[content.mimetype] || '';
            }
            
            // Fallback extensions based on message type
            if (!extension) {
                const typeToExt = {
                    'imageMessage': '.jpg',
                    'videoMessage': '.mp4',
                    'audioMessage': '.mp3',
                    'documentMessage': '.bin',
                    'stickerMessage': '.webp'
                };
                extension = typeToExt[messageType] || '.bin';
            }

            const filename = `${timestamp}_${messageId}${extension}`;
            const filepath = path.join(this.mediaDir, filename);

            // Save file to disk
            await fs.writeFile(filepath, buffer);

            // Return relative path and media info
            return {
                path: `session/media/${filename}`,
                type: content.mimetype || messageType,
                size: buffer.length,
                filename: content.fileName || filename,
                duration: content.seconds || null,
                width: content.width || null,
                height: content.height || null
            };

        } catch (error) {
            this.logger.error('Error downloading media:', error);
            return null;
        }
    }

    /**
     * Retrieve archived message by ID
     */
    async getArchivedMessage(messageId) {
        const message = this.messages.get(messageId);
        return message && !message.is_deleted ? message : null;
    }

    /**
     * Get media file for archived message
     */
    async getArchivedMedia(messageId) {
        const message = await this.getArchivedMessage(messageId);
        if (!message || !message.media_url) return null;

        try {
            const mediaPath = path.join(__dirname, '..', message.media_url);
            const exists = await fs.pathExists(mediaPath);
            
            if (exists) {
                const buffer = await fs.readFile(mediaPath);
                return {
                    buffer,
                    type: message.media_type,
                    path: mediaPath,
                    filename: path.basename(mediaPath)
                };
            }
        } catch (error) {
            this.logger.error('Error retrieving archived media:', error);
        }
        
        return null;
    }

    /**
     * Mark message as deleted and store in deleted_messages
     */
    async markMessageDeleted(messageId, chatJid) {
        try {
            // First get the original message
            const originalMessage = await this.getArchivedMessage(messageId);
            if (!originalMessage) return false;
            
            // Mark as deleted in messages
            if (this.messages.has(messageId)) {
                this.messages.get(messageId).is_deleted = true;
                await this.saveMessages();
            }
            
            // Add to deleted messages
            const deletedData = {
                original_id: messageId,
                chat_jid: chatJid,
                sender_jid: originalMessage.sender_jid,
                content: originalMessage.content,
                media_info: JSON.stringify({
                    type: originalMessage.message_type,
                    media_url: originalMessage.media_url
                }),
                deleted_at: Math.floor(Date.now() / 1000)
            };
            
            this.deletedMessages.set(messageId, deletedData);
            await this.saveDeletedMessages();
            
            return true;
            
        } catch (error) {
            this.logger.error('Error marking message as deleted:', error);
            return false;
        }
    }

    /**
     * Get recent messages from a chat (for anti-delete)
     */
    async getRecentMessages(chatJid, limit = 50) {
        try {
            const chatMessages = Array.from(this.messages.values())
                .filter(msg => msg.chat_jid === chatJid)
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, limit);
                
            return chatMessages;
        } catch (error) {
            this.logger.error('Error getting recent messages:', error);
            return [];
        }
    }

    /**
     * Get recent deleted messages
     */
    async getRecentDeletedMessages(limit = 10) {
        try {
            const deletedMessages = Array.from(this.deletedMessages.values())
                .sort((a, b) => b.deleted_at - a.deleted_at)
                .slice(0, limit);
                
            return deletedMessages;
        } catch (error) {
            this.logger.error('Error getting deleted messages:', error);
            return [];
        }
    }

    /**
     * Cleanup old messages and media files with different retention periods
     */
    async cleanupOldMessages() {
        try {
            const now = Math.floor(Date.now() / 1000);
            const oneDayAgo = now - (24 * 60 * 60); // 24 hours
            const threeDaysAgo = now - (3 * 24 * 60 * 60); // 72 hours
            
            let deletedFiles = 0;
            let deletedMessages = 0;

            // Get all messages for cleanup analysis
            const allMessages = Array.from(this.messages.entries());

            for (const [id, msg] of allMessages) {
                let shouldDelete = false;
                
                // Determine cleanup policy based on chat type
                if (msg.chat_jid === 'status@broadcast') {
                    // Status media - delete after 24 hours
                    shouldDelete = msg.created_at < oneDayAgo;
                } else if (msg.chat_jid.includes('@newsletter') || msg.chat_jid.includes('@broadcast') || msg.chat_jid.includes('channel')) {
                    // Channel media and messages - delete after 24 hours
                    shouldDelete = msg.created_at < oneDayAgo;
                } else if (msg.chat_jid.endsWith('@g.us') || msg.chat_jid.endsWith('@s.whatsapp.net')) {
                    // Private chat and group messages/media - delete after 72 hours (3 days)
                    shouldDelete = msg.created_at < threeDaysAgo;
                }

                if (shouldDelete && !msg.is_deleted) {
                    // Delete media file from disk if exists
                    if (msg.media_url) {
                        try {
                            const filePath = path.join(__dirname, '..', msg.media_url);
                            if (await fs.pathExists(filePath)) {
                                await fs.remove(filePath);
                                deletedFiles++;
                            }
                        } catch (fileError) {
                            this.logger.error('Error deleting media file:', fileError);
                        }
                    }
                    
                    // Remove from memory and increment counter
                    this.messages.delete(id);
                    deletedMessages++;
                }
            }

            // Save updated messages
            await this.saveMessages();

            if (deletedMessages > 0) {
                this.logger.info(`🗑️ Cleaned up ${deletedMessages} old messages and ${deletedFiles} media files`);
                this.logger.info(`📊 Cleanup policy: Status(24h), Channels(24h), Private/Groups(72h)`);
            }

            return true;
        } catch (error) {
            this.logger.error('Error during cleanup:', error);
            return false;
        }
    }

    /**
     * Get storage statistics
     */
    async getStorageStats() {
        try {
            const totalMessages = this.messages.size;
            const mediaMessages = Array.from(this.messages.values()).filter(msg => msg.media_url).length;
            const deletedMessagesCount = Array.from(this.messages.values()).filter(msg => msg.is_deleted).length;
            const totalDeletedMessages = this.deletedMessages.size;

            // Calculate media directory size
            let totalMediaSize = 0;
            try {
                if (await fs.pathExists(this.mediaDir)) {
                    const files = await fs.readdir(this.mediaDir);
                    for (const file of files) {
                        const stats = await fs.stat(path.join(this.mediaDir, file));
                        totalMediaSize += stats.size;
                    }
                }
            } catch (sizeError) {
                this.logger.error('Error calculating media size:', sizeError);
            }

            return {
                total_messages: totalMessages,
                media_messages: mediaMessages,
                deleted_messages: deletedMessagesCount,
                total_deleted_tracked: totalDeletedMessages,
                total_media_files: mediaMessages,
                media_size_bytes: totalMediaSize,
                media_size_mb: (totalMediaSize / (1024 * 1024)).toFixed(2)
            };
        } catch (error) {
            this.logger.error('Error getting storage stats:', error);
            return null;
        }
    }

    /**
     * Close storage (save any pending data)
     */
    async close() {
        try {
            // Clear cleanup interval
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
            }
            
            await this.saveMessages();
            await this.saveDeletedMessages();
            this.logger.info('📂 JSON Storage closed and saved');
        } catch (error) {
            this.logger.error('Error closing storage:', error);
        }
    }
}

module.exports = JSONStorageManager;