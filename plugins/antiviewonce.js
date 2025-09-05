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
    }

    /**
     * Register anti-view once commands
     */
    registerCommands() {
        // Register anti-view once command
        this.bot.messageHandler.registerCommand('vv', this.handleAntiViewOnce.bind(this), {
            description: 'Extract and send original content from view once messages',
            usage: `${config.PREFIX}vv [jid] (reply to view once message)`,
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
                
                // Send the extracted content to specified destination
                if (extractedMessage) {
                    // Check if user specified a destination JID
                    const jids = this.bot.jidUtils.extractJIDs(message);
                    const args = message.message?.extendedTextMessage?.text?.split(' ') || [];
                    let targetJid = `${config.OWNER_NUMBER}@s.whatsapp.net`; // Default to owner
                    
                    // Check if JID was specified in command (e.g., ".vv 1234567890")
                    if (args.length > 1 && args[1]) {
                        let specifiedJid = args[1];
                        
                        // Normalize JID format
                        if (!specifiedJid.includes('@')) {
                            specifiedJid = `${specifiedJid}@s.whatsapp.net`;
                        }
                        
                        targetJid = specifiedJid;
                        console.log(`📤 Custom destination specified: ${targetJid}`);
                    }
                    
                    // Send to specified destination
                    await this.bot.sock.sendMessage(targetJid, extractedMessage);
                    console.log(`💥 Successfully extracted and sent view once ${contentType} to ${targetJid}`);
                }
                
            } catch (error) {
                console.error('Error extracting view once media:', error);
            }
            
        } catch (error) {
            console.error(`Error in anti-view once command: ${error.message}`);
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