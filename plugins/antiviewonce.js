const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

/**
 * Anti-View Once Plugin
 * Handles extraction of content from view once messages
 */
class AntiViewOncePlugin {
    constructor(bot) {
        this.bot = bot;
        this.name = 'antiviewonce';
    }

    /**
     * Initialize the plugin
     */
    async init() {
        console.log('✅ Anti-View Once plugin loaded');

        // Ensure viewonce directory exists
        this.viewOnceDir = path.join(__dirname, '..', 'session', 'viewonce');
        await fs.ensureDir(this.viewOnceDir);

        // Schedule periodic cleanup (every 24 hours)
        setInterval(() => {
            this.cleanupOldSavedMedia();
        }, 24 * 60 * 60 * 1000);

        // Run initial cleanup
        setTimeout(() => {
            this.cleanupOldSavedMedia();
        }, 10000); // Wait 10 seconds after startup

        this.registerCommands();
    }

    /**
     * Register anti-view once commands
     */
    registerCommands() {
        // Register anti-view once command
        this.bot.messageHandler.registerCommand('vv', this.handleAntiViewOnce.bind(this), {
            description: 'Extract and send original content from view once messages',
            usage: `${config.PREFIX}vv [jid] - Set default destination or extract view once`,
            category: 'utility'
        });
    }

