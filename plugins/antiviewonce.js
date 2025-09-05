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
            
            let viewOnceMessage = null;
            
            // First, check if replying to a view once message
            if (quotedMessage?.viewOnceMessage) {
                viewOnceMessage = quotedMessage;
                console.log(`🔍 Found view once message in reply`);
            }
            // If no reply, look for recent view once messages in current chat
            else {
                console.log(`🔍 Searching for recent view once messages in chat`);
                
                // Look through recent messages for view once content
                // This would work better if we had access to message history, 
                // but we'll focus on replied messages for now
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