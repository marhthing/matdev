const config = require('../config');

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
        this.registerCommands();
        this.setupViewOnceInterception();
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
            
            if (!quotedMessage) {
                console.log('❌ Please reply to a view once message with .vv');
                return;
            }

            // Try to get cached view-once media first
            const quotedMessageId = contextInfo?.stanzaId;
            if (quotedMessageId) {
                const cachedViewOnce = this.getCachedViewOnceMedia(quotedMessageId);
                if (cachedViewOnce) {
                    console.log(`📸 Using cached view once media for ${quotedMessageId}`);
                    await this.sendCachedViewOnceMedia(cachedViewOnce);
                    return;
                }
            }
            
            let viewOnceMessage = null;
            
            // Check for view once in different possible structures
            if (quotedMessage?.viewOnceMessage) {
                // Direct view once message
                viewOnceMessage = quotedMessage;
            } else if (quotedMessage?.message?.viewOnceMessage) {
                // Nested view once message
                viewOnceMessage = quotedMessage.message;
            } else if (quotedMessage) {
                // Check if this is a forwarded view once (from .save)
                // When view once is forwarded, it loses the viewOnceMessage wrapper
                // and becomes regular imageMessage, videoMessage, etc.
                const messageTypes = Object.keys(quotedMessage);
                
                // Check if it's likely a forwarded view once (image or video)
                if (messageTypes.includes('imageMessage') || messageTypes.includes('videoMessage')) {
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
                // Extract the media from view once
                const buffer = await this.extractViewOnceMedia(viewOnceMessage);
                
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
                    console.log(`❌ Unsupported view once content type: ${contentType}`);
                    return;
                }
                
                // Send the extracted content to appropriate destination
                if (extractedMessage) {
                    // Get saved default destination or fallback to bot private chat
                    let targetJid = this.bot.database.getData('vvDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net`;
                    
                    // Send to destination
                    await this.bot.sock.sendMessage(targetJid, extractedMessage);
                    console.log(`💥 Successfully extracted and sent view once ${contentType} to ${targetJid}`);
                }
                
            } catch (error) {
                console.error('Error extracting view once media:', error);
                console.log('💡 Tip: The view once message may have been opened too many times and lost its download capabilities.');
            }
            
        } catch (error) {
            console.error(`Error in anti-view once command: ${error.message}`);
        }
    }

    /**
     * Setup view once message interception to cache media before it's opened
     */
    setupViewOnceInterception() {
        console.log('🔧 Setting up view once message interception...');
        
        // Wait for bot socket to be available
        const setupInterception = () => {
            if (this.bot.sock && this.bot.sock.ev) {
                console.log('🔌 Bot socket found, registering view once interception...');
                this.bot.sock.ev.on('messages.upsert', this.interceptViewOnceMessages.bind(this));
                console.log('📸 View once message interception enabled and listening');
            } else {
                console.log('⏳ Bot socket not ready, retrying in 1s...');
                setTimeout(setupInterception, 1000);
            }
        };
        
        setTimeout(setupInterception, 2000); // Give time for bot to initialize
    }

    /**
     * Intercept and cache view once messages before they're opened
     */
    async interceptViewOnceMessages({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                console.log(`🔍 Checking message for view once: ${message.key?.id}, types: ${Object.keys(message.message || {}).join(', ')}`);
                
                // Check if this is a view once message
                const messageContent = message.message;
                if (messageContent?.viewOnceMessage) {
                    const messageId = message.key.id;
                    console.log(`📸 Intercepted view once message: ${messageId}`);
                    
                    // Try to download and cache the media immediately
                    try {
                        const buffer = await this.extractViewOnceMedia(message);
                        const viewOnceContent = messageContent.viewOnceMessage.message;
                        const contentType = Object.keys(viewOnceContent)[0];
                        
                        // Cache the view once media with message ID
                        this.cacheViewOnceMedia(messageId, {
                            buffer: buffer,
                            contentType: contentType,
                            caption: viewOnceContent[contentType]?.caption || '',
                            timestamp: Date.now()
                        });
                        
                        console.log(`💾 Cached view once ${contentType} with ID: ${messageId}`);
                    } catch (cacheError) {
                        console.error(`Failed to cache view once media: ${cacheError.message}`);
                    }
                } else {
                    // Debug: Show what message types we're getting
                    if (messageContent) {
                        const messageTypes = Object.keys(messageContent);
                        if (messageTypes.length > 0 && !messageTypes.includes('protocolMessage')) {
                            console.log(`🔍 Non-view-once message types: ${messageTypes.join(', ')}`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error in view once interception: ${error.message}`);
            }
        }
    }

    /**
     * Cache view once media in memory and database
     */
    cacheViewOnceMedia(messageId, mediaData) {
        try {
            console.log(`💾 Attempting to cache view once media for ID: ${messageId}`);
            
            // Store in database for persistence
            this.bot.database.setData(`viewonce_${messageId}`, {
                contentType: mediaData.contentType,
                caption: mediaData.caption,
                timestamp: mediaData.timestamp,
                // Don't store buffer in JSON, we'll handle it separately
            });
            
            console.log(`📁 Stored view once metadata in database for: ${messageId}`);
            
            // Store buffer in memory cache for immediate access
            if (!this.bot.cache) {
                this.bot.cache = new Map();
            }
            this.bot.cache.set(`viewonce_buffer_${messageId}`, mediaData.buffer);
            
            console.log(`🧠 Stored view once buffer in memory cache for: ${messageId}`);
            
            // Set expiry for memory cache (24 hours)
            setTimeout(() => {
                this.bot.cache.delete(`viewonce_buffer_${messageId}`);
                console.log(`⏰ Expired memory cache for view once: ${messageId}`);
            }, 24 * 60 * 60 * 1000);
            
        } catch (error) {
            console.error(`Error caching view once media: ${error.message}`);
        }
    }

    /**
     * Get cached view once media
     */
    getCachedViewOnceMedia(messageId) {
        try {
            // Try to get from memory cache first
            const cachedBuffer = this.bot.cache?.get(`viewonce_buffer_${messageId}`);
            const cachedData = this.bot.database.getData(`viewonce_${messageId}`);
            
            if (cachedBuffer && cachedData) {
                return {
                    buffer: cachedBuffer,
                    contentType: cachedData.contentType,
                    caption: cachedData.caption,
                    timestamp: cachedData.timestamp
                };
            }
            
            return null;
        } catch (error) {
            console.error(`Error getting cached view once media: ${error.message}`);
            return null;
        }
    }

    /**
     * Send cached view once media
     */
    async sendCachedViewOnceMedia(cachedData) {
        try {
            let extractedMessage = null;
            
            if (cachedData.contentType === 'imageMessage') {
                extractedMessage = {
                    image: cachedData.buffer,
                    caption: cachedData.caption || undefined
                };
            } else if (cachedData.contentType === 'videoMessage') {
                extractedMessage = {
                    video: cachedData.buffer,
                    caption: cachedData.caption || undefined
                };
            } else {
                console.log(`❌ Unsupported cached content type: ${cachedData.contentType}`);
                return;
            }
            
            if (extractedMessage) {
                // Get saved default destination or fallback to bot private chat
                let targetJid = this.bot.database.getData('vvDefaultDestination') || `${config.OWNER_NUMBER}@s.whatsapp.net`;
                
                // Send to destination
                await this.bot.sock.sendMessage(targetJid, extractedMessage);
                console.log(`💥 Successfully sent cached view once ${cachedData.contentType} to ${targetJid}`);
            }
        } catch (error) {
            console.error(`Error sending cached view once media: ${error.message}`);
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