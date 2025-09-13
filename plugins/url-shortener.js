const axios = require('axios');
const config = require('../config');

class URLShortenerPlugin {
    constructor() {
        this.name = 'url-shortener';
        this.description = 'Shorten long URLs using free shortening services';
        this.version = '1.0.0';
        this.enabled = true;
    }

    async init(bot) {
        this.bot = bot;
        try {
            this.bot.messageHandler.registerCommand('shorten', this.shortenCommand.bind(this), {
                description: 'Shorten a long URL',
                usage: `${config.PREFIX}shorten <url>`,
                category: 'utility',
                plugin: 'url-shortener',
                source: 'url-shortener.js'
            });

            this.bot.messageHandler.registerCommand('expand', this.expandCommand.bind(this), {
                description: 'Expand a shortened URL',
                usage: `${config.PREFIX}expand <short_url>`,
                category: 'utility',
                plugin: 'url-shortener',
                source: 'url-shortener.js'
            });

            console.log('✅ URL Shortener plugin loaded');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize URL Shortener plugin:', error);
            return false;
        }
    }

    async shortenCommand(messageInfo) {
        try {
            const url = messageInfo.args.join(' ').trim();
            if (!url) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔗 Usage: .shorten <url>\n\n' +
                    'Example:\n• .shorten https://www.example.com/very/long/url/path');
                return;
            }

            // Validate URL format
            if (!this.isValidURL(url)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide a valid URL (must start with http:// or https://)');
                return;
            }

            const shortUrl = await this.shortenWithTinyURL(url);
            if (shortUrl) {
                await this.bot.messageHandler.reply(messageInfo,
                    `🔗 **URL Shortened**\n\n` +
                    `**Original:** ${url.length > 50 ? url.substring(0, 50) + '...' : url}\n` +
                    `**Shortened:** ${shortUrl}\n\n` +
                    `💾 ${((url.length - shortUrl.length) / url.length * 100).toFixed(1)}% size reduction`);
            } else {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to shorten URL. Please try again later.');
            }

        } catch (error) {
            console.error('Error in shorten command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error shortening URL.');
        }
    }

    async expandCommand(messageInfo) {
        try {
            const shortUrl = messageInfo.args.join(' ').trim();
            if (!shortUrl) {
                await this.bot.messageHandler.reply(messageInfo,
                    '🔍 Usage: .expand <short_url>\n\n' +
                    'Example:\n• .expand https://tinyurl.com/abc123');
                return;
            }

            if (!this.isValidURL(shortUrl)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please provide a valid shortened URL');
                return;
            }

            const expandedUrl = await this.expandURL(shortUrl);
            if (expandedUrl) {
                await this.bot.messageHandler.reply(messageInfo,
                    `🔍 **URL Expanded**\n\n` +
                    `**Short URL:** ${shortUrl}\n` +
                    `**Full URL:** ${expandedUrl.length > 100 ? expandedUrl.substring(0, 100) + '...' : expandedUrl}`);
            } else {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to expand URL or URL is already full length.');
            }

        } catch (error) {
            console.error('Error in expand command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error expanding URL.');
        }
    }

    async shortenWithTinyURL(url) {
        try {
            const response = await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
                timeout: 10000
            });
            
            if (response.data && response.data.startsWith('https://tinyurl.com/')) {
                return response.data.trim();
            }
            return null;
        } catch (error) {
            console.error('TinyURL error:', error.message);
            return null;
        }
    }

    async expandURL(shortUrl) {
        try {
            const response = await axios.head(shortUrl, {
                maxRedirects: 0,
                timeout: 10000,
                validateStatus: (status) => status >= 200 && status < 400
            });
            
            return response.headers.location || shortUrl;
        } catch (error) {
            if (error.response && error.response.headers && error.response.headers.location) {
                return error.response.headers.location;
            }
            console.error('URL expansion error:', error.message);
            return null;
        }
    }

    isValidURL(string) {
        try {
            new URL(string);
            return string.startsWith('http://') || string.startsWith('https://');
        } catch (_) {
            return false;
        }
    }

    async cleanup() {
        console.log('🧹 URL Shortener plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new URLShortenerPlugin();
        await plugin.init(bot);
        return plugin;
    }
};