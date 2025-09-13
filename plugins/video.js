/**
 * MATDEV Video Plugin
 * Convert GIF or GIF stickers to video format
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class VideoPlugin {
    constructor() {
        this.name = 'video';
        this.description = 'Convert GIF or GIF stickers to video';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure media directory exists
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Video plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('video', this.videoCommand.bind(this), {
            description: 'Convert GIF or GIF sticker to video',
            usage: `${config.PREFIX}video (reply to GIF or GIF sticker)`,
            category: 'media',
            plugin: 'video',
            source: 'video.js'
        });
    }

    /**
     * Convert GIF or GIF sticker to video
     */
    async videoCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or GIF sticker.');
                return;
            }

            // Check if it's a GIF sticker or regular GIF
            const isGifSticker = quotedMessage.stickerMessage && quotedMessage.stickerMessage.isAnimated;
            const isGifImage = quotedMessage.imageMessage && quotedMessage.imageMessage.mimetype === 'image/gif';
            const isGifDocument = quotedMessage.documentMessage && quotedMessage.documentMessage.mimetype === 'image/gif';

            if (!isGifSticker && !isGifImage && !isGifDocument) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a GIF or GIF sticker.');
                return;
            }

            // Determine media type
            let mediaType;
            if (isGifSticker) {
                mediaType = 'stickerMessage';
            } else if (isGifImage) {
                mediaType = 'imageMessage';
            } else {
                mediaType = 'documentMessage';
            }

            const buffer = await this.downloadMedia(quotedMessage, mediaType);
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process GIF. Please try again.');
                return;
            }

            // Send as video
            await this.bot.sock.sendMessage(messageInfo.sender, {
                video: buffer.buffer,
                mimetype: 'video/mp4',
                caption: '🎬 GIF converted to video'
            });

        } catch (error) {
            console.log('Video error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting GIF to video.');
        }
    }

    /**
     * Download media using robust method
     */
    async downloadMedia(quotedMessage, mediaType) {
        try {
            // Create a mock message structure for download
            const messageToDownload = {
                key: {
                    id: 'temp-' + Date.now(),
                    remoteJid: 'temp',
                    fromMe: false
                },
                message: quotedMessage
            };

            // Try downloading as stream first (memory efficient)
            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            if (!stream) {
                throw new Error('Stream download failed');
            }

            // Convert stream to buffer
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            
            const buffer = Buffer.concat(chunks);
            
            if (!buffer || buffer.length === 0) {
                throw new Error('Empty buffer received');
            }

            return { buffer, stream };

        } catch (error) {
            console.log('Media download error:', error);
            
            // Fallback: Try buffer download
            try {
                const messageToDownload = {
                    key: {
                        id: 'temp-' + Date.now(),
                        remoteJid: 'temp',
                        fromMe: false
                    },
                    message: quotedMessage
                };

                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });
                
                return { buffer };
            } catch (fallbackError) {
                console.log('Fallback download also failed:', fallbackError);
                return null;
            }
        }
    }
}

module.exports = VideoPlugin;