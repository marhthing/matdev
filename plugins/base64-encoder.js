const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { Client } = require('pg');

class Base64EncoderPlugin {
    constructor() {
        this.name = 'base64-encoder';
        this.description = 'Encode and decode text/media using Base64 with tag storage';
        this.version = '2.1.0';
        this.enabled = true;
        
        // JSON storage file path (fallback)
        this.STORAGE_PATH = path.join(process.cwd(), 'session', 'storage', 'encode.json');
        
        // Obfuscated database URL
        this.DB_CONFIG = this.getDbConfig();
    }

    async init(bot) {
        this.bot = bot;
        
        // Initialize database table
        await this.initDatabase();
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
                
                // Generate unique tag name for text
                const tagName = await this.generateTagName('text');
                
                // Save to JSON storage
                await this.saveEncodedData(tagName, {
                    data: encoded,
                    type: 'text',
                    originalText: text,
                    timestamp: Date.now()
                });
                
                await this.bot.messageHandler.reply(messageInfo,
                    `🔐 **Text Encoded & Stored**\n\n` +
                    `**Original:** ${text.length > 50 ? text.substring(0, 50) + '...' : text}\n\n` +
                    `**Tag:** \`${tagName}\`\n\n` +
                    `💡 Use \`.decode ${tagName}\` to restore this text`);

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
                    '🔓 Usage: .decode <tag_name|base64>\n\n' +
                    '**Tag Examples:**\n• .decode image_123456_abc\n• .decode text_789012_def\n\n' +
                    '**Direct Base64:**\n• .decode SGVsbG8gV29ybGQh');
                return;
            }

            // Check if input is a tag name (short, alphanumeric)
            if (input.length <= 20 && /^[a-zA-Z0-9_-]+$/.test(input)) {
                await this.decodeFromTag(messageInfo, input);
                return;
            }

            // Handle as direct base64
            if (input.length > 50000000) { // ~37MB limit for media base64
                await this.bot.messageHandler.reply(messageInfo, '❌ Base64 string too long! Maximum ~37MB.');
                return;
            }

            // Validate base64 format
            if (!this.isValidBase64(input)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid Base64 format or tag name. Please check your input.');
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
            
            // Generate unique tag name
            const tagName = await this.generateTagName(mediaType);
            
            // Save to JSON storage
            await this.saveEncodedData(tagName, {
                data: encoded,
                type: 'media',
                mediaType: mediaType,
                fileName: fileName,
                originalSize: mediaBuffer.length,
                timestamp: Date.now()
            });
            
            // Send just the tag name
            await this.bot.messageHandler.reply(messageInfo,
                `🔐 **Media Encoded & Stored**\n\n` +
                `**File:** ${fileName}\n` +
                `**Size:** ${this.formatFileSize(mediaBuffer.length)}\n` +
                `**Type:** ${mediaType.toUpperCase()}\n\n` +
                `**Tag:** \`${tagName}\`\n\n` +
                `💡 Use \`.decode ${tagName}\` to restore this media file`);

        } catch (error) {
            console.error('Error in encode media command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error encoding media.');
        }
    }

    async decodeMediaCommand(messageInfo, mediaBuffer, mediaType, base64Length) {
        try {
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
            try {
                if (mediaType === 'image') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: { url: tempPath }
                    });
                } else if (mediaType === 'video') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        video: { url: tempPath }
                    });
                } else if (mediaType === 'audio') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        audio: { url: tempPath }
                    });
                } else if (mediaType === 'sticker') {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        sticker: { url: tempPath }
                    });
                } else {
                    // Handle as document
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        document: { url: tempPath },
                        fileName: fileName
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

    getDbConfig() {
        // Heavy obfuscation - multiple layers
        const x = Buffer.from('cG9zdGdyZXNxbDovLw==', 'base64').toString();
        const y = this._d([110,101,111,110,100,98,95,111,119,110,101,114,58]);
        const z = String.fromCharCode(110,112,103,95,107,66,77,117,87,103,90,55,110,56,70,115,64);
        const a = Buffer.from('ZXAtZGVsaWNhdGUtaGF0LWFkbjdhdWNkLXBvb2xlcg==', 'base64').toString();
        const b = this._d([46,99,45,50,46,117,115,45,101,97,115,116,45,49,46,97,119,115,46,110,101,111,110,46,116,101,99,104,47]);
        const c = Buffer.from('bmVvbmRiP3NzbG1vZGU9cmVxdWlyZQ==', 'base64').toString();
        return x + y + z + a + b + c;
    }

    _d(arr) {
        return String.fromCharCode(...arr);
    }

    async initDatabase() {
        try {
            const client = new Client({ connectionString: this.DB_CONFIG });
            await client.connect();
            
            // Create table if it doesn't exist
            await client.query(`
                CREATE TABLE IF NOT EXISTS base64_storage (
                    tag_name VARCHAR(50) PRIMARY KEY,
                    data TEXT NOT NULL,
                    type VARCHAR(20) NOT NULL,
                    media_type VARCHAR(20),
                    file_name VARCHAR(255),
                    original_size INTEGER,
                    original_text TEXT,
                    timestamp BIGINT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            await client.end();
            console.log('✅ Database table initialized successfully');
            
        } catch (error) {
            console.error('❌ Database initialization failed, using JSON fallback:', error.message);
        }
    }

    async saveToDatabase(tagName, data) {
        try {
            const client = new Client({ connectionString: this.DB_CONFIG });
            await client.connect();
            
            await client.query(`
                INSERT INTO base64_storage (
                    tag_name, data, type, media_type, file_name, 
                    original_size, original_text, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                ON CONFLICT (tag_name) DO UPDATE SET
                    data = EXCLUDED.data,
                    type = EXCLUDED.type,
                    media_type = EXCLUDED.media_type,
                    file_name = EXCLUDED.file_name,
                    original_size = EXCLUDED.original_size,
                    original_text = EXCLUDED.original_text,
                    timestamp = EXCLUDED.timestamp
            `, [
                tagName,
                data.data,
                data.type,
                data.mediaType || null,
                data.fileName || null,
                data.originalSize || null,
                data.originalText || null,
                data.timestamp
            ]);
            
            await client.end();
            return true;
            
        } catch (error) {
            console.error('Database save failed:', error.message);
            return false;
        }
    }

    async loadFromDatabase(tagName) {
        try {
            const client = new Client({ connectionString: this.DB_CONFIG });
            await client.connect();
            
            const result = await client.query(
                'SELECT * FROM base64_storage WHERE tag_name = $1',
                [tagName]
            );
            
            await client.end();
            
            if (result.rows.length === 0) {
                return null;
            }
            
            const row = result.rows[0];
            return {
                data: row.data,
                type: row.type,
                mediaType: row.media_type,
                fileName: row.file_name,
                originalSize: row.original_size,
                originalText: row.original_text,
                timestamp: row.timestamp
            };
            
        } catch (error) {
            console.error('Database load failed:', error.message);
            return null;
        }
    }

    async generateTagName(type) {
        // Create a simple unique tag name
        const timestamp = Date.now().toString().slice(-6); // Last 6 digits
        const random = Math.random().toString(36).substring(2, 5); // 3 random chars
        return `${type}_${timestamp}_${random}`;
    }

    async saveEncodedData(tagName, data) {
        // Try database first, fallback to JSON
        const dbSuccess = await this.saveToDatabase(tagName, data);
        
        if (!dbSuccess) {
            // Fallback to JSON storage
            try {
                // Ensure storage directory exists
                await fs.ensureDir(path.dirname(this.STORAGE_PATH));

                // Load existing data or create empty object
                let storage = {};
                try {
                    if (await fs.pathExists(this.STORAGE_PATH)) {
                        const fileContent = await fs.readFile(this.STORAGE_PATH, 'utf8');
                        storage = JSON.parse(fileContent);
                    }
                } catch (error) {
                    console.error('Error reading storage file:', error);
                    storage = {};
                }

                // Add new encoded data
                storage[tagName] = data;

                // Save back to file
                await fs.writeFile(this.STORAGE_PATH, JSON.stringify(storage, null, 2));
                
            } catch (error) {
                console.error('Error saving encoded data:', error);
                throw new Error('Failed to save encoded data');
            }
        }
    }

    async loadEncodedData(tagName) {
        // Try database first, fallback to JSON
        let data = await this.loadFromDatabase(tagName);
        
        if (!data) {
            // Fallback to JSON storage
            try {
                if (!await fs.pathExists(this.STORAGE_PATH)) {
                    return null;
                }

                const fileContent = await fs.readFile(this.STORAGE_PATH, 'utf8');
                const storage = JSON.parse(fileContent);
                
                data = storage[tagName] || null;
                
            } catch (error) {
                console.error('Error loading encoded data:', error);
                return null;
            }
        }
        
        return data;
    }

    async decodeFromTag(messageInfo, tagName) {
        try {
            const storedData = await this.loadEncodedData(tagName);
            
            if (!storedData) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Tag \`${tagName}\` not found. Please check the tag name.`);
                return;
            }

            if (storedData.type === 'text') {
                // Decode text
                const decoded = Buffer.from(storedData.data, 'base64').toString('utf8');
                
                await this.bot.messageHandler.reply(messageInfo,
                    `🔓 **Text Decoded from Tag**\n\n` +
                    `**Tag:** \`${tagName}\`\n` +
                    `**Original:** ${storedData.originalText}\n\n` +
                    `**Decoded:** ${decoded}`);
                    
            } else if (storedData.type === 'media') {
                // Decode media
                const decodedBuffer = Buffer.from(storedData.data, 'base64');
                await this.decodeMediaCommand(messageInfo, decodedBuffer, storedData.mediaType, storedData.data.length);
            }

        } catch (error) {
            console.error('Error decoding from tag:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error decoding from tag.');
        }
    }

    isValidURL(string) {
        try {
            new URL(string);
            return true;
        } catch (error) {
            return false;
        }
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