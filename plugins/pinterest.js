/**
 * MATDEV Pinterest Downloader Plugin
 * Download Pinterest images and videos using latest 2025 methods
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class PinterestPlugin {
    constructor() {
        this.name = 'pinterest';
        this.description = 'Pinterest media downloader using latest scraping methods (2025)';
        this.version = '1.0.0';
        
        // Pinterest URL patterns
        this.pinterestRegex = /^https?:\/\/(?:(?:www\.)?pinterest\.com\/pin\/|pin\.it\/)([0-9]+)\/?.*$/;
        
        // File size limits (Pinterest images are usually smaller)
        this.imageSizeLimit = 20 * 1024 * 1024; // 20MB
        this.videoSizeLimit = 50 * 1024 * 1024; // 50MB
        
        // User agent for requests
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    /**
     * Initialize the plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Pinterest plugin loaded');
        return this;
    }

    /**
     * Register plugin commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('pinterest', this.downloadPinterest.bind(this), {
            description: 'Download media from Pinterest pins',
            usage: `${config.PREFIX}pinterest <pinterest_url>`,
            category: 'downloader',
            plugin: 'pinterest',
            source: 'pinterest.js'
        });

        this.bot.messageHandler.registerCommand('pin', this.downloadPinterest.bind(this), {
            description: 'Download media from Pinterest pins (short alias)',
            usage: `${config.PREFIX}pin <pinterest_url>`,
            category: 'downloader',
            plugin: 'pinterest',
            source: 'pinterest.js'
        });
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(prefix = 'pinterest', extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = extension.startsWith('.') ? extension : (extension ? `.${extension}` : '');
        return `${prefix}_${timestamp}_${random}${ext}`;
    }

    /**
     * Extract Pinterest pin ID from URL
     */
    extractPinId(url) {
        const match = url.match(this.pinterestRegex);
        if (!match) return null;
        return match[1];
    }

    /**
     * Get Pinterest pin data using direct scraping
     */
    async getPinData(pinId) {
        try {
            // Use multiple methods to get Pinterest data
            const methods = [
                () => this.methodOne(pinId),
                () => this.methodTwo(pinId),
                () => this.methodThree(pinId)
            ];
            
            for (const method of methods) {
                try {
                    const result = await method();
                    if (result.success) {
                        return result;
                    }
                } catch (error) {
                    console.log(`Pinterest method failed: ${error.message}`);
                    continue;
                }
            }
            
            throw new Error('All Pinterest extraction methods failed');
            
        } catch (error) {
            console.error('Pinterest extraction failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Method One: Direct Pinterest page scraping
     */
    async methodOne(pinId) {
        try {
            const pageUrl = `https://www.pinterest.com/pin/${pinId}/`;
            const response = await axios.get(pageUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                timeout: 15000
            });

            const html = response.data;
            
            // Extract JSON data from script tags
            const jsonMatch = html.match(/"images":\s*{[^}]*"orig":\s*{[^}]*"url":\s*"([^"]+)"/);
            const videoMatch = html.match(/"videos":\s*{[^}]*"video_list":\s*{[^}]*"url":\s*"([^"]+)"/);
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const descMatch = html.match(/property="og:description" content="([^"]+)"/);
            
            let mediaUrl = null;
            let mediaType = 'image';
            
            if (videoMatch && videoMatch[1]) {
                mediaUrl = videoMatch[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
                mediaType = 'video';
            } else if (jsonMatch && jsonMatch[1]) {
                mediaUrl = jsonMatch[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
                mediaType = 'image';
            }
            
            if (mediaUrl) {
                return {
                    success: true,
                    data: {
                        url: mediaUrl,
                        description: descMatch ? descMatch[1] : (titleMatch ? titleMatch[1] : 'Pinterest media'),
                        type: mediaType,
                        title: titleMatch ? titleMatch[1] : 'Pinterest Pin'
                    }
                };
            }
            
            throw new Error('No media found in page HTML');
            
        } catch (error) {
            throw new Error(`Method One failed: ${error.message}`);
        }
    }

    /**
     * Method Two: Pinterest embed API
     */
    async methodTwo(pinId) {
        try {
            const embedUrl = `https://www.pinterest.com/pin/${pinId}/`;
            const response = await axios.get(embedUrl, {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': '*/*'
                },
                timeout: 10000
            });

            const html = response.data;
            
            // Look for Open Graph image
            const ogImageMatch = html.match(/property="og:image" content="([^"]+)"/);
            const ogTitleMatch = html.match(/property="og:title" content="([^"]+)"/);
            const ogDescMatch = html.match(/property="og:description" content="([^"]+)"/);
            
            if (ogImageMatch && ogImageMatch[1]) {
                return {
                    success: true,
                    data: {
                        url: ogImageMatch[1],
                        description: ogDescMatch ? ogDescMatch[1] : 'Pinterest media',
                        type: 'image',
                        title: ogTitleMatch ? ogTitleMatch[1] : 'Pinterest Pin'
                    }
                };
            }
            
            throw new Error('No Open Graph image found');
            
        } catch (error) {
            throw new Error(`Method Two failed: ${error.message}`);
        }
    }

    /**
     * Method Three: Pinterest API endpoint
     */
    async methodThree(pinId) {
        try {
            const apiUrl = `https://www.pinterest.com/resource/PinResource/get/?options=%7B%22field_set_key%22%3A%22detailed%22%2C%22id%22%3A%22${pinId}%22%7D&_=${Date.now()}`;
            
            const response = await axios.get(apiUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json, text/javascript, */*; q=0.01',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': `https://www.pinterest.com/pin/${pinId}/`,
                    'Origin': 'https://www.pinterest.com',
                    'Cookie': 'csrftoken=dummy'
                },
                timeout: 10000
            });

            if (response.data && response.data.resource_response && response.data.resource_response.data) {
                const pinData = response.data.resource_response.data;
                
                let mediaUrl = null;
                let mediaType = 'image';
                
                // Check for video first
                if (pinData.videos && pinData.videos.video_list) {
                    const videoList = pinData.videos.video_list;
                    const videoQuality = videoList.V_720P || videoList.V_540P || videoList.V_360P;
                    if (videoQuality && videoQuality.url) {
                        mediaUrl = videoQuality.url;
                        mediaType = 'video';
                    }
                }
                
                // Fallback to image
                if (!mediaUrl && pinData.images && pinData.images.orig) {
                    mediaUrl = pinData.images.orig.url;
                    mediaType = 'image';
                }
                
                if (mediaUrl) {
                    return {
                        success: true,
                        data: {
                            url: mediaUrl,
                            description: pinData.description || pinData.rich_summary?.display_name || 'Pinterest media',
                            type: mediaType,
                            title: pinData.title || 'Pinterest Pin'
                        }
                    };
                }
            }
            
            throw new Error('No media URL found in API response');
            
        } catch (error) {
            throw new Error(`Method Three failed: ${error.message}`);
        }
    }

    /**
     * Detect media type from URL
     */
    detectMediaType(url) {
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi'];
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        
        const urlLower = url.toLowerCase();
        
        if (videoExtensions.some(ext => urlLower.includes(ext))) {
            return 'video';
        } else if (imageExtensions.some(ext => urlLower.includes(ext))) {
            return 'image';
        }
        
        // Default to image for Pinterest
        return 'image';
    }

    /**
     * Download media from URL
     */
    async downloadMedia(mediaUrl, filename, sizeLimit) {
        const tempDir = path.join(__dirname, '..', 'tmp');
        await fs.ensureDir(tempDir);
        
        const filePath = path.join(tempDir, filename);
        
        try {
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                responseType: 'stream',
                headers: {
                    'User-Agent': this.userAgent,
                    'Referer': 'https://www.pinterest.com/'
                },
                timeout: 30000
            });

            // Check content length
            const contentLength = parseInt(response.headers['content-length'] || '0');
            if (contentLength > sizeLimit) {
                throw new Error(`File too large: ${Math.round(contentLength / 1024 / 1024)}MB (limit: ${Math.round(sizeLimit / 1024 / 1024)}MB)`);
            }

            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(filePath));
                writer.on('error', reject);
            });

        } catch (error) {
            // Clean up partial file
            try {
                await fs.remove(filePath);
            } catch (cleanupError) {
                // Ignore cleanup errors
            }
            throw error;
        }
    }

    /**
     * Main Pinterest download command handler
     */
    async downloadPinterest(messageInfo) {
        const { args, chat_jid } = messageInfo;

        if (!args || args.length === 0) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ *Please provide a Pinterest URL*\n\n` +
                `📌 *Usage:* ${config.PREFIX}pinterest <pinterest_url>\n` +
                `📌 *Example:* ${config.PREFIX}pinterest https://pinterest.com/pin/123456789/\n\n` +
                `✅ *Supported:* Images, Videos, GIFs\n` +
                `📱 *Works with:* pinterest.com/pin/ and pin.it/ links`
            );
            return;
        }

        const url = args.join(' ').trim();

        // Validate Pinterest URL
        if (!this.pinterestRegex.test(url)) {
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ *Invalid Pinterest URL*\n\n' +
                '📌 Please provide a valid Pinterest pin URL:\n' +
                '• https://pinterest.com/pin/123456789/\n' +
                '• https://pin.it/abcdef\n'
            );
            return;
        }

        const pinId = this.extractPinId(url);
        if (!pinId) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Could not extract pin ID from URL');
            return;
        }

        // Send processing message
        const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
            '⏳ *Processing Pinterest pin...*\n' +
            '📌 Extracting media information...'
        );

        try {
            // Get pin data
            const result = await this.getPinData(pinId);
            
            if (!result.success) {
                await this.bot.sock.sendMessage(chat_jid, {
                    text: '❌ *Pinterest Download Failed*\n\n' +
                          `🚫 ${result.error}`,
                    edit: processingMsg.key
                });
                return;
            }

            const { data } = result;
            const isVideo = data.type === 'video';
            const sizeLimit = isVideo ? this.videoSizeLimit : this.imageSizeLimit;
            
            // Update processing message
            await this.bot.sock.sendMessage(chat_jid, {
                text: `⏳ *Downloading Pinterest ${isVideo ? 'video' : 'image'}...*\n` +
                      `📌 ${data.description.substring(0, 50)}${data.description.length > 50 ? '...' : ''}`,
                edit: processingMsg.key
            });

            // Generate filename with appropriate extension
            const extension = isVideo ? '.mp4' : '.jpg';
            const filename = this.generateUniqueFilename('pinterest', extension);

            // Download the media
            const filePath = await this.downloadMedia(data.url, filename, sizeLimit);
            
            // Get file stats
            const stats = await fs.stat(filePath);
            const fileSize = (stats.size / 1024 / 1024).toFixed(2);

            // Prepare caption
            const caption = `✅ *Pinterest Downloaded*\n\n` +
                `📌 *Description:* ${data.description}\n` +
                `📊 *Size:* ${fileSize} MB\n` +
                `🎯 *Type:* ${isVideo ? 'Video' : 'Image'}\n` +
                `⚡ *Plugin:* Pinterest v${this.version}`;

            // Send the media file
            if (isVideo) {
                await this.bot.sock.sendMessage(chat_jid, {
                    video: { url: filePath },
                    caption: caption
                });
            } else {
                await this.bot.sock.sendMessage(chat_jid, {
                    image: { url: filePath },
                    caption: caption
                });
            }

            // Clean up temp file
            setTimeout(async () => {
                try {
                    await fs.remove(filePath);
                } catch (error) {
                    console.error('Failed to cleanup Pinterest file:', error.message);
                }
            }, 5000);

            // Delete processing message
            try {
                await this.bot.sock.sendMessage(chat_jid, { delete: processingMsg.key });
            } catch (error) {
                // Ignore deletion errors
            }

        } catch (error) {
            console.error('Pinterest download error:', error);
            
            await this.bot.sock.sendMessage(chat_jid, {
                text: '❌ *Pinterest Download Failed*\n\n' +
                      `🚫 ${error.message}\n\n` +
                      '💡 *Possible reasons:*\n' +
                      '• Pin is private or deleted\n' +
                      '• Network connectivity issues\n' +
                      '• File too large for WhatsApp\n' +
                      '• Pinterest anti-bot protection\n\n' +
                      '🔄 Try again in a few moments',
                edit: processingMsg.key
            });
        }
    }

    /**
     * Plugin cleanup
     */
    async cleanup() {
        console.log('🧹 Pinterest plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new PinterestPlugin();
        await plugin.init(bot);
        return plugin;
    }
};