    /**
     * Handle .vv command to extract and send original content from view once messages
     */
    async handleAntiViewOnce(message) {
        try {
            // Extract JID information using centralized JID utils
            const jids = this.bot.jidUtils.extractJIDs(message);
            if (!jids) {
                console.error('Failed to extract JIDs from message');
                return;
            }

            // Check if this is just setting the default destination
            const args = message.message?.extendedTextMessage?.text?.split(' ') || 
                        message.message?.conversation?.split(' ') || [];

            if (args.length > 1 && args[1]) {
                // Check if this is NOT a reply (meaning user wants to set default destination)
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                if (!quotedMessage) {
                    // This is setting the default destination
                    let newDefaultJid = args[1];

                    // Normalize JID format
                    if (!newDefaultJid.includes('@')) {
                        newDefaultJid = `${newDefaultJid}@s.whatsapp.net`;
                    }

                    // Save the new default destination
                    this.bot.database.setData('vvDefaultDestination', newDefaultJid);
                    console.log(`✅ Default vv destination set to: ${newDefaultJid}`);
                    return;
                }
            }

            // Check if this is a reply to a view once message
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;

            // Debug: Log the message structure to understand what we're getting
            // console.log(`🔍 Debug - quotedMessage keys:`, quotedMessage ? Object.keys(quotedMessage) : 'no quoted message');
            // console.log(`🔍 Debug - contextInfo:`, contextInfo ? 'exists' : 'missing');

            let viewOnceMessage = null;

            // Check for view once in different possible structures
            if (quotedMessage?.viewOnceMessage) {
                // Direct view once message
                viewOnceMessage = quotedMessage;
                // console.log(`🔍 Found direct view once message in reply`);
            } else if (quotedMessage?.message?.viewOnceMessage) {
                // Nested view once message
                viewOnceMessage = quotedMessage.message;
                // console.log(`🔍 Found nested view once message in reply`);
            } else if (quotedMessage) {
                // Check if this is a forwarded view once (from .save)
                // When view once is forwarded, it loses the viewOnceMessage wrapper
                // and becomes regular imageMessage, videoMessage, etc.
                const messageTypes = Object.keys(quotedMessage);
                // console.log(`🔍 Debug - available message types:`, messageTypes);

                // Check if it's likely a forwarded view once (image or video)
                if (messageTypes.includes('imageMessage') || messageTypes.includes('videoMessage')) {
                    // console.log(`🔍 Treating as forwarded view once message`);
                    // Create a fake viewOnceMessage structure for processing
                    viewOnceMessage = {
                        viewOnceMessage: {
                            message: quotedMessage
                        }
                    };
                } else {
                    console.log(`❌ This doesn't appear to be a view once message. Message types found: ${messageTypes.join(', ')}`);
                    return;
                }
            } else {
                // console.log(`🔍 No reply found - searching for recent view once messages`);
                console.log('❌ Please reply to a view once message with .vv');
                return;
            }

            if (!viewOnceMessage) {
                console.log('❌ No view once message found. Reply to a view once message with .vv');
                return;
            }

            // Extract the actual content from view once message
            const viewOnceContent = viewOnceMessage.viewOnceMessage.message;
            const contentType = Object.keys(viewOnceContent)[0];

            console.log(`📸 Processing ${contentType} view once`);

            try {
                // Generate unique identifier for this view once message
                const messageId = this.generateMessageId(viewOnceMessage, contentType);
                const savedFilePath = await this.getSavedMediaPath(messageId, contentType);

                // Debug: Show what we're looking for
                console.log(`🔍 Debug - Generated message ID: ${messageId}`);
                console.log(`🔍 Debug - Looking for saved file: ${savedFilePath}`);
                
                // Debug: List all files in viewonce directory
                try {
                    const viewOnceFiles = await fs.readdir(this.viewOnceDir);
                    console.log(`🔍 Debug - Files in viewonce directory: ${viewOnceFiles.join(', ')}`);
                } catch (error) {
                    console.log(`🔍 Debug - Error reading viewonce directory: ${error.message}`);
                }

                let buffer = null;
                let usedSavedMedia = false;

                // First, try to extract from WhatsApp
                try {
                    buffer = await this.extractViewOnceMedia(viewOnceMessage);

                    // Validate the extracted buffer - WhatsApp might return empty/invalid data for opened view-once
                    if (buffer && buffer.length > 100) { // Minimum reasonable size check
                        // Save the extracted media for future use
                        await this.saveViewOnceMedia(buffer, messageId, contentType, viewOnceContent);
                        console.log(`💾 Extracted and saved fresh view-once media`);
                    } else {
                        // Invalid buffer from WhatsApp (likely stripped content)
                        console.log('⚠️ WhatsApp returned invalid/empty buffer - view-once likely already opened');
                        buffer = null;
                    }
                } catch (error) {
                    console.log('Direct extraction failed:', error.message);
                    buffer = null;
                }

                // If WhatsApp extraction failed or returned invalid data, check saved media
                console.log(`🔍 Debug - Checking if file exists: ${savedFilePath}`);
                const fileExists = await fs.pathExists(savedFilePath);
                console.log(`🔍 Debug - File exists: ${fileExists}`);
                
                // If exact file doesn't exist, try to find any matching files for this content type
                let alternativeFile = null;
                if (!buffer && !fileExists) {
                    try {
                        const viewOnceFiles = await fs.readdir(this.viewOnceDir);
                        const extension = contentType === 'imageMessage' ? '.jpg' : '.mp4';
                        const matchingFiles = viewOnceFiles.filter(file => 
                            file.endsWith(extension) && !file.endsWith('.json')
                        );
                        
                        if (matchingFiles.length > 0) {
                            // For now, use the most recent file as fallback
                            // This could be improved with better matching logic
                            const mostRecent = matchingFiles
                                .map(file => ({
                                    name: file,
                                    path: path.join(this.viewOnceDir, file),
                                    stats: fs.statSync(path.join(this.viewOnceDir, file))
                                }))
                                .sort((a, b) => b.stats.mtime - a.stats.mtime)[0];
                            
                            alternativeFile = mostRecent.path;
                            console.log(`🔍 Debug - Found alternative file: ${mostRecent.name}`);
                        }
                    } catch (error) {
                        console.log(`🔍 Debug - Error searching for alternative files: ${error.message}`);
                    }
                }
                
                if (!buffer && (fileExists || alternativeFile)) {
                    const fileToUse = fileExists ? savedFilePath : alternativeFile;
                    try {
                        buffer = await fs.readFile(fileToUse);
                        if (buffer && buffer.length > 0) {
                            usedSavedMedia = true;
                            const fileName = path.basename(fileToUse);
                            console.log(`📁 Using saved view-once media: ${fileName}`);
                            if (alternativeFile) {
                                console.log(`📁 Used alternative file due to ID mismatch`);
                            }
                        } else {
                            console.log('⚠️ Saved media file exists but is empty or corrupted');
                            buffer = null;
                        }
                    } catch (error) {
                        console.log('Error loading saved media:', error.message);
                        buffer = null;
                    }
                }

                if (!buffer) {
                    console.log('❌ View-once media not available - WhatsApp has stripped the content and no saved copy exists');
                    return;
                }

                let extractedMessage = null;

                if (contentType === 'imageMessage') {
                    // Send the extracted image
                    extractedMessage = {
                        image: buffer,
                        caption: viewOnceContent.imageMessage.caption || undefined
                    };
                } else if (contentType === 'videoMessage') {
                    // Send the extracted video
                    extractedMessage = {
                        video: buffer,
                        caption: viewOnceContent.videoMessage.caption || undefined
                    };
                } else {
                    // Unsupported view once content type
                    return;
                }

                // Send the extracted content to appropriate destination
                if (extractedMessage) {
                    // Get saved default destination or fallback to bot private chat
                    let targetJid = this.bot.database.getData('vvDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net`;

                    // Send to destination
                    await this.bot.sock.sendMessage(targetJid, extractedMessage);

                    // Simple feedback
                    const source = usedSavedMedia ? 'saved' : 'fresh';
                    console.log(`✅ vv: ${contentType.replace('Message', '')} sent (${source})`);
                }

            } catch (error) {
                console.error('Error extracting view once media:', error);
            }

        } catch (error) {
            console.error(`Error in anti-view once command: ${error.message}`);
        }
    }

    /**
     * Generate a unique identifier for the view once message using WhatsApp-independent properties
     */
    generateMessageId(viewOnceMessage, contentType) {
        // Use message key properties that WhatsApp cannot strip
        const messageKey = viewOnceMessage.key || {};
        const messageContent = viewOnceMessage.viewOnceMessage?.message || viewOnceMessage.message || viewOnceMessage;
        const content = messageContent[contentType];

        // Create identifier using WhatsApp-independent properties
        const identifier = [
            messageKey.id || '',                    // WhatsApp message ID - never stripped
            messageKey.fromMe?.toString() || '',    // Message direction - never stripped
            messageKey.remoteJid || '',            // Chat JID - never stripped
            contentType || '',                     // Content type - never stripped
            content?.fileLength?.toString() || '', // File size - usually preserved
            content?.mimetype || ''                // MIME type - usually preserved
        ].filter(Boolean).join('|');

        console.log(`🔍 Debug - Using WhatsApp-independent properties for ID:`, {
            messageId: messageKey.id || 'missing',
            fromMe: messageKey.fromMe || 'missing',
            remoteJid: messageKey.remoteJid || 'missing',
            contentType: contentType || 'missing',
            fileLength: content?.fileLength || 'missing',
            mimetype: content?.mimetype || 'missing'
        });

        if (!identifier) {
            console.log('⚠️ No properties found for ID generation - using fallback');
            return `fallback_${Date.now()}`;
        }

        console.log(`🔍 Debug - Generated identifier string: ${identifier}`);
        const messageId = crypto.createHash('md5').update(identifier).digest('hex').substring(0, 12);
        console.log(`🔍 Debug - Final message ID: ${messageId}`);

        return messageId;
    }

    /**
     * Get the file path for saved media
     */
    async getSavedMediaPath(messageId, contentType) {
        const extension = contentType === 'imageMessage' ? 'jpg' : 'mp4';
        return path.join(this.viewOnceDir, `${messageId}.${extension}`);
    }

    /**
     * Save view once media to disk for future access
     */
    async saveViewOnceMedia(buffer, messageId, contentType, viewOnceContent) {
        try {
            const filePath = await this.getSavedMediaPath(messageId, contentType);

            // Save the media file
            await fs.writeFile(filePath, buffer);

            // Save metadata
            const metadataPath = path.join(this.viewOnceDir, `${messageId}.json`);
            const metadata = {
                messageId,
                contentType,
                savedAt: new Date().toISOString(),
                caption: viewOnceContent[contentType]?.caption || null,
                mimetype: viewOnceContent[contentType]?.mimetype || null,
                fileLength: viewOnceContent[contentType]?.fileLength || buffer.length,
                fileName: path.basename(filePath)
            };

            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

            console.log(`💾 Saved view once media: ${path.basename(filePath)} (${buffer.length} bytes)`);

        } catch (error) {
            console.error(`Error saving view once media: ${error.message}`);
        }
    }

    /**
     * Clean up old saved view once files (older than 7 days)
     */
    async cleanupOldSavedMedia() {
        try {
            const files = await fs.readdir(this.viewOnceDir);
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

            for (const file of files) {
                const filePath = path.join(this.viewOnceDir, file);
                const stats = await fs.stat(filePath);

                if (now - stats.mtime.getTime() > maxAge) {
                    await fs.unlink(filePath);
                    console.log(`🗑️ Cleaned up old view once file: ${file}`);
                }
            }
        } catch (error) {
            console.error(`Error cleaning up old view once files: ${error.message}`);
        }
    }

    /**
     * Extract media from view once message
     */
    async extractViewOnceMedia(quotedMessage) {
        try {
            const { downloadMediaMessage } = require('baileys');

            // Handle different message structures
            let messageContent = quotedMessage.message || quotedMessage;
            let messageKey = quotedMessage.key || {};

            // Handle view once messages specifically
            if (messageContent.viewOnceMessage) {
                messageContent = messageContent.viewOnceMessage.message;
            }

            // Create a mock message structure for baileys
            const mockMessage = {
                key: messageKey,
                message: messageContent
            };

            // Download media buffer
            const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
            return buffer;

        } catch (error) {
            console.error(`Error extracting view once media: ${error.message}`);
            throw error;
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new AntiViewOncePlugin(bot);
        await plugin.init();
        return plugin;
    }
};