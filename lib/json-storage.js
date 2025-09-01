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
            
            this.logger.success('📂 JSON Storage initialized successfully');
        } catch (error) {
            this.logger.error('JSON Storage initialization failed:', error);
            throw error;
        }
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
            const participant = isGroup ? message.key.participant : sender;

            let mediaUrl = null;
            let mediaType = null;

            // Handle media messages
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            if (mediaTypes.includes(messageType)) {
                try {
                    const downloadResult = await this.downloadAndSaveMedia(message, messageType);
                    if (downloadResult) {
                        mediaUrl = downloadResult.path;
                        mediaType = downloadResult.type;
                    }
                } catch (mediaError) {
                    this.logger.error('Error downloading media:', mediaError);
                    // Continue without media but log the error
                }
            }
            
            const messageData = {
                id: message.key.id,
                chat_jid: sender,
                sender_jid: sender,
                participant_jid: participant,
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
    async downloadAndSaveMedia(message, messageType) {
        try {
            const { downloadMediaMessage } = require('baileys');
            
            // Download media buffer
            const buffer = await downloadMediaMessage(message, 'buffer', {});
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
     * Cleanup old messages and media files (keep last 30 days)
     */
    async cleanupOldMessages() {
        try {
            const thirtyDaysAgo = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60);
            let deletedFiles = 0;
            let deletedMessages = 0;

            // Get messages older than 30 days
            const oldMessages = Array.from(this.messages.entries())
                .filter(([id, msg]) => msg.created_at < thirtyDaysAgo && !msg.is_deleted);

            // Delete media files from disk
            for (const [id, msg] of oldMessages) {
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

            // Save updated messages
            await this.saveMessages();

            if (deletedMessages > 0) {
                this.logger.info(`🗑️ Cleaned up ${deletedMessages} old messages and ${deletedFiles} media files`);
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
            await this.saveMessages();
            await this.saveDeletedMessages();
            this.logger.info('📂 JSON Storage closed and saved');
        } catch (error) {
            this.logger.error('Error closing storage:', error);
        }
    }
}

module.exports = JSONStorageManager;