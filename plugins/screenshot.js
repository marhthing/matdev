
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
        
        // Free screenshot APIs
        this.apis = [
            {
                name: 'screenshot-api.net',
                url: 'https://shot.screenshotapi.net/screenshot',
                params: (url) => ({
                    url: url,
                    output: 'image',
                    file_type: 'png',
                    wait_for_event: 'load'
                })
            },
            {
                name: 'htmlcsstoimage.com',
                url: 'https://hcti.io/v1/image',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from('demo:demo').toString('base64')
                },
                data: (url) => ({
                    url: url,
                    viewport_width: 1280,
                    viewport_height: 720
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
            console.log('✅ Website Screenshot plugin loaded');
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

        // Alias
        this.bot.messageHandler.registerCommand('ss', this.screenshotCommand.bind(this), {
            description: 'Capture a website screenshot (alias)',
            usage: `${config.PREFIX}ss <website URL>`,
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
                    `❌ Please provide a website URL.\n\nUsage: ${config.PREFIX}screenshot <URL>\n\nExamples:\n• ${config.PREFIX}screenshot https://google.com\n• ${config.PREFIX}ss https://github.com\n• ${config.PREFIX}screenshot reddit.com`);
                return;
            }

            // Validate and format URL
            url = this.formatUrl(url);
            if (!this.isValidUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo,
                    '❌ Please provide a valid website URL.\n\nExample: https://google.com');
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                `📸 Capturing screenshot of: ${url}\n\n⏳ This may take a few seconds...`);

            try {
                const screenshotBuffer = await this.captureScreenshot(url);
                
                if (screenshotBuffer) {
                    // Send the screenshot
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: screenshotBuffer,
                        caption: `📸 *Website Screenshot*\n\n🌐 *URL:* ${url}\n📅 *Captured:* ${new Date().toLocaleString()}\n🖥️ *Resolution:* 1280x720\n\n_Screenshot by ${config.BOT_NAME}_`
                    });

                    // Delete processing message
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: processingMsg.key
                    });
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `❌ Failed to capture screenshot of ${url}.\n\nPossible reasons:\n• Website is down or inaccessible\n• Website blocks screenshot services\n• Invalid URL format\n\nPlease try again with a different URL.`,
                        edit: processingMsg.key
                    });
                }

            } catch (apiError) {
                console.error('Screenshot API error:', apiError);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Error capturing screenshot: ${apiError.message}`,
                    edit: processingMsg.key
                });
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
                console.log(`📸 Trying ${api.name} for screenshot of ${url}`);
                
                let response;
                
                if (api.name === 'screenshot-api.net') {
                    response = await axios.get(api.url, {
                        params: api.params(url),
                        responseType: 'arraybuffer',
                        timeout: 30000,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });
                } else if (api.name === 'htmlcsstoimage.com') {
                    response = await axios.post(api.url, api.data(url), {
                        headers: api.headers,
                        timeout: 30000
                    });
                    
                    if (response.data && response.data.url) {
                        // Download the image from the provided URL
                        const imageResponse = await axios.get(response.data.url, {
                            responseType: 'arraybuffer',
                            timeout: 15000
                        });
                        response.data = imageResponse.data;
                    }
                }
                
                if (response && response.data) {
                    console.log(`✅ Screenshot captured successfully using ${api.name}`);
                    return Buffer.from(response.data);
                }
                
            } catch (error) {
                console.error(`❌ ${api.name} failed:`, error.message);
                continue;
            }
        }
        
        // Try a simple fallback using a different service
        try {
            console.log('📸 Trying fallback screenshot service...');
            const fallbackUrl = `https://api.screenshotmachine.com/?key=demo&url=${encodeURIComponent(url)}&dimension=1280x720`;
            
            const response = await axios.get(fallbackUrl, {
                responseType: 'arraybuffer',
                timeout: 25000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            
            if (response && response.data) {
                console.log('✅ Screenshot captured using fallback service');
                return Buffer.from(response.data);
            }
            
        } catch (error) {
            console.error('❌ Fallback screenshot service failed:', error.message);
        }
        
        return null;
    }

    /**
     * Format URL to ensure it's properly formatted
     */
    formatUrl(url) {
        url = url.trim();
        
        // Remove common prefixes that users might accidentally include
        url = url.replace(/^(screenshot|ss)\s+/i, '');
        
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
        console.log('🧹 Website Screenshot plugin cleanup completed');
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
