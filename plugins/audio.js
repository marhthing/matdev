/**
 * MATDEV Audio Plugin
 * Extract audio from videos and send as voice note
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class AudioPlugin {
    constructor() {
        this.name = 'audio';
        this.description = 'Extract audio from videos and send as voice note';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure media directory exists
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Audio plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('audio', this.audioCommand.bind(this), {
            description: 'Extract audio from video and send as voice note',
            usage: `${config.PREFIX}audio (reply to video)`,
            category: 'media',
            plugin: 'audio',
            source: 'audio.js'
        });
    }

    /**
     * Extract audio from video and send as voice note
     */
    async audioCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video.');
                return;
            }

            if (!quotedMessage.videoMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video.');
                return;
            }

            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, 'videoMessage');
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process video. Please try again.');
                return;
            }

            // Send as voice note (ptt: true for voice note)
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: buffer.buffer,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true // This makes it a voice note
            });

        } catch (error) {
            console.log('Audio error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error extracting audio from video.');
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
const audioPlugin = new AudioPlugin();

module.exports = {
    init: audioPlugin.init.bind(audioPlugin),
    name: audioPlugin.name,
    description: audioPlugin.description,
    version: audioPlugin.version
};