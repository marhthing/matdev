const config = require('../config');

const StatusPlugin = {
    name: 'status',

    async init(bot) {
        this.bot = bot;
        this.logger = bot.logger;

        // Register save command
        bot.messageHandler.registerCommand('save', this.handleSaveCommand.bind(this), {
            description: 'Save replied status media to bot private chat',
            usage: `${config.PREFIX}save (reply to status)`,
            category: 'Status'
        });

        this.logger.info('✅ Status plugin loaded');
        return this;
    },

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
    },

    /**
     * Check if message is a reply to WhatsApp status
     */
    isStatusReply(messageInfo) {
        // Check if message has quoted message and it's from status
        if (!messageInfo.quotedMessage) return false;
        
        // Status messages have specific characteristics:
        // 1. They come from status@broadcast
        // 2. Or have specific contextInfo indicating status
        const quotedContext = messageInfo.quotedMessage.contextInfo;
        const isStatusBroadcast = quotedContext?.remoteJid?.includes('status@broadcast') || 
                                 quotedContext?.participant?.includes('status@broadcast') ||
                                 messageInfo.quotedMessage.key?.remoteJid?.includes('status@broadcast');
        
        return isStatusBroadcast;
    },

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
    },

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
    },

    /**
     * Handle .save command to save status media to bot private chat
     */
    async handleSaveCommand(message) {
        try {
            const messageInfo = this.bot.extractMessageInfo(message);
            
            // Ensure this is a reply to status
            if (!this.isStatusReply(messageInfo)) {
                await this.bot.sock.sendMessage(messageInfo.chat, {
                    text: '❌ Please reply to a WhatsApp status with .save'
                });
                return;
            }

            const quotedMessage = messageInfo.quotedMessage;
            
            // Extract media or text from status
            const mediaData = await this.extractStatusMedia(quotedMessage);
            const botPrivateChat = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            
            if (mediaData) {
                // Send media to bot private chat
                await this.bot.sock.sendMessage(botPrivateChat, mediaData);
                
                // Confirm to user
                await this.bot.sock.sendMessage(messageInfo.chat, {
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
                    
                    await this.bot.sock.sendMessage(messageInfo.chat, {
                        text: '✅ Status text saved to bot private chat'
                    });
                    
                    console.log(`💾 Saved status text to bot private chat`);
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat, {
                        text: '❌ No content found in the status to save'
                    });
                }
            }
        } catch (error) {
            console.error(`Error in save command: ${error.message}`);
        }
    },

    /**
     * Extract media from status message
     */
    async extractStatusMedia(quotedMessage) {
        try {
            const messageContent = quotedMessage.message || quotedMessage;
            
            // Check for different media types
            if (messageContent.imageMessage) {
                return {
                    image: await this.bot.downloadMediaMessage(quotedMessage),
                    caption: messageContent.imageMessage.caption || ''
                };
            }
            
            if (messageContent.videoMessage) {
                return {
                    video: await this.bot.downloadMediaMessage(quotedMessage),
                    caption: messageContent.videoMessage.caption || ''
                };
            }
            
            if (messageContent.audioMessage) {
                return {
                    audio: await this.bot.downloadMediaMessage(quotedMessage),
                    mimetype: messageContent.audioMessage.mimetype
                };
            }
            
            if (messageContent.documentMessage) {
                return {
                    document: await this.bot.downloadMediaMessage(quotedMessage),
                    mimetype: messageContent.documentMessage.mimetype,
                    fileName: messageContent.documentMessage.fileName
                };
            }
            
            if (messageContent.stickerMessage) {
                return {
                    sticker: await this.bot.downloadMediaMessage(quotedMessage)
                };
            }
            
            return null;
        } catch (error) {
            console.error(`Error extracting status media: ${error.message}`);
            return null;
        }
    },

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
};

module.exports = StatusPlugin;