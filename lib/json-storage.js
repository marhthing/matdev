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
        this.permissionsFile = path.join(this.storageDir, 'permissions.json');
        this.mediaDir = path.join(__dirname, '../session/media');

        // In-memory cache for faster access
        this.messages = new Map();
        this.deletedMessages = new Map();
        this.permissions = new Map(); // Structure: Map(jid -> Set(commands))
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
            await this.loadPermissions();

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
     * Load permissions from JSON file
     */
    async loadPermissions() {
        try {
            if (await fs.pathExists(this.permissionsFile)) {
                const data = await fs.readJson(this.permissionsFile);
                this.permissions = new Map();
                for (const [jid, commands] of Object.entries(data)) {
                    this.permissions.set(jid, new Set(commands));
                }
            }
        } catch (error) {
            this.logger.error('Error loading permissions:', error);
            this.permissions = new Map();
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
     * Save permissions to JSON file
     */
    async savePermissions() {
        try {
            const data = {};
            for (const [jid, commands] of this.permissions.entries()) {
                data[jid] = Array.from(commands);
            }
            await fs.writeJson(this.permissionsFile, data, { spaces: 2 });
        } catch (error) {
            this.logger.error('Error saving permissions:', error);
        }
    }

    /**
     * Archive a message with full media support
     */
    async archiveMessage(message) {
        try {
            const messageType = Object.keys(message.message || {})[0];
            const content = message.message[messageType];
            
            // Extract text based on message type
            let text = '';
            if (typeof content === 'string') {
                text = content; // For conversation messages
            } else if (content?.text) {
                text = content.text; // For extendedTextMessage
            } else if (content?.caption) {
                text = content.caption; // For media with caption
            }

            const sender = message.key.remoteJid;
            const isGroup = sender.endsWith('@g.us');
            const isStatus = sender === 'status@broadcast';
            const isNewsletter = sender.includes('@newsletter');

            // Skip meaningless WhatsApp notifications and system messages
            if (messageType === 'protocolMessage') {
                const protocolType = content?.type;
                const ignoredProtocolTypes = [
                    'INITIAL_SECURITY_NOTIFICATION_SETTING_SYNC',
                    'APP_STATE_SYNC_KEY_SHARE',
                    'APP_STATE_SYNC_KEY_REQUEST',
                    'PEER_DATA_OPERATION_REQUEST_RESPONSE_MESSAGE',
                    'HISTORY_SYNC_NOTIFICATION',
                    'SESSION_EXTENSION',
                    'EPHEMERAL_SETTING'
                ];
                
                if (ignoredProtocolTypes.includes(protocolType)) {
                    this.logger.debug(`Skipping protocol message: ${protocolType}`);
                    return true; // Skip archiving but return success
                }
                
                // IMPORTANT: Don't skip REVOKE messages - they are needed for anti-delete feature
                if (protocolType === 'REVOKE') {
                    this.logger.info(`🗑️ Archiving deletion notification for anti-delete feature`);
                    // Continue with normal archiving process for REVOKE messages
                }
            }

            // Skip system messages with no content
            const systemMessageTypes = ['reactionMessage', 'pollUpdateMessage', 'receiptMessage'];
            if (systemMessageTypes.includes(messageType)) {
                this.logger.debug(`Skipping system message type: ${messageType}`);
                return true;
            }

            // Check for media and text content
            const supportedMediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            const hasMedia = supportedMediaTypes.includes(messageType);
            const hasText = text && text.trim().length > 0;

            // Skip newsletter messages without meaningful content (but allow media messages)
            if (isNewsletter && !hasText && !hasMedia) {
                this.logger.debug(`Skipping empty newsletter message from: ${sender}`);
                return true;
            }
            
            if (!hasMedia && !hasText && messageType !== 'protocolMessage') {
                this.logger.debug(`Skipping message with no content, type: ${messageType}`);
                return true;
            }

            // Special logging for status messages to track what's happening
            if (isStatus) {
                const fromOwner = message.key.fromMe ? '(from owner)' : '(from others)';
                this.logger.info(`📱 Processing status message ${fromOwner}, type: ${messageType}, hasMedia: ${hasMedia}, hasText: ${hasText}`);
            }

            // Enhanced participant extraction - handle business accounts properly
            let participant = sender;
            
            // For business accounts (@lid), use the actual phone number
            if (message.key.senderPn && sender.endsWith('@lid')) {
                participant = message.key.senderPn;
            } else if (isGroup || isStatus) {
                if (message.key.participant) {
                    participant = message.key.participant;
                } else if (message.key.participantPn) {
                    participant = message.key.participantPn;
                } else if (message.key.participantLid) {
                    participant = message.key.participantLid;
                }
            }

            let mediaUrl = null;
            let mediaType = null;

            // Handle media messages
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            if (mediaTypes.includes(messageType)) {
                // Log video download attempts for debugging
                if (messageType === 'videoMessage') {
                    const content = message.message[messageType];
                    this.logger.info(`🎥 Attempting video download:`, {
                        messageId: message.key.id,
                        sender: message.key.remoteJid,
                        isChannel: message.key.remoteJid?.includes('@newsletter'),
                        fileSize: content?.fileLength,
                        mimetype: content?.mimetype,
                        duration: content?.seconds
                    });
                }
                try {
                    const downloadResult = await this.downloadAndSaveMedia(message, messageType, isStatus);
                    if (downloadResult) {
                        mediaUrl = downloadResult.path;
                        mediaType = downloadResult.type;
                    }
                } catch (mediaError) {
                    const content = message.message[messageType];
                    const isNewsletter = message.key.remoteJid?.includes('@newsletter');
                    
                    if (isNewsletter && mediaError.message?.includes('empty media key')) {
                        this.logger.warn(`⚠️ Newsletter media download failed (known Baileys issue):`, {
                            messageId: message.key.id,
                            sender: message.key.remoteJid,
                            messageType,
                            note: 'Newsletter media downloads have known issues in current Baileys version'
                        });
                    } else {
                        this.logger.error(`❌ Failed to download ${messageType}:`, {
                            error: mediaError.message,
                            messageId: message.key.id,
                            sender: message.key.remoteJid,
                            participant: message.key.participant,
                            isStatus: isStatus,
                            isChannel: isNewsletter,
                            hasUrl: !!content?.url,
                            fileSize: content?.fileLength,
                            mimetype: content?.mimetype,
                            duration: content?.seconds
                        });
                    }
                    // Continue without media but log the error
                }
            }

            // Fix sender_jid for all message types
            let actualSender = sender;
            let actualParticipant = participant;

            if (message.key.fromMe) {
                // For outgoing messages, store the correct sender JID
                const botNumber = this.bot?.sock?.user?.id?.split(':')[0];
                if (isGroup && participant) {
                    // In groups, when fromMe=true, the participant is the owner's group JID (LID format)
                    actualSender = participant; // This will be the LID format like 185534701924401@lid
                    actualParticipant = participant;
                    
                    // Store owner's group LID for future reference
                    if (this.bot && botNumber && participant.includes('@lid')) {
                        this.bot.ownerGroupJid = participant;
                        this.logger.info(`📝 Stored owner's group JID: ${participant}`);
                    }
                } else if (botNumber) {
                    // For private chats or when no participant
                    actualSender = `${botNumber}@s.whatsapp.net`;
                    actualParticipant = actualSender;
                }
            } else {
                // For incoming messages, ensure sender_jid is the actual sender
                if (isGroup || isStatus) {
                    // In groups/status, participant is the actual sender (use already processed participant)
                    actualSender = participant;
                } else {
                    // In private chats, sender (remoteJid) is the actual sender
                    actualSender = sender;
                    // Use the already processed participant (which handles business accounts correctly)
                    actualParticipant = participant;
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
                from_me: message.key.fromMe || false, // Store the from_me flag for anti-delete
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

            // Download media buffer with retry for status messages and videos
            let buffer;
            let retries = isStatus ? 3 : (messageType === 'videoMessage' ? 3 : 1);

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
     * Add permission for a user to use a command
     */
    async addPermission(jid, command) {
        try {
            if (!this.permissions.has(jid)) {
                this.permissions.set(jid, new Set());
            }
            this.permissions.get(jid).add(command);
            await this.savePermissions();
            this.logger.info(`✅ Permission added: ${jid} can now use .${command}`);
            return true;
        } catch (error) {
            this.logger.error('Error adding permission:', error);
            return false;
        }
    }

    /**
     * Remove permission for a user to use a command
     */
    async removePermission(jid, command) {
        try {
            if (!this.permissions.has(jid)) {
                return false; // User has no permissions
            }
            
            const userCommands = this.permissions.get(jid);
            const removed = userCommands.delete(command);
            
            // If user has no more permissions, remove them entirely
            if (userCommands.size === 0) {
                this.permissions.delete(jid);
            }
            
            await this.savePermissions();
            if (removed) {
                this.logger.info(`❌ Permission removed: ${jid} can no longer use .${command}`);
            }
            return removed;
        } catch (error) {
            this.logger.error('Error removing permission:', error);
            return false;
        }
    }

    /**
     * Check if a user has permission to use a command
     */
    hasPermission(jid, command) {
        try {
            if (!this.permissions.has(jid)) {
                return false;
            }
            return this.permissions.get(jid).has(command);
        } catch (error) {
            this.logger.error('Error checking permission:', error);
            return false;
        }
    }

    /**
     * Get all permissions for a user
     */
    getUserPermissions(jid) {
        try {
            if (!this.permissions.has(jid)) {
                return [];
            }
            return Array.from(this.permissions.get(jid));
        } catch (error) {
            this.logger.error('Error getting user permissions:', error);
            return [];
        }
    }

    /**
     * Get all users with their permissions
     */
    getAllPermissions() {
        try {
            const result = {};
            for (const [jid, commands] of this.permissions.entries()) {
                result[jid] = Array.from(commands);
            }
            return result;
        } catch (error) {
            this.logger.error('Error getting all permissions:', error);
            return {};
        }
    }

    /**
     * Remove all permissions for a user
     */
    async removeAllPermissions(jid) {
        try {
            const removed = this.permissions.delete(jid);
            if (removed) {
                await this.savePermissions();
                this.logger.info(`🗑️ All permissions removed for: ${jid}`);
            }
            return removed;
        } catch (error) {
            this.logger.error('Error removing all permissions:', error);
            return false;
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
            await this.savePermissions();
            this.logger.info('📂 JSON Storage closed and saved');
        } catch (error) {
            this.logger.error('Error closing storage:', error);
        }
    }
}

module.exports = JSONStorageManager;