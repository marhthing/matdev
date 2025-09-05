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
                
                let buffer = null;
                let usedSavedMedia = false;
                
                // First try to extract media from WhatsApp
                try {
                    buffer = await this.extractViewOnceMedia(viewOnceMessage);
                    
                    // Save the extracted media for future use
                    if (buffer) {
                        await this.saveViewOnceMedia(buffer, messageId, contentType, viewOnceContent);
                        // Saved view once for future access silently
                    }
                } catch (error) {
                    // Failed to extract from WhatsApp, checking for saved media silently
                    
                    // Try to load from saved file
                    if (await fs.pathExists(savedFilePath)) {
                        buffer = await fs.readFile(savedFilePath);
                        usedSavedMedia = true;
                        // Using saved media silently
                    } else {
                        // No saved media found
                        throw error;
                    }
                }
                
                if (!buffer) {
                    // Could not extract or load saved media
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
                    const sourceMsg = usedSavedMedia ? ' (from saved media)' : '';
                    // Successfully extracted and sent view once silently
                }
                
            } catch (error) {
                console.error('Error extracting view once media:', error);
            }
            
        } catch (error) {
            console.error(`Error in anti-view once command: ${error.message}`);
        }
    }

    /**
     * Generate a unique identifier for the view once message
     */
    generateMessageId(viewOnceMessage, contentType) {
        // Create a hash based on message content and timestamp
        const messageContent = viewOnceMessage.viewOnceMessage?.message || viewOnceMessage.message || viewOnceMessage;
        const content = messageContent[contentType];
        
        // Use various properties to create a unique identifier
        const identifier = [
            content?.url || '',
            content?.directPath || '',
            content?.mediaKey || '',
            content?.fileLength || '',
            content?.mimetype || '',
            Date.now().toString() // Add timestamp as fallback
        ].filter(Boolean).join('|');
        
        return crypto.createHash('md5').update(identifier).digest('hex').substring(0, 12);
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