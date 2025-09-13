/**
 * MATDEV Info Plugin
 * Get detailed information about any media file
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');

class InfoPlugin {
    constructor() {
        this.name = 'info';
        this.description = 'Get detailed information about any media file';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        // Ensure media directory exists
        await fs.ensureDir(path.join(process.cwd(), 'session', 'media'));

        console.log('✅ Info plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('info', this.infoCommand.bind(this), {
            description: 'Get detailed information about any media file',
            usage: `${config.PREFIX}info (reply to any media)`,
            category: 'media',
            plugin: 'info',
            source: 'info.js'
        });
    }

    /**
     * Get detailed information about any media file
     */
    async infoCommand(messageInfo) {
        try {
            // Check for quoted message in the proper structure
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a media message.');
                return;
            }

            // Determine media type
            const mediaType = this.getMediaType(quotedMessage);
            if (!mediaType) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Quoted message is not a media file.');
                return;
            }

            // Get media information
            const mediaContent = quotedMessage[mediaType];
            const mediaInfo = await this.getMediaInfo(mediaContent, mediaType);

            const infoText = `*📱 MEDIA INFORMATION*\n\n` +
                `*Type:* ${mediaType.replace('Message', '').toUpperCase()}\n` +
                `*Size:* ${mediaInfo.size ? this.formatFileSize(mediaInfo.size) : 'Unknown'}\n` +
                `*Duration:* ${mediaInfo.duration ? `${mediaInfo.duration}s` : 'N/A'}\n` +
                `*Dimensions:* ${mediaInfo.width && mediaInfo.height ? `${mediaInfo.width}x${mediaInfo.height}` : 'N/A'}\n` +
                `*MIME Type:* ${mediaInfo.mimetype || 'Unknown'}\n` +
                `*File Name:* ${mediaInfo.fileName || 'Unknown'}\n` +
                `*Animated:* ${mediaInfo.gifPlayback ? 'Yes' : 'No'}\n` +
                `*Viewonce:* ${mediaInfo.viewOnce ? 'Yes' : 'No'}`;

            await this.bot.messageHandler.reply(messageInfo, infoText);

        } catch (error) {
            console.log('Info error:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error retrieving media information.');
        }
    }

    /**
     * Get media type from message directly
     */
    getMediaType(message) {
        // Check for media types directly on the quoted message content
        if (message.imageMessage) return 'imageMessage';
        if (message.videoMessage) return 'videoMessage';
        if (message.audioMessage) return 'audioMessage';
        if (message.documentMessage) return 'documentMessage';
        if (message.stickerMessage) return 'stickerMessage';
        
        return null; // No media found
    }

    /**
     * Get media information from media content
     */
    async getMediaInfo(mediaContent, mediaType) {
        const info = {
            type: mediaType,
            size: mediaContent.fileLength || null,
            duration: mediaContent.seconds || null,
            width: mediaContent.width || null,
            height: mediaContent.height || null,
            mimetype: mediaContent.mimetype || null,
            fileName: mediaContent.fileName || null,
            gifPlayback: mediaContent.gifPlayback || false,
            viewOnce: mediaContent.viewOnce || false
        };

        return info;
    }

    /**
     * Format file size in human readable format
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = InfoPlugin;