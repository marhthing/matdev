
const config = require('../config');

class StatusPlugin {
    constructor() {
        this.name = 'status';
        this.description = 'WhatsApp status saving and auto-send functionality';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.logger = bot.logger;
        this.registerCommands();
        
        console.log('✅ Status plugin loaded');
        return this;
    }

    /**
     * Register all status commands
     */
    registerCommands() {
        // Register save command
        this.bot.messageHandler.registerCommand('save', this.handleSaveCommand.bind(this), {
            description: 'Save replied status media to bot private chat',
            usage: `${config.PREFIX}save (reply to status)`,
            category: 'Status'
        });
    }

    async handleMessage(message) {
        try {
            const messageInfo = this.bot.extractMessageInfo(message);
            
            // Check if this is a reply to a status
            if (this.isStatusReply(messageInfo)) {
                const text = messageInfo.body?.toLowerCase() || '';
                
                // Handle auto-send functionality for user's status
                if (this.shouldAutoSend(text, messageInfo)) {
                    await this.handleAutoSend(messageInfo);
                }
            }
        } catch (error) {
            console.error(`Error in status message handler: ${error.message}`);
        }
    }

    /**
     * Check if message is a reply to WhatsApp status
     */
    isStatusReply(messageData) {
        // Check if message has quoted message and it's from status
        if (!messageData.quotedMessage) return false;
        
        // Status messages have specific characteristics:
        // 1. They come from status@broadcast
        // 2. Or have specific contextInfo indicating status
        const contextInfo = messageData.contextInfo;
        const isStatusBroadcast = contextInfo?.remoteJid?.includes('status@broadcast') || 
                                 contextInfo?.participant?.includes('status@broadcast') ||
                                 messageData.quotedMessage.key?.remoteJid?.includes('status@broadcast');
        
        return isStatusBroadcast;
    }

    /**
     * Check if user wants auto-send (contains 'send' keyword)
     */
    shouldAutoSend(text, messageInfo) {
        // Only auto-send if replying to bot owner's status
        const isReplyingToBotOwner = messageInfo.quotedMessage?.key?.participant === `${config.OWNER_NUMBER}@s.whatsapp.net` ||
                                    messageInfo.quotedMessage?.contextInfo?.participant === `${config.OWNER_NUMBER}@s.whatsapp.net`;
        
        // Check for 'send' keyword variations
        const hasSendKeyword = text.includes('send') || 
                              text.includes('please send') || 
                              text.includes('send please');
        
        return isReplyingToBotOwner && hasSendKeyword;
    }

    /**
     * Auto-send status media to user who replied with 'send'
     */
    async handleAutoSend(messageInfo) {
        try {
            const quotedMessage = messageInfo.quotedMessage;
            const userJid = messageInfo.sender;
            
            // Extract media from quoted status
            const mediaData = await this.extractStatusMedia(quotedMessage);
            
            if (mediaData) {
                // Send the media to the user
                await this.bot.sock.sendMessage(userJid, mediaData);
                console.log(`📤 Auto-sent status media to ${userJid}`);
            } else {
                // If no media, send text content
                const textContent = this.extractStatusText(quotedMessage);
                if (textContent) {
                    await this.bot.sock.sendMessage(userJid, { text: textContent });
                    console.log(`📤 Auto-sent status text to ${userJid}`);
                }
            }
        } catch (error) {
            console.error(`Error in auto-send: ${error.message}`);
        }
    }

    /**
     * Handle .save command to save status media to bot private chat
     */
    async handleSaveCommand(message) {
        try {
            // Extract JID information using centralized JID utils
            const jids = this.bot.jidUtils.extractJIDs(message);
            if (!jids) {
                console.error('Failed to extract JIDs from message');
                return;
            }

            // Check if this is a reply to status
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            
            if (!quotedMessage || !this.isStatusReply({ quotedMessage, contextInfo })) {
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '❌ Please reply to a WhatsApp status with .save'
                });
                return;
            }
            
            // Extract media or text from status
            const mediaData = await this.extractStatusMedia(quotedMessage);
            const botPrivateChat = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            
            if (mediaData) {
                // Send media to bot private chat
                await this.bot.sock.sendMessage(botPrivateChat, mediaData);
                
                // Confirm to user
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '✅ Status media saved to bot private chat'
                });
                
                console.log(`💾 Saved status media to bot private chat`);
            } else {
                // Handle text status
                const textContent = this.extractStatusText(quotedMessage);
                if (textContent) {
                    await this.bot.sock.sendMessage(botPrivateChat, {
                        text: `📝 Saved Status Text:\n\n${textContent}`
                    });
                    
                    await this.bot.sock.sendMessage(jids.chat_jid, {
                        text: '✅ Status text saved to bot private chat'
                    });
                    
                    console.log(`💾 Saved status text to bot private chat`);
                } else {
                    await this.bot.sock.sendMessage(jids.chat_jid, {
                        text: '❌ No content found in the status to save'
                    });
                }
            }
        } catch (error) {
            console.error(`Error in save command: ${error.message}`);
        }
    }

    /**
     * Extract media from status message
     */
    async extractStatusMedia(quotedMessage) {
        try {
            const { downloadMediaMessage } = require('baileys');
            const messageContent = quotedMessage.message || quotedMessage;
            
            // Create a mock message structure for baileys
            const mockMessage = {
                key: quotedMessage.key || {},
                message: messageContent
            };
            
            // Check for different media types
            if (messageContent.imageMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    image: buffer,
                    caption: messageContent.imageMessage.caption || ''
                };
            }
            
            if (messageContent.videoMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    video: buffer,
                    caption: messageContent.videoMessage.caption || ''
                };
            }
            
            if (messageContent.audioMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    audio: buffer,
                    mimetype: messageContent.audioMessage.mimetype
                };
            }
            
            if (messageContent.documentMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    document: buffer,
                    mimetype: messageContent.documentMessage.mimetype,
                    fileName: messageContent.documentMessage.fileName
                };
            }
            
            if (messageContent.stickerMessage) {
                const buffer = await downloadMediaMessage(mockMessage, 'buffer', {});
                return {
                    sticker: buffer
                };
            }
            
            return null;
        } catch (error) {
            console.error(`Error extracting status media: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract text content from status
     */
    extractStatusText(quotedMessage) {
        try {
            const messageContent = quotedMessage.message || quotedMessage;
            
            if (messageContent.conversation) {
                return messageContent.conversation;
            }
            
            if (messageContent.extendedTextMessage) {
                return messageContent.extendedTextMessage.text;
            }
            
            // Check for text in media messages
            if (messageContent.imageMessage?.caption) {
                return messageContent.imageMessage.caption;
            }
            
            if (messageContent.videoMessage?.caption) {
                return messageContent.videoMessage.caption;
            }
            
            return null;
        } catch (error) {
            console.error(`Error extracting status text: ${error.message}`);
            return null;
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new StatusPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
