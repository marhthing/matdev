
/**
 * MATDEV Facebook Downloader Plugin
 * Download Facebook videos, images, and reels
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

// Enhanced anti-detection measures
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
];

const REFERRERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://www.facebook.com/',
    'https://m.facebook.com/',
    'https://t.co/',
    'https://www.twitter.com/'
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const getRandomReferrer = () => REFERRERS[Math.floor(Math.random() * REFERRERS.length)];

const humanDelay = (min = 1000, max = 3000) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
};

class FacebookPlugin {
    constructor() {
        this.name = 'facebook';
        this.description = 'Facebook media downloader';
        this.version = '1.0.0';
        
        // Facebook URL regex patterns
        this.facebookRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/(?:watch\/?\?v=|[\w.-]+\/videos\/|reel\/|[\w.-]+\/posts\/|story\.php\?story_fbid=)?(\d+)(?:\/.*)?/i;
        this.fbWatchRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/watch\/?\?v=(\d+)/i;
        this.fbReelRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/reel\/(\d+)/i;
        this.fbVideoRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/[\w.-]+\/videos\/(\d+)/i;
        
        this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
        this.requestTracker = new Map(); // Track requests per user
        this.lastRequest = 0; // Global rate limiting
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Facebook plugin loaded');
        return this;
    }

    /**
     * Register Facebook commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('facebook', this.downloadFacebook.bind(this), {
            description: 'Download Facebook video/image',
            usage: `${config.PREFIX}facebook <url>`,
            category: 'download',
            plugin: 'facebook',
            source: 'facebook.js'
        });

        this.bot.messageHandler.registerCommand('fb', this.downloadFacebook.bind(this), {
            description: 'Download Facebook video/image (short)',
            usage: `${config.PREFIX}fb <url>`,
            category: 'download',
            plugin: 'facebook',
            source: 'facebook.js'
        });
    }

    /**
     * Download Facebook media
     */
    async downloadFacebook(messageInfo) {
        try {
            // Rate limiting - prevent spam requests
            const userId = messageInfo.sender_jid;
            const now = Date.now();
            
            // Global rate limit - minimum 3 seconds between any requests
            const timeSinceLastRequest = now - this.lastRequest;
            if (timeSinceLastRequest < 3000) {
                await humanDelay(3000 - timeSinceLastRequest, 4000);
            }
            
            // Per-user rate limit - max 2 requests per minute
            if (!this.requestTracker.has(userId)) {
                this.requestTracker.set(userId, []);
            }
            
            const userRequests = this.requestTracker.get(userId);
            const recentRequests = userRequests.filter(time => now - time < 60000);
            
            if (recentRequests.length >= 2) {
                await this.bot.messageHandler.reply(messageInfo, '⏳ Please wait a moment before making another Facebook request. (Rate limit: 2 per minute)');
                return;
            }
            
            recentRequests.push(now);
            this.requestTracker.set(userId, recentRequests);
            this.lastRequest = now;

            let url = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message
            if (!url && messageInfo.quoted?.text) {
                url = messageInfo.quoted.text;
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a Facebook URL\n\nUsage: ${config.PREFIX}facebook <url>\n\nExample: ${config.PREFIX}facebook https://www.facebook.com/watch/?v=123456789`);
            }

            // Validate Facebook URL
            if (!this.isValidFacebookUrl(url)) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Facebook URL (videos, reels, or posts with media)');
            }

            console.log(`🎯 Processing Facebook URL: ${url}`);

            // Human-like delay before processing
            await humanDelay(1000, 2000);

            try {
                // Try multiple Facebook download methods
                let mediaData = null;
                
                // Method 1: Try FBDownloader API
                mediaData = await this.tryFBDownloaderAPI(url);
                
                // Method 2: Try SaveFrom API
                if (!mediaData) {
                    mediaData = await this.trySaveFromAPI(url);
                }
                
                // Method 3: Try SnapSave API
                if (!mediaData) {
                    mediaData = await this.trySnapSaveAPI(url);
                }

                if (!mediaData || !mediaData.media || mediaData.media.length === 0) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No media found in this Facebook post or media extraction failed. The post may be private, contain only text, or be unavailable.');
                }

                // Process and send each media item
                for (let i = 0; i < mediaData.media.length; i++) {
                    const media = mediaData.media[i];
                    
                    try {
                        await this.downloadAndSendMedia(messageInfo, media, mediaData.title, i + 1, mediaData.media.length);
                        
                        // Add delay between multiple files
                        if (i < mediaData.media.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 2000));
                        }
                    } catch (mediaError) {
                        console.error(`Error downloading media ${i + 1}:`, mediaError);
                        await this.bot.messageHandler.reply(messageInfo, 
                            `❌ Failed to download media ${i + 1}/${mediaData.media.length}: ${mediaError.message}`);
                    }
                }

            } catch (error) {
                console.error('Facebook download error:', error);
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to download Facebook media: ${error.message}`);
            }

        } catch (error) {
            console.error('Facebook command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the Facebook URL');
        }
    }

    /**
     * Try FBDownloader API
     */
    async tryFBDownloaderAPI(url) {
        try {
            await humanDelay(1000, 2000);
            
            const response = await axios.post('https://www.fbdownloader.com/api', {
                url: url
            }, {
                timeout: 20000,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Referer': 'https://www.fbdownloader.com/',
                    'Origin': 'https://www.fbdownloader.com'
                }
            });

            if (!response.data || response.data.error) {
                return null;
            }

            const data = response.data;
            const media = [];

            // Process videos
            if (data.video_url) {
                media.push({
                    type: 'video',
                    url: data.video_url,
                    quality: data.quality || 'HD'
                });
            }

            // Process HD video if available
            if (data.hd_video_url && data.hd_video_url !== data.video_url) {
                media.push({
                    type: 'video',
                    url: data.hd_video_url,
                    quality: 'HD'
                });
            }

            // Process images
            if (data.image_url) {
                media.push({
                    type: 'image',
                    url: data.image_url
                });
            }

            return {
                media: media,
                title: data.title || 'Facebook Media',
                author: data.author || 'Unknown'
            };

        } catch (error) {
            console.log('FBDownloader API failed:', error.message);
            return null;
        }
    }

    /**
     * Try SaveFrom API
     */
    async trySaveFromAPI(url) {
        try {
            await humanDelay(1500, 2500);
            
            const response = await axios.get(`https://savefrom.net/`, {
                params: {
                    url: url,
                    lang: 'en'
                },
                timeout: 20000,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Referer': 'https://savefrom.net/'
                }
            });

            // This would require HTML parsing to extract download links
            // For now, return null as this is a simplified implementation
            return null;

        } catch (error) {
            console.log('SaveFrom API failed:', error.message);
            return null;
        }
    }

    /**
     * Try SnapSave API
     */
    async trySnapSaveAPI(url) {
        try {
            await humanDelay(1200, 2200);
            
            const response = await axios.post('https://snapsave.app/action.php?lang=en', {
                url: url
            }, {
                timeout: 20000,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': '*/*',
                    'Referer': 'https://snapsave.app/',
                    'Origin': 'https://snapsave.app'
                }
            });

            // This would also require HTML parsing
            // Simplified implementation returns null
            return null;

        } catch (error) {
            console.log('SnapSave API failed:', error.message);
            return null;
        }
    }

    /**
     * Download and send media
     */
    async downloadAndSendMedia(messageInfo, media, title, index, total) {
        const tempFile = path.join(__dirname, '..', 'tmp', `facebook_${media.type}_${Date.now()}_${index}.${media.type === 'video' ? 'mp4' : 'jpg'}`);
        
        try {
            // Ensure tmp directory exists
            await fs.ensureDir(path.dirname(tempFile));

            // Download media
            const response = await axios.get(media.url, {
                responseType: 'stream',
                timeout: 60000,
                headers: {
                    'User-Agent': getRandomUserAgent(),
                    'Referer': 'https://www.facebook.com/',
                    'Accept': '*/*'
                },
                maxContentLength: this.maxFileSize
            });

            // Check content length
            const contentLength = parseInt(response.headers['content-length'] || '0');
            if (contentLength > this.maxFileSize) {
                throw new Error(`File too large: ${this.formatFileSize(contentLength)}`);
            }

            // Write to temp file
            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFile);
                response.data.pipe(writeStream);
                
                response.data.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
            });

            // Read file as buffer
            const mediaBuffer = await fs.readFile(tempFile);

            // Prepare caption
            const caption = total > 1 ? `📘 Facebook Media ${index}/${total}` : '📘 Facebook Media';

            // Send appropriate media type
            if (media.type === 'video') {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: mediaBuffer,
                    mimetype: 'video/mp4',
                    caption: caption
                });
            } else {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: mediaBuffer,
                    caption: caption
                });
            }

            // Clean up temp file
            await fs.unlink(tempFile).catch(() => {});

        } catch (error) {
            // Clean up temp file on error
            await fs.unlink(tempFile).catch(() => {});
            throw error;
        }
    }

    /**
     * Validate Facebook URL
     */
    isValidFacebookUrl(url) {
        const facebookPatterns = [
            /facebook\.com\/watch\/?\?v=\d+/,
            /facebook\.com\/reel\/\d+/,
            /facebook\.com\/[\w.-]+\/videos\/\d+/,
            /facebook\.com\/[\w.-]+\/posts\/\d+/,
            /facebook\.com\/story\.php\?story_fbid=\d+/,
            /fb\.watch\/[\w-]+/
        ];
        
        return facebookPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Format file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = bytes / Math.pow(1024, unitIndex);
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new FacebookPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
