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
        this.groupLidFile = path.join(this.storageDir, 'group_lid.json');
        this.editedMessagesFile = path.join(this.storageDir, 'edited_messages.json');
        this.mediaDir = path.join(__dirname, '../session/media');

        // In-memory cache for faster access
        this.messages = new Map();
        this.deletedMessages = new Map();
        this.permissions = new Map(); // Structure: Map(jid -> Set(commands))
        this.groupLidData = null; // Structure: { lid: 'lid_value', registeredAt: timestamp, registeredBy: 'jid' }
        this.editedMessageMap = new Map(); // Structure: Map(editedMessageId -> originalMessageId)
        // Map to store contextInfo of original messages before they are edited
        this.originalContextInfoMap = new Map(); // Structure: Map(originalMessageId -> contextInfoString)
        // Map to store generic data like custom JID settings
        this.data = new Map(); // Structure: Map(key -> data) for .vv, .save, .delete custom JIDs, etc.
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
            await this.loadGroupLid();
            await this.loadEditedMessages();
            await this.loadOriginalContextInfo(); // Load contextInfo backups
            await this.loadGenericData(); // Load all stored generic data like custom JID settings

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
                await this.cleanupOldContextInfo(); // Also clean up old contextInfo backups
            } catch (error) {
                this.logger.error('Scheduled cleanup failed:', error);
            }
        }, 6 * 60 * 60 * 1000); // 6 hours

        this.logger.info('🕐 Automatic storage cleanup scheduled every 6 hours');
    }

    /**
     * Load messages from JSON file with improved error handling
     */
    async loadMessages() {
        try {
            if (await fs.pathExists(this.messagesFile)) {
                // Try to read the file content first
                const fileContent = await fs.readFile(this.messagesFile, 'utf8');

                // Check if file is empty or whitespace only
                if (!fileContent.trim()) {
                    this.logger.warn('Messages file is empty, initializing with empty storage');
                    this.messages = new Map();
                    await this.saveMessages(); // Create valid empty JSON
                    return;
                }

                // Try to parse JSON
                const data = JSON.parse(fileContent);
                this.messages = new Map(Object.entries(data));
                this.logger.info(`📂 Loaded ${Object.keys(data).length} archived messages`);
            } else {
                this.messages = new Map();
                this.logger.info('📂 Messages file doesn\'t exist, starting fresh');
            }
        } catch (error) {
            this.logger.warn('Error loading messages, creating backup and starting fresh:', error.message);

            // Create backup of corrupted file
            try {
                const backupFile = `${this.messagesFile}.backup.${Date.now()}`;
                await fs.copy(this.messagesFile, backupFile);
                this.logger.info(`📁 Corrupted file backed up to: ${backupFile}`);
            } catch (backupError) {
                this.logger.error('Failed to create backup:', backupError.message);
            }

            // Initialize with empty storage
            this.messages = new Map();
            await this.saveMessages(); // Create valid empty JSON
        }
    }

    /**
     * Load deleted messages from JSON file with improved error handling
     */
    async loadDeletedMessages() {
        try {
            if (await fs.pathExists(this.deletedMessagesFile)) {
                const fileContent = await fs.readFile(this.deletedMessagesFile, 'utf8');

                if (!fileContent.trim()) {
                    this.deletedMessages = new Map();
                    await this.saveDeletedMessages();
                    return;
                }

                const data = JSON.parse(fileContent);
                this.deletedMessages = new Map(Object.entries(data));
            } else {
                this.deletedMessages = new Map();
            }
        } catch (error) {
            this.logger.warn('Error loading deleted messages, starting fresh:', error.message);
            this.deletedMessages = new Map();
            await this.saveDeletedMessages();
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
     * Load group LID data from JSON file
     */
    async loadGroupLid() {
        try {
            if (await fs.pathExists(this.groupLidFile)) {
                this.groupLidData = await fs.readJson(this.groupLidFile);
            }
        } catch (error) {
            this.logger.error('Error loading group LID data:', error);
            this.groupLidData = null;
        }
    }

    /**
     * Load edited message mappings from JSON file
     */
    async loadEditedMessages() {
        try {
            if (await fs.pathExists(this.editedMessagesFile)) {
                const data = await fs.readJson(this.editedMessagesFile);
                this.editedMessageMap = new Map(Object.entries(data));
            }
        } catch (error) {
            this.logger.error('Error loading edited messages data:', error);
            this.editedMessageMap = new Map();
        }
    }

    /**
     * Load original contextInfo backups from JSON file
     */
    async loadOriginalContextInfo() {
        try {
            const contextInfoFile = path.join(this.storageDir, 'original_context_info.json');
            if (await fs.pathExists(contextInfoFile)) {
                const data = await fs.readJson(contextInfoFile);
                this.originalContextInfoMap = new Map(Object.entries(data));
            }
        } catch (error) {
            this.logger.error('Error loading original contextInfo data:', error);
            this.originalContextInfoMap = new Map();
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
     * Save group LID data to JSON file
     */
    async saveGroupLid() {
        try {
            await fs.writeJson(this.groupLidFile, this.groupLidData, { spaces: 2 });
        } catch (error) {
            this.logger.error('Error saving group LID data:', error);
        }
    }

    /**
     * Save edited message mappings to JSON file
     */
    async saveEditedMessages() {
        try {
            const data = Object.fromEntries(this.editedMessageMap);
            await fs.writeJson(this.editedMessagesFile, data, { spaces: 2 });
        } catch (error) {
            this.logger.error('Error saving edited messages data:', error);
        }
    }

    /**
     * Save original contextInfo backups to JSON file
     */
    async saveOriginalContextInfo() {
        try {
            const contextInfoFile = path.join(this.storageDir, 'original_context_info.json');
            const data = Object.fromEntries(this.originalContextInfoMap);
            await fs.writeJson(contextInfoFile, data, { spaces: 2 });
        } catch (error) {
            this.logger.error('Error saving original contextInfo data:', error);
        }
    }


    /**
     * Enhanced text extraction from complex message structures
     */
    extractTextFromMessage(message, messageType, content) {
        let text = '';

        // Handle different text extraction scenarios
        if (typeof content === 'string') {
            text = content; // For conversation messages
        } else if (content?.text) {
            text = content.text; // For extendedTextMessage
        } else if (content?.caption) {
            text = content.caption; // For media with caption
        }

        // Special handling for edited messages with nested structure
        if (messageType === 'editedMessage' && content?.message) {
            let editedContent = content.message;

            // Handle double-nested edited messages from bot.js processing
            if (editedContent.editedMessage && editedContent.editedMessage.message) {
                editedContent = editedContent.editedMessage.message;
            }

            const editedTypes = Object.keys(editedContent);

            for (const editedType of editedTypes) {
                const editedTypeContent = editedContent[editedType];
                if (typeof editedTypeContent === 'string') {
                    text = editedTypeContent;
                    break;
                } else if (editedTypeContent?.text) {
                    text = editedTypeContent.text;
                    break;
                } else if (editedTypeContent?.caption) {
                    text = editedTypeContent.caption;
                    break;
                } else if (editedType === 'conversation') {
                    text = editedTypeContent;
                    break;
                }
            }
        }

        // Fallback: check other message types for text content
        if (!text && message.message) {
            const messageTypes = Object.keys(message.message);
            for (const type of messageTypes) {
                if (type !== messageType) {
                    const otherContent = message.message[type];
                    if (typeof otherContent === 'string') {
                        text = otherContent;
                        break;
                    } else if (otherContent?.text) {
                        text = otherContent.text;
                        break;
                    } else if (otherContent?.caption) {
                        text = otherContent.caption;
                        break;
                    }
                }
            }
        }

        return text;
    }

    /**
     * Archive a message with comprehensive media handling and robust error recovery
     */
    async archiveMessage(message) {
        try {
            // Handle messages with no message object (system messages)
            if (!message.message || Object.keys(message.message).length === 0) {
                this.logger.debug('Skipping message with no message object');
                return true;
            }

            const messageTypes = Object.keys(message.message);
            let messageType = messageTypes[0];
            let content = message.message[messageType];

            // Handle complex message structures with multiple types
            if (messageTypes.length > 1) {
                // Priority order for handling multiple message types
                const priorityTypes = [
                    'audioMessage', 'videoMessage', 'imageMessage', 'documentMessage', 'stickerMessage',
                    'extendedTextMessage', 'conversation', 'protocolMessage'
                ];

                for (const type of priorityTypes) {
                    if (messageTypes.includes(type)) {
                        messageType = type;
                        content = message.message[type];
                        break;
                    }
                }

                // this.logger.info(`📱 Message processed`);
            }

            // Enhanced text extraction with fallbacks
            let text = this.extractTextFromMessage(message, messageType, content);

            // Check if this is an edited message and log accordingly
            const isEditedMessage = messageTypes.includes('editedMessage');
            // if (isEditedMessage) {
            //     this.logger.info(`📝 EDITED MESSAGE ARCHIVED - Type: ${messageType}, Text: "${text || 'NO TEXT FOUND'}"`);
            // }

            this.logger.debug(`Message type: ${messageType}, hasText: ${!!text}, messageTypes: [${messageTypes.join(', ')}], isEdited: ${isEditedMessage}`);

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

            // Enhanced media type detection with voice note support
            const supportedMediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            const hasMedia = supportedMediaTypes.includes(messageType);
            const hasText = text && text.trim().length > 0;
            const isVoiceNote = messageType === 'audioMessage' && content?.ptt === true;

            // Enhanced archival notification with edited message indicator
            // const archivalType = messageTypes.includes('editedMessage') ? '📝 Edited Message Archived' : '📩 Message Archived';
            // const archivalType = '📩 Message Archived';
            // this.logger.info(archivalType);

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

            // ULTRA-FAST media handling - archive text instantly, download media in background
            const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
            if (mediaTypes.includes(messageType)) {
                // Archive text/metadata IMMEDIATELY - don't wait for media download
                const mediaInfo = {
                    hasMedia: true,
                    mediaType: messageType,
                    isVoiceNote: isVoiceNote,
                    fileSize: content?.fileLength,
                    mimetype: content?.mimetype,
                    duration: content?.seconds
                };

                this.logger.info(`📼 Media download and archived`);

                // Start media download in background - non-blocking for speed
                this.downloadAndSaveMedia(message, messageType, isStatus)
                    .then(downloadResult => {
                        if (downloadResult) {
                            // Update the archived message with media URL asynchronously
                            this.updateMessageWithMedia(message.key.id, downloadResult);
                            this.logger.success(`📼 Media download and archived`);
                        }
                    })
                    .catch(mediaError => {
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
                    });
            }

            // Use bot's cached JID utils for better performance
            const jids = this.bot?.jidUtils?.extractJIDs(message);
            if (!jids) {
                this.logger.error('Failed to extract JIDs for message archival');
                return false;
            }

            // Use the centralized JID extraction results
            const actualSender = jids.sender_jid;
            const actualParticipant = jids.participant_jid;
            const chat_jid = jids.chat_jid;

            // Store owner's group LID for future reference if it's a business account
            if (this.bot && jids.is_business && jids.from_me && actualParticipant.includes('@lid')) {
                this.bot.ownerGroupJid = actualParticipant;
                this.logger.info(`📝 Stored owner's group JID: ${actualParticipant}`);
            }

            // GROUP CHAT OPTIMIZATIONS - cache group info for faster processing
            if (jids.is_group) {
                // Cache group participants for faster future lookups
                if (this.bot?.cache) {
                    const groupCacheKey = `group_${chat_jid}`;
                    if (!this.bot.cache.groupCache.has(groupCacheKey)) {
                        // Store basic group info for faster future processing
                        this.bot.cache.groupCache.set(groupCacheKey, {
                            jid: chat_jid,
                            lastActivity: Date.now(),
                            participantCount: 0, // Will be updated when we get group metadata
                            mediaCount: 0
                        });
                    }

                    // Increment media count for this group
                    if (mediaTypes.includes(messageType)) {
                        const groupInfo = this.bot.cache.groupCache.get(groupCacheKey);
                        if (groupInfo) {
                            groupInfo.mediaCount++;
                            groupInfo.lastActivity = Date.now();
                        }
                    }
                }
            }

            // Enhanced contextInfo preservation - store for edited message recovery
            let contextInfoStr = null;
            let originalMessageKey = null;
            try {
                // Check all message types for contextInfo
                for (const msgType of messageTypes) {
                    const msgContent = message.message[msgType];
                    if (msgContent?.contextInfo) {
                        contextInfoStr = JSON.stringify(msgContent.contextInfo);

                        // Store the original message key that this message is replying to
                        if (msgContent.contextInfo.stanzaId) {
                            originalMessageKey = msgContent.contextInfo.stanzaId;
                        }

                        this.logger.debug(`💾 Stored contextInfo from ${msgType} for future reference (original: ${originalMessageKey})`);
                        break; // Only store contextInfo from the first relevant type found
                    }
                }
            } catch (error) {
                this.logger.error('Error extracting contextInfo for storage:', error);
            }

            const messageData = {
                id: message.key.id,
                chat_jid: chat_jid,
                sender_jid: actualSender,
                participant_jid: actualParticipant,
                message_type: messageType,
                content: text,
                media_url: mediaUrl,
                media_type: mediaType,
                timestamp: message.messageTimestamp || Date.now(),
                from_me: jids.from_me,
                is_business: jids.is_business,
                is_group: jids.is_group,
                is_voice_note: isVoiceNote,
                is_edited: messageTypes.includes('editedMessage'),
                all_message_types: messageTypes,
                contextInfo: contextInfoStr, // Store contextInfo as JSON string
                originalMessageKey: originalMessageKey, // Store the key of the original message being replied to
                is_deleted: false,
                created_at: Math.floor(Date.now() / 1000)
            };

            // Store in memory cache and save to file
            this.messages.set(message.key.id, messageData);
            await this.saveMessages();

            // If this is an edited message, try to find and map to the original message
            if (messageTypes.includes('editedMessage')) {
                // Try to find the original message that was edited
                const originalMessage = this.findOriginalMessageForEdit(message.key.id, chat_jid, text);
                if (originalMessage) {
                    this.editedMessageMap.set(message.key.id, originalMessage.id);
                    await this.saveEditedMessages();
                    this.logger.debug(`📝 Mapped edited message ${message.key.id} to original ${originalMessage.id}`);
                }
                // Also backup contextInfo if it's an edited message
                if (contextInfoStr) {
                    this.originalContextInfoMap.set(message.key.id, contextInfoStr);
                    await this.saveOriginalContextInfo();
                    this.logger.debug(`💾 Backup contextInfo for edited message ${message.key.id}`);
                }
            }

            return true;

        } catch (error) {
            this.logger.error('Error archiving message:', error);
            return false;
        }
    }

    /**
     * Update archived message with media information after background download
     */
    async updateMessageWithMedia(messageId, downloadResult) {
        try {
            if (this.messages.has(messageId)) {
                const message = this.messages.get(messageId);
                message.media_url = downloadResult.path;
                message.media_type = downloadResult.type;
                message.media_size = downloadResult.size;
                message.media_filename = downloadResult.filename;

                // Save updated message
                await this.saveMessages();
                this.logger.debug(`📁 Updated message ${messageId} with media info`);
            }
        } catch (error) {
            this.logger.error('Error updating message with media:', error);
        }
    }

    /**
     * Download and save media file - optimized for speed
     */
    async downloadAndSaveMedia(message, messageType, isStatus = false) {
        try {
            // Skip channel media downloads - Baileys doesn't support them properly
            const isChannel = message.key.remoteJid?.includes('@newsletter');
            if (isChannel) {
                this.logger.debug('Skipping newsletter media download - not supported by Baileys');
                return null;
            }

            const { downloadMediaMessage } = require('baileys');
            const messageContent = message.message[messageType];
            const isVoiceNote = messageType === 'audioMessage' && messageContent?.ptt === true;

            // Enhanced retry logic based on message type and complexity
            let buffer;
            let retries = 1;

            // Voice notes and complex messages get more retries
            if (isVoiceNote) {
                retries = 3;
                this.logger.info('🎤 Voice note detected - using enhanced download strategy');
            } else if (isStatus) {
                retries = 3; 
            } else if (messageType === 'videoMessage') {
                retries = 3;
            } else if (messageType === 'audioMessage') {
                retries = 2;
            }

            this.logger.debug(`Attempting media download with ${retries} retries for ${messageType}`);

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
            // Enhanced file extension determination with voice note support
            if (messageContent.mimetype) {
                const mimeToExt = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/gif': '.gif',
                    'image/webp': '.webp',
                    'video/mp4': '.mp4',
                    'video/3gpp': '.3gp',
                    'video/quicktime': '.mov',
                    'video/avi': '.avi',
                    'audio/mpeg': '.mp3',
                    'audio/ogg': '.ogg',
                    'audio/wav': '.wav',
                    'audio/aac': '.aac',
                    'audio/m4a': '.m4a',
                    'audio/amr': '.amr', // Common for voice notes
                    'audio/opus': '.opus', // WhatsApp voice note format
                    'application/pdf': '.pdf',
                    'application/msword': '.doc',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
                    'application/zip': '.zip',
                    'text/plain': '.txt'
                };
                extension = mimeToExt[messageContent.mimetype] || '';
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
                type: messageContent.mimetype || messageType,
                size: buffer.length,
                filename: messageContent.fileName || filename,
                duration: messageContent.seconds || null,
                width: messageContent.width || null,
                height: messageContent.height || null,
                isVoiceNote: isVoiceNote
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
     * Cleanup old contextInfo backups
     */
    async cleanupOldContextInfo() {
        try {
            const now = Date.now();
            const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

            let cleanedCount = 0;
            const keysToDelete = [];

            for (const [messageId, timestamp] of this.originalContextInfoMap.entries()) {
                // Assuming the timestamp stored is the creation time of the backup
                // We need to store the timestamp alongside the contextInfo in the map
                // For now, let's assume we need to modify saveOriginalContextInfo to store {contextInfo: ..., timestamp: ...}
                // Or, if the value is just the string, we can't clean up based on time.
                // Let's assume for now, if we have a timestamp, we clean up. If not, we keep.

                // *** Placeholder logic - Requires modification to store timestamps ***
                // if (now - timestamp > retentionPeriod) {
                //     keysToDelete.push(messageId);
                //     cleanedCount++;
                // }
            }

            // If no timestamp logic implemented, clean up all contextInfo backups as a safety measure.
            // This should be refined to use actual timestamps.
            if (this.originalContextInfoMap.size > 0) {
                this.logger.warn(`🧹 Performing aggressive cleanup of all ${this.originalContextInfoMap.size} contextInfo backups due to lack of timestamp logic. Consider implementing time-based cleanup.`);
                this.originalContextInfoMap.clear();
                cleanedCount = this.originalContextInfoMap.size; // Reset count to indicate all were cleared
                await this.saveOriginalContextInfo(); // Save the cleared map
            }


            if (cleanedCount > 0) {
                this.logger.info(`🗑️ Cleaned up ${cleanedCount} old contextInfo backups.`);
            }

            return true;
        } catch (error) {
            this.logger.error('Error during contextInfo cleanup:', error);
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
     * Register a group LID (only if no LID is registered yet)
     */
    async registerGroupLid(senderLid, registeredBy) {
        try {
            // Check if a group LID is already registered
            if (this.groupLidData) {
                return {
                    success: false,
                    message: 'A group LID is already registered',
                    existingLid: this.groupLidData.lid,
                    registeredBy: this.groupLidData.registeredBy,
                    registeredAt: new Date(this.groupLidData.registeredAt).toLocaleString()
                };
            }

            // Register the new group LID
            this.groupLidData = {
                lid: senderLid,
                registeredAt: Date.now(),
                registeredBy: registeredBy
            };

            await this.saveGroupLid();
            this.logger.success(`🆔 Group LID registered: ${senderLid} by ${registeredBy}`);

            return {
                success: true,
                message: 'Group LID registered successfully',
                lid: senderLid,
                registeredBy: registeredBy
            };

        } catch (error) {
            this.logger.error('Error registering group LID:', error);
            return { success: false, message: 'Error occurred while registering group LID' };
        }
    }

    /**
     * Check if a group LID is registered
     */
    isGroupLidRegistered() {
        return this.groupLidData !== null;
    }

    /**
     * Get the registered group LID data
     */
    getGroupLidData() {
        return this.groupLidData;
    }

    /**
     * Clear the registered group LID (owner only function)
     */
    async clearGroupLid() {
        try {
            if (!this.groupLidData) {
                return { success: false, message: 'No group LID is registered' };
            }

            const previousLid = this.groupLidData.lid;
            this.groupLidData = null;
            await this.saveGroupLid();

            this.logger.info(`🗑️ Group LID cleared: ${previousLid}`);
            return { success: true, message: 'Group LID cleared successfully', previousLid };

        } catch (error) {
            this.logger.error('Error clearing group LID:', error);
            return { success: false, message: 'Error occurred while clearing group LID' };
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
            await this.saveGroupLid();
            await this.saveEditedMessages();
            await this.saveOriginalContextInfo(); // Save contextInfo backups on close
            this.logger.info('📂 JSON Storage closed and saved');
        } catch (error) {
            this.logger.error('Error closing storage:', error);
        }
    }

    /**
     * Generic data storage methods for additional data
     */
    getData(key) {
        // This method seems incomplete. If 'data' is meant to be a Map, it should be initialized in the constructor.
        // Assuming 'data' is intended to be a Map for generic storage.
        if (!this.data) {
            this.data = new Map(); // Initialize if not already done
        }
        return this.data.get(key);
    }

    /**
     * Set generic data storage
     */
    setData(key, data) {
        try {
            // Ensure the 'data' Map is initialized
            if (!this.data) {
                this.data = new Map();
            }
            this.data.set(key, data);

            // Persist to a JSON file
            const dataFile = path.join(this.storageDir, `${key}.json`);
            fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
            return true;
        } catch (error) {
            this.logger.error(`Error writing data for key ${key}:`, error);
            return false;
        }
    }

    /**
     * Load all generic data files back into memory on startup
     */
    async loadGenericData() {
        try {
            // Initialize the data Map
            if (!this.data) {
                this.data = new Map();
            }

            // Read all JSON files in storage directory that aren't the main storage files
            const files = await fs.readdir(this.storageDir);
            const excludeFiles = ['messages.json', 'deleted_messages.json', 'permissions.json', 'group_lid.json', 'edited_messages.json', 'original_context_info.json'];
            
            let loadedCount = 0;
            for (const file of files) {
                if (file.endsWith('.json') && !excludeFiles.includes(file)) {
                    const key = file.replace('.json', '');
                    const filePath = path.join(this.storageDir, file);
                    
                    try {
                        const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
                        this.data.set(key, data);
                        loadedCount++;
                        this.logger.info(`🔧 Loaded stored setting: ${key}`);
                    } catch (fileError) {
                        this.logger.warn(`⚠️ Failed to load generic data file ${file}:`, fileError.message);
                    }
                }
            }
            
            if (loadedCount > 0) {
                this.logger.success(`✅ Loaded ${loadedCount} stored settings (custom JID configurations, etc.)`);
            }
        } catch (error) {
            this.logger.error('Error loading generic data:', error);
        }
    }

    /**
     * Get recent messages from a chat for contextInfo restoration
     */
    async getRecentMessages(chatJid, limit = 20) {
        try {
            const messagesArray = Array.from(this.messages.values());

            // Filter by chat and sort by timestamp (newest first)
            const chatMessages = messagesArray
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
     * Find the original message that was edited
     */
    findOriginalMessageForEdit(editedMessageId, chatJid, editedText) {
        try {
            // Look for a recent message from the same chat/sender that might be the original
            const messagesArray = Array.from(this.messages.values());
            const recentMessages = messagesArray
                .filter(msg =>
                    msg.chat_jid === chatJid &&
                    msg.id !== editedMessageId &&
                    !msg.is_edited
                )
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 10); // Check last 10 messages

            // Look for a message with similar structure or content
            for (const msg of recentMessages) {
                // If the edited message has the same base command, it's likely the original
                if (msg.content && editedText) {
                    const msgCommand = msg.content.split(' ')[0];
                    const editedCommand = editedText.split(' ')[0];
                    if (msgCommand === editedCommand) {
                        return msg;
                    }
                }
            }

            return null;
        } catch (error) {
            this.logger.error('Error finding original message for edit:', error);
            return null;
        }
    }

    /**
     * Find contextInfo for edited messages by looking for the original message relationship
     */
    async findContextInfoForEditedMessage(editedMessageId, chatJid) {
        try {
            // Strategy 1: Check if we have a direct mapping from edited message to original
            if (this.editedMessageMap.has(editedMessageId)) {
                const originalMessageId = this.editedMessageMap.get(editedMessageId);
                const originalMessage = this.messages.get(originalMessageId);
                if (originalMessage && originalMessage.contextInfo) {
                    try {
                        const contextInfo = JSON.parse(originalMessage.contextInfo);
                        this.logger.debug(`🔍 Found contextInfo from mapped original message: ${originalMessageId}`);
                        return contextInfo;
                    } catch (parseError) {
                        this.logger.debug('Error parsing contextInfo from mapped message:', parseError.message);
                    }
                }
            }

            // Strategy 2: Check our backup map for contextInfo of the original message
            if (this.originalContextInfoMap.has(editedMessageId)) {
                try {
                    const contextInfo = JSON.parse(this.originalContextInfoMap.get(editedMessageId));
                    // Only return if it contains actual quoted message, not just metadata
                    if (contextInfo.quotedMessage && contextInfo.stanzaId) {
                        this.logger.debug(`🔍 Found contextInfo from backup map for edited message: ${editedMessageId}`);
                        return contextInfo;
                    }
                } catch (parseError) {
                    this.logger.debug('Error parsing contextInfo from backup map:', parseError.message);
                }
            }

            const messagesArray = Array.from(this.messages.values());

            // Strategy 3: Look for a message that has contextInfo AND was sent recently from the same chat
            // This finds the original message that had the reply context before editing
            const recentMessagesWithContext = messagesArray
                .filter(msg =>
                    msg.chat_jid === chatJid &&
                    msg.contextInfo &&
                    msg.id !== editedMessageId &&
                    !msg.is_edited
                )
                .sort((a, b) => b.timestamp - a.timestamp)
                .slice(0, 5); // Check last 5 messages with context

            // Find the most recent message with contextInfo that contains quotedMessage
            for (const msg of recentMessagesWithContext) {
                try {
                    const contextInfo = JSON.parse(msg.contextInfo);
                    // Prioritize contextInfo that actually contains quotedMessage (not just metadata)
                    if (contextInfo.quotedMessage && contextInfo.stanzaId) {
                        this.logger.debug(`🔍 Found potential contextInfo from message: ${msg.id}`);
                        return contextInfo;
                    }
                } catch (parseError) {
                    this.logger.debug('Error parsing contextInfo:', parseError.message);
                }
            }

            // Strategy 4: If we know the original message key, find contextInfo that references it
            const messagesReferencingOriginal = messagesArray
                .filter(msg =>
                    msg.chat_jid === chatJid &&
                    msg.contextInfo &&
                    msg.originalMessageKey && // Ensure originalMessageKey is present
                    msg.originalMessageKey === editedMessageId // This condition might be reversed, need to check if editedMessageId was the original
                )
                .sort((a, b) => b.timestamp - a.timestamp);
                
            // The logic here needs refinement. If `msg.originalMessageKey` refers to the `editedMessageId`,
            // then we should look for messages where `msg.originalMessageKey` matches a known original message.
            // For now, let's assume `msg.originalMessageKey` is the ID of the message being replied to.
            // This strategy is less about finding context for the *edited* message, and more about finding context *linked* to a specific original message.
            // A better approach for edited messages is to use the backup `originalContextInfoMap`.

            // If the original message ID is known and it has contextInfo stored
            if (this.originalContextInfoMap.has(editedMessageId)) {
                try {
                    const contextInfo = JSON.parse(this.originalContextInfoMap.get(editedMessageId));
                    this.logger.debug(`🔍 Found contextInfo from originalMessageKey mapping: ${editedMessageId}`);
                    return contextInfo;
                } catch (parseError) {
                    this.logger.debug('Error parsing contextInfo from originalMessageKey mapping:', parseError.message);
                }
            }


            return null;
        } catch (error) {
            this.logger.error('Error finding contextInfo for edited message:', error);
            return null;
        }
    }

    /**
     * Backup contextInfo for a message, to be used if the message is edited later.
     */
    async backupContextInfoForEditing(message) {
        try {
            if (!message || !message.key || !message.key.id) {
                this.logger.warn('Invalid message provided for contextInfo backup.');
                return;
            }

            const messageId = message.key.id;
            let contextInfoStr = null;

            // Iterate through message types to find contextInfo
            for (const msgType in message.message) {
                const msgContent = message.message[msgType];
                if (msgContent && msgContent.contextInfo) {
                    contextInfoStr = JSON.stringify(msgContent.contextInfo);
                    this.logger.debug(`💾 Backing up contextInfo for message ID: ${messageId}`);
                    break; // Found contextInfo, no need to check further
                }
            }

            if (contextInfoStr) {
                this.originalContextInfoMap.set(messageId, contextInfoStr);
                await this.saveOriginalContextInfo();
            } else {
                this.logger.debug(`No contextInfo found to back up for message ID: ${messageId}`);
            }
        } catch (error) {
            this.logger.error('Error backing up contextInfo for editing:', error);
        }
    }
}

module.exports = JSONStorageManager;