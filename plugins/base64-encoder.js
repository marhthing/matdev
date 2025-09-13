const config = require('../config');

class Base64EncoderPlugin {
    constructor() {
        this.name = 'base64-encoder';
        this.description = 'Encode and decode text using Base64';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('encode', this.encodeCommand.bind(this), {
                description: 'Encode text to Base64',
                usage: `${config.PREFIX}encode <text>`,
                category: 'utility',
                plugin: 'base64-encoder',
                source: 'base64-encoder.js'
            });

            this.bot.messageHandler.registerCommand('decode', this.decodeCommand.bind(this), {
                description: 'Decode Base64 to text',
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
            const text = messageInfo.args.join(' ').trim();
            if (!text) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔐 Usage: .encode <text>\n\n' +
                    'Example:\n• .encode Hello World!\n• .encode My secret message');
                return;
            }

            if (text.length > 1000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Text too long! Maximum 1000 characters.');
                return;
            }

            try {
                const encoded = Buffer.from(text, 'utf8').toString('base64');
                
                await this.bot.messageHandler.reply(messageInfo,
                    `🔐 **Base64 Encoded**\n\n` +
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
            const base64 = messageInfo.args.join(' ').trim();
            if (!base64) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔓 Usage: .decode <base64>\n\n' +
                    'Example:\n• .decode SGVsbG8gV29ybGQh\n• .decode TWVzc2FnZSB0byBkZWNvZGU=');
                return;
            }

            if (base64.length > 2000) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Base64 string too long! Maximum 2000 characters.');
                return;
            }

            // Validate base64 format
            if (!this.isValidBase64(base64)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid Base64 format. Please check your input.');
                return;
            }

            try {
                const decoded = Buffer.from(base64, 'base64').toString('utf8');
                
                // Check if decoded text contains only printable characters
                if (!this.isPrintableText(decoded)) {
                    await this.bot.messageHandler.reply(messageInfo,
                        `🔓 **Base64 Decoded**\n\n` +
                        `**Decoded:** *(Binary/non-printable data)*\n\n` +
                        `📊 Length: ${base64.length} → ${decoded.length} bytes\n\n` +
                        `⚠️ The decoded content appears to be binary data.`);
                    return;
                }

                await this.bot.messageHandler.reply(messageInfo,
                    `🔓 **Base64 Decoded**\n\n` +
                    `**Original Base64:** ${base64.length > 50 ? base64.substring(0, 50) + '...' : base64}\n\n` +
                    `**Decoded:**\n${decoded}\n\n` +
                    `📊 Length: ${base64.length} → ${decoded.length} chars`);

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