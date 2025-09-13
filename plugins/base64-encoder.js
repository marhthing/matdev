const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

class Base64EncoderPlugin {
    constructor() {
        this.name = 'base64-encoder';
        this.description = 'Encode and decode text/media using Base64 with URL shortening';
        this.version = '2.1.0';
        this.enabled = true;
        
        // Base64 size threshold for automatic URL storage (10KB)
        this.URL_STORAGE_THRESHOLD = 10 * 1024;
        
        // Allowed domains for URL fetching (security)
        this.ALLOWED_DOMAINS = [
            '0x0.st',
            'paste.rs', 
            'hastebin.com',
            'tinyurl.com',
            'is.gd',
            'v.gd'
        ];
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('encode', this.encodeCommand.bind(this), {
                description: 'Encode text/media to Base64',
                usage: `${config.PREFIX}encode <text> OR reply to media`,
                category: 'utility',
                plugin: 'base64-encoder',
                source: 'base64-encoder.js'
            });

            this.bot.messageHandler.registerCommand('decode', this.decodeCommand.bind(this), {
                description: 'Decode Base64 to text/media',
                usage: `${config.PREFIX}decode <base64>`,
                category: 'utility',
                plugin: 'base64-encoder',
                source: 'base64-encoder.js'
            });

            console.log('✅ Base64 Encoder plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Base64 Encoder plugin:', error);
            return false;
        }
    }

    async encodeCommand(messageInfo) {
        try {
            // Check for quoted message with media
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            // Check for direct media in current message
            const currentMedia = messageInfo.message?.imageMessage || 
                               messageInfo.message?.videoMessage || 
                               messageInfo.message?.audioMessage || 
                               messageInfo.message?.documentMessage ||
                               messageInfo.message?.stickerMessage;

            if (quotedMessage || currentMedia) {
                await this.encodeMediaCommand(messageInfo, quotedMessage, currentMedia);
                return;
            }

            // Handle text encoding
            const text = messageInfo.args.join(' ').trim();
            if (!text) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔐 Usage: .encode <text> OR reply to media\n\n' +
                    '**Text Examples:**\n• .encode Hello World!\n• .encode My secret message\n\n' +
                    '**Media:** Reply to any image, video, audio, document, or sticker');
                return;
            }

            if (text.length > 1000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 1000 characters.');
                return;
            }

            try {
                const encoded = Buffer.from(text, 'utf8').toString('base64');
                
                await this.bot.messageHandler.reply(messageInfo,
                    `🔐 **Base64 Encoded (Text)**\n\n` +
                    `**Original:** ${text.length > 50 ? text.substring(0, 50) + '...' : text}\n\n` +
                    `**Encoded:**\n\`\`\`${encoded}\`\`\`\n\n` +
                    `📊 Length: ${text.length} → ${encoded.length} chars`);

            } catch (error) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Error encoding text. Please check your input.');
            }

        } catch (error) {
            console.error('Error in encode command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error encoding text.');
        }
    }

    async decodeCommand(messageInfo) {
        try {
            const input = messageInfo.args.join(' ').trim();
            if (!input) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔓 Usage: .decode <base64|url>\n\n' +
                    '**Text Examples:**\n• .decode SGVsbG8gV29ybGQh\n• .decode TWVzc2FnZSB0byBkZWNvZGU=\n\n' +
                    '**Media:** Paste base64 or URL from .encode command');
                return;
            }

            // Check if input is a URL
            if (this.isValidURL(input)) {
                await this.decodeFromURL(messageInfo, input);
                return;
            }

            // Handle as direct base64
            if (input.length > 50000000) { // ~37MB limit for media base64
                await this.bot.messageHandler.reply(messageInfo, '❌ Base64 string too long! Maximum ~37MB.');
                return;
            }

            // Validate base64 format
            if (!this.isValidBase64(input)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid Base64 format or URL. Please check your input.');
                return;
            }

            try {
                const decodedBuffer = Buffer.from(input, 'base64');
                
                // Check if this is likely media data (check magic bytes)
                const mediaType = this.detectMediaType(decodedBuffer);
                
                if (mediaType) {
                    await this.decodeMediaCommand(messageInfo, decodedBuffer, mediaType, input.length);
                    return;
                }

                // Handle as text
                const decoded = decodedBuffer.toString('utf8');
                
                // Check if decoded text contains only printable characters
                if (!this.isPrintableText(decoded)) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `🔓 **Base64 Decoded**\n\n` +
                        `**Decoded:** *(Binary/non-printable data)*\n\n` +
                        `📊 Length: ${input.length} → ${decoded.length} bytes\n\n` +
                        `⚠️ The decoded content appears to be binary data but no media type detected.`);
                    return;
                }

                await this.bot.messageHandler.reply(messageInfo,
                    `🔓 **Base64 Decoded (Text)**\n\n` +
                    `**Original Base64:** ${input.length > 50 ? input.substring(0, 50) + '...' : input}\n\n` +
                    `**Decoded:**\n${decoded}\n\n` +
                    `📊 Length: ${input.length} → ${decoded.length} chars`);

            } catch (error) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Error decoding Base64. Please check your input format.');
            }

        } catch (error) {
            console.error('Error in decode command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error decoding Base64.');
        }
    }

    isValidBase64(str) {
        try {
            // Check if string matches Base64 pattern
            const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
            if (!base64Pattern.test(str)) {
                return false;
            }
            
            // Check if length is multiple of 4
            if (str.length % 4 !== 0) {
                return false;
            }

            // Try to decode it
            Buffer.from(str, 'base64');
            return true;
        } catch (error) {
            return false;
        }
    }

    isPrintableText(str) {
        // Check if string contains mostly printable ASCII characters
        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            // Allow printable ASCII (32-126) and common whitespace (9, 10, 13)
            if (!(charCode >= 32 && charCode <= 126) && ![9, 10, 13].includes(charCode)) {
                return false;
            }
        }
        return true;
    }

    async encodeMediaCommand(messageInfo, quotedMessage, currentMedia) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🔐 Processing media for Base64 encoding...');

            let mediaBuffer = null;
            let mediaType = '';
            let fileName = '';

            // Handle quoted message media
            if (quotedMessage) {
                const { downloadMediaMessage } = require('baileys');
                
                // Determine media type and get media object
                if (quotedMessage.imageMessage) {
                    mediaType = 'image';
                    fileName = quotedMessage.imageMessage.caption || 'encoded_image';
                } else if (quotedMessage.videoMessage) {
                    mediaType = 'video';
                    fileName = quotedMessage.videoMessage.caption || 'encoded_video';
                } else if (quotedMessage.audioMessage) {
                    mediaType = 'audio';
                    fileName = 'encoded_audio';
                } else if (quotedMessage.documentMessage) {
                    mediaType = 'document';
                    fileName = quotedMessage.documentMessage.fileName || 'encoded_document';
                } else if (quotedMessage.stickerMessage) {
                    mediaType = 'sticker';
                    fileName = 'encoded_sticker';
                } else {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Unsupported media type in quoted message.');
                    return;
                }

                // Download the media
                try {
                    mediaBuffer = await downloadMediaMessage(
                        { message: quotedMessage },
                        'buffer',
                        {},
                        {
                            logger: console,
                            reuploadRequest: this.bot.sock.updateMediaMessage
                        }
                    );
                } catch (downloadError) {
                    console.error('Media download error:', downloadError);
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download media. Please try again.');
                    return;
                }
            }
            // Handle current message media
            else if (currentMedia) {
                const { downloadMediaMessage } = require('baileys');
                
                if (messageInfo.message.imageMessage) {
                    mediaType = 'image';
                    fileName = messageInfo.message.imageMessage.caption || 'encoded_image';
                } else if (messageInfo.message.videoMessage) {
                    mediaType = 'video';
                    fileName = messageInfo.message.videoMessage.caption || 'encoded_video';
                } else if (messageInfo.message.audioMessage) {
                    mediaType = 'audio';
                    fileName = 'encoded_audio';
                } else if (messageInfo.message.documentMessage) {
                    mediaType = 'document';
                    fileName = messageInfo.message.documentMessage.fileName || 'encoded_document';
                } else if (messageInfo.message.stickerMessage) {
                    mediaType = 'sticker';
                    fileName = 'encoded_sticker';
                }

                try {
                    mediaBuffer = await downloadMediaMessage(
                        { key: messageInfo.key, message: messageInfo.message },
                        'buffer',
                        {},
                        {
                            logger: console,
                            reuploadRequest: this.bot.sock.updateMediaMessage
                        }
                    );
                } catch (downloadError) {
                    console.error('Media download error:', downloadError);
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download media. Please try again.');
                    return;
                }
            }

            if (!mediaBuffer || mediaBuffer.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, '❌ No media data found.');
                return;
            }

            // Check file size limit (25MB)
            if (mediaBuffer.length > 25 * 1024 * 1024) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Media file too large: ${this.formatFileSize(mediaBuffer.length)}\n` +
                    'Maximum supported size: 25MB');
                return;
            }

            // Encode to base64
            const encoded = mediaBuffer.toString('base64');
            
            // Check if base64 is large enough to store via URL
            if (encoded.length > this.URL_STORAGE_THRESHOLD) {
                await this.sendEncodedViaURL(messageInfo, encoded, mediaType, fileName, mediaBuffer.length);
            } else {
                // Send the encoded result directly
                await this.bot.messageHandler.reply(messageInfo,
                    `🔐 **Base64 Encoded (${mediaType.toUpperCase()})**\n\n` +
                    `**File:** ${fileName}\n` +
                    `**Size:** ${this.formatFileSize(mediaBuffer.length)}\n` +
                    `**Type:** ${mediaType}\n\n` +
                    `**Encoded Base64:**\n\`\`\`${encoded.substring(0, 100)}${encoded.length > 100 ? '...' : ''}\`\`\`\n\n` +
                    `📊 Original: ${this.formatFileSize(mediaBuffer.length)} → Base64: ${encoded.length} chars\n\n` +
                    `💡 Use .decode to restore this media file`);
            }

        } catch (error) {
            console.error('Error in encode media command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error encoding media.');
        }
    }

    async decodeMediaCommand(messageInfo, mediaBuffer, mediaType, base64Length) {
        try {
            await this.bot.messageHandler.reply(messageInfo, '🔓 Decoding Base64 to media file...');

            // Generate filename with timestamp
            const timestamp = Date.now();
            const extensions = {
                'image': 'jpg',
                'video': 'mp4', 
                'audio': 'mp3',
                'document': 'pdf',
                'sticker': 'webp'
            };
            
            const extension = extensions[mediaType] || 'bin';
            const fileName = `decoded_${mediaType}_${timestamp}.${extension}`;
            const tempPath = path.join(__dirname, '..', 'tmp', fileName);

            // Ensure tmp directory exists
            await fs.ensureDir(path.dirname(tempPath));

            // Save buffer to temp file
            await fs.writeFile(tempPath, mediaBuffer);

            // Send the media back based on type
            const caption = `🔓 **Decoded from Base64**\n\n` +
                          `**Type:** ${mediaType.toUpperCase()}\n` +
                          `**Size:** ${this.formatFileSize(mediaBuffer.length)}\n` +
                          `**Base64 Length:** ${base64Length} chars`;

            try {
                if (mediaType === 'image') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: { url: tempPath },
                        caption: caption
                    });
                } else if (mediaType === 'video') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        video: { url: tempPath },
                        caption: caption
                    });
                } else if (mediaType === 'audio') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        audio: { url: tempPath },
                        caption: caption
                    });
                } else if (mediaType === 'sticker') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        sticker: { url: tempPath }
                    });
                    // Send caption separately for stickers
                    await this.bot.messageHandler.reply(messageInfo, caption);
                } else {
                    // Handle as document
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        document: { url: tempPath },
                        fileName: fileName,
                        caption: caption
                    });
                }

                // Clean up temp file after a delay
                setTimeout(async () => {
                    try {
                        await fs.unlink(tempPath);
                    } catch (error) {
                        console.error('Error cleaning up temp file:', error);
                    }
                }, 5000);

            } catch (sendError) {
                console.error('Error sending decoded media:', sendError);
                await this.bot.messageHandler.reply(messageInfo, '❌ Error sending decoded media file.');
                
                // Clean up on error
                try {
                    await fs.unlink(tempPath);
                } catch (unlinkError) {
                    console.error('Error cleaning up temp file:', unlinkError);
                }
            }

        } catch (error) {
            console.error('Error in decode media command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error decoding media.');
        }
    }

    detectMediaType(buffer) {
        if (buffer.length < 4) return null;

        // Check magic bytes for common media types
        const magicBytes = buffer.subarray(0, 4);
        
        // JPEG
        if (magicBytes[0] === 0xFF && magicBytes[1] === 0xD8) return 'image';
        
        // PNG
        if (magicBytes[0] === 0x89 && magicBytes[1] === 0x50 && 
            magicBytes[2] === 0x4E && magicBytes[3] === 0x47) return 'image';
        
        // WebP
        if (buffer.length >= 12 && 
            buffer.subarray(0, 4).toString() === 'RIFF' &&
            buffer.subarray(8, 12).toString() === 'WEBP') return 'sticker';
        
        // MP4
        if (buffer.length >= 8 && buffer.subarray(4, 8).toString() === 'ftyp') return 'video';
        
        // PDF
        if (buffer.subarray(0, 4).toString() === '%PDF') return 'document';
        
        // Check for audio formats (simplified)
        if (magicBytes[0] === 0x49 && magicBytes[1] === 0x44 && magicBytes[2] === 0x33) return 'audio'; // MP3
        
        return null;
    }

    formatFileSize(bytes) {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    async cleanup() {
        console.log('🧹 Base64 Encoder plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new Base64EncoderPlugin();
        await plugin.init(bot);
        return plugin;
    }
};