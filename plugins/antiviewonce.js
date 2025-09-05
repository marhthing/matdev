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
            usage: `${config.PREFIX}vv (reply to view once message)`,
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
            console.log(`🔍 Debug - quotedMessage keys:`, quotedMessage ? Object.keys(quotedMessage) : 'no quoted message');
            console.log(`🔍 Debug - contextInfo:`, contextInfo ? 'exists' : 'missing');
            
            let viewOnceMessage = null;
            
            // Check for view once in different possible structures
            if (quotedMessage?.viewOnceMessage) {
                // Direct view once message
                viewOnceMessage = quotedMessage;
                console.log(`🔍 Found direct view once message in reply`);
            } else if (quotedMessage?.message?.viewOnceMessage) {
                // Nested view once message
                viewOnceMessage = quotedMessage.message;
                console.log(`🔍 Found nested view once message in reply`);
            } else if (quotedMessage) {
                // Check if the quoted message itself is a forwarded view once (from .save)
                // When forwarded, it might lose the viewOnceMessage wrapper
                const messageTypes = Object.keys(quotedMessage);
                console.log(`🔍 Debug - available message types:`, messageTypes);
                
                // For now, let's still require a proper view once structure
                // but give better feedback about what we found
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: `❌ This doesn't appear to be a view once message.\n\nMessage types found: ${messageTypes.join(', ')}\n\nPlease reply to an actual view once message with .vv`
                });
                return;
            } else {
                console.log(`🔍 No reply found - searching for recent view once messages`);
                
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '❌ Please reply to a view once message with .vv'
                });
                return;
            }
            
            if (!viewOnceMessage) {
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '❌ No view once message found. Reply to a view once message with .vv'
                });
                return;
            }
            
            console.log(`💥 Processing anti-view once for message`);
            
            // Extract the actual content from view once message
            const viewOnceContent = viewOnceMessage.viewOnceMessage.message;
            const contentType = Object.keys(viewOnceContent)[0];
            
            console.log(`📸 View once content type: ${contentType}`);
            
            try {
                // Extract the media from view once
                const buffer = await this.extractViewOnceMedia(viewOnceMessage);
                
                let extractedMessage = null;
                
                if (contentType === 'imageMessage') {
                    // Send the extracted image
                    extractedMessage = {
                        image: buffer,
                        caption: `💥 *Anti-View Once* 💥\n\n` +
                                `📸 Original image extracted from view once message\n` +
                                `${viewOnceContent.imageMessage.caption ? `\n📝 Original caption: ${viewOnceContent.imageMessage.caption}` : ''}`
                    };
                } else if (contentType === 'videoMessage') {
                    // Send the extracted video
                    extractedMessage = {
                        video: buffer,
                        caption: `💥 *Anti-View Once* 💥\n\n` +
                                `🎥 Original video extracted from view once message\n` +
                                `${viewOnceContent.videoMessage.caption ? `\n📝 Original caption: ${viewOnceContent.videoMessage.caption}` : ''}`
                    };
                } else {
                    await this.bot.sock.sendMessage(jids.chat_jid, {
                        text: `❌ Unsupported view once content type: ${contentType}`
                    });
                    return;
                }
                
                // Send the extracted content
                if (extractedMessage) {
                    await this.bot.sock.sendMessage(jids.chat_jid, extractedMessage);
                    console.log(`💥 Successfully extracted and sent view once ${contentType}`);
                    
                    // Optional: Also save to bot private chat for archival
                    const botPrivateChat = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                    const archiveMessage = {
                        ...extractedMessage,
                        caption: `💥 *View Once Archive* 💥\n\n` +
                                `📁 Extracted from view once and archived\n` +
                                `🕐 Extracted: ${new Date().toLocaleString()}\n` +
                                `${extractedMessage.caption ? `\n${extractedMessage.caption.replace('💥 *Anti-View Once* 💥', '')}` : ''}`
                    };
                    
                    await this.bot.sock.sendMessage(botPrivateChat, archiveMessage);
                    console.log(`📁 Archived extracted view once content`);
                }
                
            } catch (error) {
                console.error('Error extracting view once media:', error);
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: `❌ Failed to extract view once content: ${error.message}`
                });
            }
            
        } catch (error) {
            console.error(`Error in anti-view once command: ${error.message}`);
            const jids = this.bot.jidUtils.extractJIDs(message);
            if (jids) {
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '❌ Error processing anti-view once command'
                });
            }
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