/**
 * MATDEV Website Screenshot Plugin
 * Capture screenshots of websites using free APIs
 */

const axios = require('axios');
const config = require('../config');

class ScreenshotPlugin {
    constructor() {
        this.name = 'screenshot';
        this.description = 'Capture website screenshots';
        this.version = '1.0.0';
        this.enabled = true;

        // Updated working screenshot APIs
        this.apis = [
            {
                name: 'screenshotmachine',
                url: 'https://api.screenshotmachine.com/',
                params: (url) => ({
                    key: 'demo',
                    url: url,
                    dimension: '1280x720',
                    format: 'png'
                })
            },
            {
                name: 'urlbox',
                url: 'https://api.urlbox.io/v1/demo/png',
                params: (url) => ({
                    url: url,
                    width: 1280,
                    height: 720
                })
            }
        ];
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        try {
            this.registerCommands();
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Screenshot plugin:', error);
            return false;
        }
    }

    /**
     * Register commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('screenshot', this.screenshotCommand.bind(this), {
            description: 'Capture a website screenshot',
            usage: `${config.PREFIX}screenshot <website URL>`,
            category: 'utility',
            plugin: 'screenshot',
            source: 'screenshot.js'
        });
    }

    /**
     * Handle screenshot command
     */
    async screenshotCommand(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();

            // Check if it's a reply to a message with URL
            if (!url && messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
                const quotedText = this.extractTextFromQuoted(messageInfo.message.extendedTextMessage.contextInfo.quotedMessage);
                if (quotedText) {
                    url = quotedText;
                }
            }

            if (!url) {
                await this.bot.messageHandler.reply(messageInfo,
                    `❌ Please provide a website URL.\n\nUsage: ${config.PREFIX}screenshot <URL>\n\nExamples:\n• ${config.PREFIX}screenshot https://google.com\n• ${config.PREFIX}screenshot reddit.com`);
                return;
            }

            // Validate and format URL
            url = this.formatUrl(url);
            if (!this.isValidUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Please provide a valid website URL.\n\nExample: https://google.com');
                return;
            }

            try {
                const screenshotBuffer = await this.captureScreenshot(url);

                if (screenshotBuffer) {
                    // Send the screenshot without caption
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: screenshotBuffer
                    });
                } else {
                    await this.bot.messageHandler.reply(messageInfo, `❌ Failed to capture screenshot of ${url}.`);
                }

            } catch (apiError) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Error capturing screenshot: ${apiError.message}`);
            }

        } catch (error) {
            console.error('Error in screenshot command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ Error processing your request.');
        }
    }

    /**
     * Capture screenshot using multiple APIs as fallback
     */
    async captureScreenshot(url) {
        for (const api of this.apis) {
            try {
                let response;

                if (api.name === 'screenshotmachine') {
                    response = await axios.get(api.url, {
                        params: api.params(url),
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } else if (api.name === 'urlbox') {
                    response = await axios.get(api.url, {
                        params: api.params(url),
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                }

                if (response && response.data) {
                    return Buffer.from(response.data);
                }

            } catch (error) {
                continue;
            }
        }

        // Try additional fallback services
        const fallbackServices = [
            `https://mini.s-shot.ru/1280x720/PNG/1280/Z100/?${encodeURIComponent(url)}`,
            `https://image.thum.io/get/width/1280/crop/720/${encodeURIComponent(url)}`
        ];

        for (const fallbackUrl of fallbackServices) {
            try {
                const response = await axios.get(fallbackUrl, {
                    responseType: 'arraybuffer',
                    timeout: 25000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (response && response.data) {
                    return Buffer.from(response.data);
                }

            } catch (error) {
                continue;
            }
        }

        return null;
    }

    /**
     * Format URL to ensure it's properly formatted
     */
    formatUrl(url) {
        url = url.trim();

        // Remove common prefixes that users might accidentally include
        url = url.replace(/^(screenshot)\s+/i, '');

        // Add protocol if missing
        if (!url.match(/^https?:\/\//)) {
            url = 'https://' + url;
        }

        return url;
    }

    /**
     * Validate URL format
     */
    isValidUrl(url) {
        try {
            const urlObj = new URL(url);
            return ['http:', 'https:'].includes(urlObj.protocol);
        } catch (error) {
            return false;
        }
    }

    /**
     * Extract text from quoted message
     */
    extractTextFromQuoted(quotedMessage) {
        if (!quotedMessage) return null;

        const messageTypes = Object.keys(quotedMessage);
        for (const type of messageTypes) {
            const content = quotedMessage[type];
            if (typeof content === 'string') {
                return content;
            } else if (content?.text) {
                return content.text;
            } else if (content?.caption) {
                return content.caption;
            }
        }

        return null;
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        // No console log for cleanup as per silent requirement
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new ScreenshotPlugin();
        await plugin.init(bot);
        return plugin;
    }
};