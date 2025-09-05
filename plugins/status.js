
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
        
        // Setup event listeners when socket becomes available
        this.setupEventListeners();
        
        console.log('✅ Status plugin loaded');
        return this;
    }

    /**
     * Setup event listeners when socket is available
     */
    setupEventListeners() {
        // Check if socket is already available
        if (this.bot.sock && this.bot.sock.ev) {
            this.registerSocketEvents();
        } else {
            // Wait for socket to be available
            const checkSocket = () => {
                if (this.bot.sock && this.bot.sock.ev) {
                    this.registerSocketEvents();
                } else {
                    setTimeout(checkSocket, 100);
                }
            };
            checkSocket();
        }
    }

    /**
     * Register socket events
     */
    registerSocketEvents() {
        try {
            // Register message handler for auto-send functionality
            this.bot.sock.ev.on('messages.upsert', this.handleMessagesUpsert.bind(this));
            
            // Monitor status updates for auto-saving
            this.bot.sock.ev.on('messages.upsert', this.handleStatusMonitoring.bind(this));
            
            console.log('✅ Status plugin socket events registered');
        } catch (error) {
            console.error('Error registering status plugin events:', error);
        }
    }

    /**
     * Register all status commands
     */
    registerCommands() {
        // Register save command
        this.bot.messageHandler.registerCommand('save', this.handleSaveCommand.bind(this), {
            description: 'Save any replied message to bot private chat',
            usage: `${config.PREFIX}save (reply to any message)`,
            category: 'utility'
        });
    }

    async handleMessagesUpsert({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Extract JID information using centralized JID utils
                const jids = this.bot.jidUtils.extractJIDs(message);
                if (!jids) continue;

                // Get message text
                const messageType = Object.keys(message.message || {})[0];
                const content = message.message[messageType];
                let text = '';

                if (typeof content === 'string') {
                    text = content;
                } else if (content?.text) {
                    text = content.text;
                }

                if (!text) continue;

                // Check if this is a reply to a status
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const contextInfo = message.message?.extendedTextMessage?.contextInfo;
                
                if (quotedMessage && this.isStatusReply({ quotedMessage, contextInfo })) {
                    // Handle auto-send functionality for bot owner's status
                    if (this.shouldAutoSend(text.toLowerCase(), contextInfo, jids)) {
                        await this.handleAutoSend(quotedMessage, jids.chat_jid);
                    }
                }
            } catch (error) {
                console.error(`Error in status message handler: ${error.message}`);
            }
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
    shouldAutoSend(text, contextInfo, jids) {
        // Only auto-send if replying to bot owner's status
        const botOwnerJid = `${config.OWNER_NUMBER}@s.whatsapp.net`;
        const isReplyingToBotOwner = contextInfo?.participant === botOwnerJid;
        
        // Don't auto-send to the bot owner themselves
        if (jids.participant_jid === botOwnerJid) {
            return false;
        }
        
        // Check for 'send' keyword variations (more comprehensive)
        const hasSendKeyword = text.includes('send') || 
                              text.includes('please send') || 
                              text.includes('send please') ||
                              text.includes('pls send') ||
                              text.includes('send pls') ||
                              text.includes('plz send') ||
                              text.includes('send plz') ||
                              text.match(/\bsend\b/);
        
        console.log(`🔍 Auto-send check: Bot owner status: ${isReplyingToBotOwner}, Has send keyword: ${hasSendKeyword}, Text: "${text}"`);
        
        return isReplyingToBotOwner && hasSendKeyword;
    }

    /**
     * Auto-send status media to user who replied with 'send'
     */
    async handleAutoSend(quotedMessage, userJid) {
        try {
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
     * Monitor status updates for auto-saving own status
     */
    async handleStatusMonitoring({ messages, type }) {
        if (type !== 'notify') return;

        for (const message of messages) {
            try {
                // Check if this is a status update from the bot owner
                if (message.key.remoteJid === 'status@broadcast' && 
                    message.key.participant === `${config.OWNER_NUMBER}@s.whatsapp.net`) {
                    
                    console.log('📱 Detected own status update, auto-saving...');
                    
                    // Extract media or text from status
                    const mediaData = await this.extractStatusMedia(message);
                    const botPrivateChat = `${config.OWNER_NUMBER}@s.whatsapp.net`;
                    
                    if (mediaData) {
                        // Send media to bot private chat
                        await this.bot.sock.sendMessage(botPrivateChat, {
                            ...mediaData,
                            caption: `📱 *Auto-saved Own Status*\n\n${mediaData.caption || ''}\n\n_Saved at: ${new Date().toLocaleString()}_`
                        });
                        
                        console.log(`💾 Auto-saved own status media to bot private chat`);
                    } else {
                        // Handle text status
                        const textContent = this.extractStatusText(message);
                        if (textContent) {
                            await this.bot.sock.sendMessage(botPrivateChat, {
                                text: `📱 *Auto-saved Own Status*\n\n${textContent}\n\n_Saved at: ${new Date().toLocaleString()}_`
                            });
                            
                            console.log(`💾 Auto-saved own status text to bot private chat`);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error in status monitoring: ${error.message}`);
            }
        }
    }

    /**
     * Handle .save command to save any replied message to bot private chat
     */
    async handleSaveCommand(message) {
        try {
            // Extract JID information using centralized JID utils
            const jids = this.bot.jidUtils.extractJIDs(message);
            if (!jids) {
                console.error('Failed to extract JIDs from message');
                return;
            }

            // Check if this is a reply to any message
            const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
            const contextInfo = message.message?.extendedTextMessage?.contextInfo;
            
            if (!quotedMessage) {
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '❌ Please reply to any message with .save'
                });
                return;
            }
            
            const botPrivateChat = `${config.OWNER_NUMBER}@s.whatsapp.net`;
            const timestamp = new Date().toLocaleString();
            
            // Get sender info for context
            const senderJid = contextInfo?.participant || contextInfo?.remoteJid || 'Unknown';
            const senderName = senderJid.split('@')[0];
            const chatName = jids.is_group ? 'Group Chat' : 'Private Chat';
            
            // Handle different message types
            const messageType = Object.keys(quotedMessage)[0];
            let savedMessage = null;
            
            console.log(`🔍 Processing save command for message type: ${messageType}`);
            
            switch (messageType) {
                case 'conversation':
                    // Regular text message
                    savedMessage = {
                        text: `💾 *SAVED MESSAGE*\n\n` +
                              `📨 *From:* ${senderName}\n` +
                              `💬 *Chat:* ${chatName}\n` +
                              `🕐 *Saved:* ${timestamp}\n\n` +
                              `📝 *Message:*\n${quotedMessage.conversation}`
                    };
                    break;
                    
                case 'extendedTextMessage':
                    // Extended text (with links, formatting, etc.)
                    savedMessage = {
                        text: `💾 *SAVED MESSAGE*\n\n` +
                              `📨 *From:* ${senderName}\n` +
                              `💬 *Chat:* ${chatName}\n` +
                              `🕐 *Saved:* ${timestamp}\n\n` +
                              `📝 *Message:*\n${quotedMessage.extendedTextMessage.text}`
                    };
                    break;
                    
                case 'imageMessage':
                    // Image message
                    try {
                        const buffer = await this.extractAnyMedia(quotedMessage);
                        savedMessage = {
                            image: buffer,
                            caption: `💾 *SAVED IMAGE*\n\n` +
                                    `📨 *From:* ${senderName}\n` +
                                    `💬 *Chat:* ${chatName}\n` +
                                    `🕐 *Saved:* ${timestamp}\n\n` +
                                    `${quotedMessage.imageMessage.caption ? `📝 *Caption:* ${quotedMessage.imageMessage.caption}` : ''}`
                        };
                    } catch (error) {
                        console.error('Error downloading image:', error);
                        savedMessage = {
                            text: `💾 *SAVED MESSAGE (Image)*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}\n\n` +
                                  `⚠️ Could not download image\n` +
                                  `${quotedMessage.imageMessage.caption ? `📝 *Caption:* ${quotedMessage.imageMessage.caption}` : ''}`
                        };
                    }
                    break;
                    
                case 'videoMessage':
                    // Video message
                    try {
                        const buffer = await this.extractAnyMedia(quotedMessage);
                        savedMessage = {
                            video: buffer,
                            caption: `💾 *SAVED VIDEO*\n\n` +
                                    `📨 *From:* ${senderName}\n` +
                                    `💬 *Chat:* ${chatName}\n` +
                                    `🕐 *Saved:* ${timestamp}\n\n` +
                                    `${quotedMessage.videoMessage.caption ? `📝 *Caption:* ${quotedMessage.videoMessage.caption}` : ''}`
                        };
                    } catch (error) {
                        console.error('Error downloading video:', error);
                        savedMessage = {
                            text: `💾 *SAVED MESSAGE (Video)*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}\n\n` +
                                  `⚠️ Could not download video\n` +
                                  `${quotedMessage.videoMessage.caption ? `📝 *Caption:* ${quotedMessage.videoMessage.caption}` : ''}`
                        };
                    }
                    break;
                    
                case 'audioMessage':
                    // Audio message
                    try {
                        const buffer = await this.extractAnyMedia(quotedMessage);
                        savedMessage = {
                            audio: buffer,
                            mimetype: quotedMessage.audioMessage.mimetype || 'audio/mpeg'
                        };
                        // Send context separately for audio
                        await this.bot.sock.sendMessage(botPrivateChat, {
                            text: `💾 *SAVED AUDIO*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}`
                        });
                    } catch (error) {
                        console.error('Error downloading audio:', error);
                        savedMessage = {
                            text: `💾 *SAVED MESSAGE (Audio)*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}\n\n` +
                                  `⚠️ Could not download audio`
                        };
                    }
                    break;
                    
                case 'documentMessage':
                    // Document message
                    try {
                        const buffer = await this.extractAnyMedia(quotedMessage);
                        savedMessage = {
                            document: buffer,
                            mimetype: quotedMessage.documentMessage.mimetype,
                            fileName: quotedMessage.documentMessage.fileName || 'document',
                            caption: `💾 *SAVED DOCUMENT*\n\n` +
                                    `📨 *From:* ${senderName}\n` +
                                    `💬 *Chat:* ${chatName}\n` +
                                    `🕐 *Saved:* ${timestamp}\n\n` +
                                    `📄 *File:* ${quotedMessage.documentMessage.fileName || 'Unknown'}`
                        };
                    } catch (error) {
                        console.error('Error downloading document:', error);
                        savedMessage = {
                            text: `💾 *SAVED MESSAGE (Document)*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}\n\n` +
                                  `⚠️ Could not download document\n` +
                                  `📄 *File:* ${quotedMessage.documentMessage.fileName || 'Unknown'}`
                        };
                    }
                    break;
                    
                case 'stickerMessage':
                    // Sticker message
                    try {
                        const buffer = await this.extractAnyMedia(quotedMessage);
                        savedMessage = {
                            sticker: buffer
                        };
                        // Send context separately for sticker
                        await this.bot.sock.sendMessage(botPrivateChat, {
                            text: `💾 *SAVED STICKER*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}`
                        });
                    } catch (error) {
                        console.error('Error downloading sticker:', error);
                        savedMessage = {
                            text: `💾 *SAVED MESSAGE (Sticker)*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}\n\n` +
                                  `⚠️ Could not download sticker`
                        };
                    }
                    break;
                    
                case 'viewOnceMessage':
                    // View once message (attempt to save)
                    const viewOnceContent = quotedMessage.viewOnceMessage.message;
                    const viewOnceType = Object.keys(viewOnceContent)[0];
                    
                    try {
                        const buffer = await this.extractAnyMedia(quotedMessage);
                        if (viewOnceType === 'imageMessage') {
                            savedMessage = {
                                image: buffer,
                                caption: `💾 *SAVED VIEW ONCE IMAGE*\n\n` +
                                        `📨 *From:* ${senderName}\n` +
                                        `💬 *Chat:* ${chatName}\n` +
                                        `🕐 *Saved:* ${timestamp}\n\n` +
                                        `👁️ *Note:* This was a view once message\n` +
                                        `${viewOnceContent.imageMessage.caption ? `📝 *Caption:* ${viewOnceContent.imageMessage.caption}` : ''}`
                            };
                        } else if (viewOnceType === 'videoMessage') {
                            savedMessage = {
                                video: buffer,
                                caption: `💾 *SAVED VIEW ONCE VIDEO*\n\n` +
                                        `📨 *From:* ${senderName}\n` +
                                        `💬 *Chat:* ${chatName}\n` +
                                        `🕐 *Saved:* ${timestamp}\n\n` +
                                        `👁️ *Note:* This was a view once message\n` +
                                        `${viewOnceContent.videoMessage.caption ? `📝 *Caption:* ${viewOnceContent.videoMessage.caption}` : ''}`
                            };
                        }
                    } catch (error) {
                        console.error('Error downloading view once media:', error);
                        savedMessage = {
                            text: `💾 *SAVED MESSAGE (View Once)*\n\n` +
                                  `📨 *From:* ${senderName}\n` +
                                  `💬 *Chat:* ${chatName}\n` +
                                  `🕐 *Saved:* ${timestamp}\n\n` +
                                  `👁️ *Note:* This was a view once message\n` +
                                  `⚠️ Could not download media`
                        };
                    }
                    break;
                    
                default:
                    // Unknown message type
                    savedMessage = {
                        text: `💾 *SAVED MESSAGE*\n\n` +
                              `📨 *From:* ${senderName}\n` +
                              `💬 *Chat:* ${chatName}\n` +
                              `🕐 *Saved:* ${timestamp}\n\n` +
                              `📝 *Type:* ${messageType}\n` +
                              `⚠️ Unsupported message type`
                    };
                    break;
            }
            
            // Send the saved message to bot private chat
            if (savedMessage) {
                await this.bot.sock.sendMessage(botPrivateChat, savedMessage);
                console.log(`💾 Saved ${messageType} message to bot private chat`);
                
                // Send confirmation to user
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '✅ Message saved to bot private chat'
                });
            }
            
        } catch (error) {
            console.error(`Error in save command: ${error.message}`);
            const jids = this.bot.jidUtils.extractJIDs(message);
            if (jids) {
                await this.bot.sock.sendMessage(jids.chat_jid, {
                    text: '❌ Error saving message'
                });
            }
        }
    }

    /**
     * Extract media from any message type
     */
    async extractAnyMedia(quotedMessage) {
        try {
            const { downloadMediaMessage } = require('baileys');
            
            // Handle different message structures
            let messageContent = quotedMessage.message || quotedMessage;
            let messageKey = quotedMessage.key || {};
            
            // Handle view once messages
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
            console.error(`Error extracting media: ${error.message}`);
            throw error;
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
