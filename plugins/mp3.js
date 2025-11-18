/**
 * MATDEV MP3 Plugin
 * Extract audio and send as downloadable MP3 file
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

class Mp3Plugin {
    constructor() {
        this.name = 'mp3';
        this.description = 'Extract audio and send as downloadable MP3 file';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure tmp directory exists
        await fs.ensureDir(path.join(process.cwd(), 'tmp'));

        console.log('✅ MP3 plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('mp3', this.mp3Command.bind(this), {
            description: 'Extract audio and send as downloadable MP3 file',
            usage: `${config.PREFIX}mp3 (reply to audio or video)`,
            category: 'media',
            plugin: 'mp3',
            source: 'mp3.js'
        });
    }

    /**
     * Extract audio and send as downloadable MP3 file
     */
    async mp3Command(messageInfo) {
        let tempFilePath = null;

        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or video file.');
                return;
            }

            // Check if it's audio or video
            if (!quotedMessage.audioMessage && !quotedMessage.videoMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or video file.');
                return;
            }

            const mediaType = quotedMessage.audioMessage ? 'audioMessage' : 'videoMessage';
            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, mediaType);
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process media. Please try again.');
                return;
            }

            // Generate temp filename in tmp directory
            const timestamp = Date.now();
            const tempFileName = `audio_${timestamp}.mp3`;
            tempFilePath = path.join(process.cwd(), 'tmp', tempFileName);

            // Write buffer to temp file
            await fs.writeFile(tempFilePath, buffer.buffer);

            // Send as downloadable MP3 file
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: { url: tempFilePath },
                mimetype: 'audio/mpeg',
                fileName: `audio_${timestamp}.mp3`
            });

        } catch (error) {
            console.log('MP3 error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error converting to MP3.');
        } finally {
            // Clean up temp file
            if (tempFilePath) {
                try {
                    await fs.unlink(tempFilePath);
                } catch (cleanupError) {
                    console.log('Cleanup error (non-critical):', cleanupError.message);
                }
            }
        }
    }

    /**
     * Robust media download with latest Baileys methods
     */
    async downloadMediaRobust(messageInfo, quoted, mediaType) {
        try {
            // Extract contextInfo for proper quoted message key construction
            const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
            
            if (!ctx || !ctx.stanzaId) {
                throw new Error('No quoted message context found - unable to download media');
            }

            // Construct proper key using contextInfo data
            const quotedKey = {
                id: ctx.stanzaId,
                remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                fromMe: ctx.participant ? (ctx.participant === this.bot.sock.user?.id) : false,
                participant: ctx.participant || undefined
            };

            // Create proper WAMessage structure with correct key
            const messageToDownload = {
                key: quotedKey,
                message: quoted
            };

            // Try downloading as stream first (memory efficient)
            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            // Convert stream to buffer
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            if (!buffer || buffer.length === 0) {
                throw new Error('Downloaded buffer is empty');
            }

            return {
                buffer,
                info: {
                    size: buffer.length,
                    source: 'stream_download'
                }
            };

        } catch (error) {
            console.error('Stream download failed, trying buffer fallback:', error);
            
            try {
                // Use same key extraction for buffer fallback
                const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;
                
                if (!ctx || !ctx.stanzaId) {
                    throw new Error('No quoted message context found for buffer fallback');
                }

                const quotedKey = {
                    id: ctx.stanzaId,
                    remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                    fromMe: ctx.participant ? (ctx.participant === this.bot.sock.user?.id) : false,
                    participant: ctx.participant || undefined
                };

                const messageToDownload = {
                    key: quotedKey,
                    message: quoted
                };

                const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                    logger: console,
                    reuploadRequest: this.bot.sock.updateMediaMessage
                });

                return {
                    buffer,
                    info: {
                        size: buffer.length,
                        source: 'buffer_fallback'
                    }
                };
            } catch (fallbackError) {
                console.error('All download methods failed:', fallbackError);
                return null;
            }
        }
    }
}

// Export the plugin class instance with init function
const mp3Plugin = new Mp3Plugin();

module.exports = {
    init: mp3Plugin.init.bind(mp3Plugin),
    name: mp3Plugin.name,
    description: mp3Plugin.description,
    version: mp3Plugin.version
};