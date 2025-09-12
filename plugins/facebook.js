
/**
 * MATDEV Facebook Downloader Plugin v2.0.0
 * Modern 2025 Facebook scraper with page source extraction
 * Bypasses robot detection using mobile URL conversion and session management
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

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
        this.description = 'Advanced Facebook scraper with 2025 page source extraction methods';
        this.version = '2.0.0';
        
        // Facebook URL regex patterns (comprehensive)
        this.facebookRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/(?:watch\/?\?v=|[\w.-]+\/videos\/|reel\/|[\w.-]+\/posts\/|story\.php\?story_fbid=)?(\d+)(?:\/.*)?/i;
        this.fbWatchRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/watch\/?\?v=(\d+)/i;
        this.fbReelRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/reel\/(\d+)/i;
        this.fbVideoRegex = /(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/[\w.-]+\/videos\/(\d+)/i;
        
        this.maxFileSize = 100 * 1024 * 1024; // 100MB limit
        this.requestTracker = new Map(); // Track requests per user
        this.lastRequest = 0; // Global rate limiting
        
        // Session management for 2025 anti-detection
        this.sessionData = {
            cookies: null,
            userAgent: null,
            deviceId: null
        };
        
        // Modern 2025 video URL patterns (updated from research)
        this.videoPatterns = [
            // Primary HD/SD patterns
            /"playable_url":"([^"]+)"/g,
            /"browser_native_hd_url":"([^"]+)"/g,
            /"browser_native_sd_url":"([^"]+)"/g,
            
            // Mobile-specific patterns (m.facebook.com)
            /"src":"([^"]*\.mp4[^"]*)"/g,
            /data-sigil="inlineVideo"[^>]*data-src="([^"]+)"/g,
            
            // Modern 2025 patterns
            /"playable_url_quality_hd":"([^"]+)"/g,
            /"video_url":"([^"]+)"/g,
            /"url":"([^"]*fbcdn[^"]*\.mp4[^"]*)"/g,
            
            // Encoded patterns
            /playable_url%22%3A%22([^%"]+)/g,
            /"videoData":\[{"uri":"([^"]+)"/g
        ];
    }

    /**
     * Initialize plugin with session management
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        await this.initializeSession();
        console.log('✅ Facebook plugin v2.0.0 loaded with 2025 page source extraction methods');
        return this;
    }

    /**
     * Initialize session for anti-detection (2025 method)
     */
    async initializeSession() {
        this.sessionData.deviceId = this.generateDeviceId();
        this.sessionData.userAgent = this.generateMobileBrowserUA();
        
        try {
            // Initialize session by visiting Facebook mobile homepage
            const response = await axios.get('https://m.facebook.com/', {
                headers: {
                    'User-Agent': this.sessionData.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            });

            // Store session cookies for subsequent requests
            if (response.headers['set-cookie']) {
                this.sessionData.cookies = response.headers['set-cookie']
                    .map(cookie => cookie.split(';')[0])
                    .join('; ');
            }

            console.log('🔐 Facebook session initialized for anti-detection');
        } catch (error) {
            console.log('⚠️ Facebook session initialization failed, using anonymous mode');
        }
    }

    /**
     * Generate device ID for session consistency
     */
    generateDeviceId() {
        const seed = crypto.randomBytes(8).toString('hex');
        return `fb-${seed}`;
    }

    /**
     * Generate mobile browser user agent for Facebook compatibility
     */
    generateMobileBrowserUA() {
        const browsers = [
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
            'Mozilla/5.0 (Android 13; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0',
            'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
        ];
        return browsers[Math.floor(Math.random() * browsers.length)];
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
                // Use modern 2025 Facebook extraction methods
                console.log(`🔄 Extracting Facebook media using 2025 page source extraction method`);
                
                const mediaData = await this.extractFacebookMedia(url);

                if (!mediaData || !mediaData.media || mediaData.media.length === 0) {
                    // Provide more helpful error message based on URL type
                    let errorMsg = '❌ Unable to extract media from this Facebook post.\n\n';
                    errorMsg += '**Possible reasons:**\n';
                    errorMsg += '• Post is private or restricted\n';
                    errorMsg += '• Post contains only text/images without video\n';
                    errorMsg += '• Facebook has blocked automated access\n';
                    errorMsg += '• Post has been deleted or is unavailable\n\n';
                    errorMsg += '**Tips:**\n';
                    errorMsg += '• Try using a direct video URL if available\n';
                    errorMsg += '• Ensure the post is public\n';
                    errorMsg += '• Share the post and try the new URL';
                    
                    return await this.bot.messageHandler.reply(messageInfo, errorMsg);
                }

                // Filter out invalid media and prioritize videos
                const validMedia = mediaData.media.filter(media => {
                    if (!media.url) return false;
                    
                    // Check if URL is actually valid
                    try {
                        new URL(media.url);
                        return media.url.includes('http') && 
                               media.url.length > 20 && 
                               !media.url.includes('placeholder') &&
                               !media.url.includes('blank');
                    } catch {
                        return false;
                    }
                });

                // Prioritize videos over images
                const videos = validMedia.filter(media => media.type === 'video');
                const images = validMedia.filter(media => media.type === 'image');
                
                // Get ONLY the first video if available, otherwise first image
                let finalMedia = [];
                if (videos.length > 0) {
                    finalMedia = [videos[0]]; // Only first video
                } else if (images.length > 0) {
                    finalMedia = [images[0]]; // Only first image
                }

                if (finalMedia.length === 0) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No valid media found in this Facebook post. The post may contain only text or the media URLs are invalid.');
                }

                console.log(`✅ Found 1 valid media item (${videos.length > 0 ? 'video' : 'image'})`);

                // Process and send ONLY the first media item
                try {
                    await this.downloadAndSendMedia(messageInfo, finalMedia[0], mediaData.title, 1, 1);
                } catch (mediaError) {
                    console.error(`Error downloading media:`, mediaError);
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Failed to download media: ${mediaError.message}`);
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
     * Modern Facebook media extraction (2025 page source method)
     */
    async extractFacebookMedia(url) {
        try {
            // Convert to mobile URL for better extraction (2025 technique)
            const mobileUrl = this.convertToMobileUrl(url);
            console.log(`🔄 Using mobile URL for extraction: ${mobileUrl}`);
            
            // Try mobile page source extraction first (most reliable)
            let result = await this.tryMobilePageSource(mobileUrl);
            if (result && result.media && result.media.length > 0) {
                console.log(`✅ Mobile page source success: Found ${result.media.length} media item(s)`);
                return result;
            }
            
            // Fallback to desktop page source
            result = await this.tryDesktopPageSource(url);
            if (result && result.media && result.media.length > 0) {
                console.log(`✅ Desktop page source success: Found ${result.media.length} media item(s)`);
                return result;
            }
            
            return null;
        } catch (error) {
            console.error('Facebook media extraction failed:', error.message);
            return null;
        }
    }

    /**
     * Convert Facebook URL to mobile version (2025 technique)
     */
    convertToMobileUrl(url) {
        try {
            // Ensure URL has protocol
            if (!url.startsWith('http')) {
                url = 'https://' + url;
            }
            
            const urlObj = new URL(url);
            
            // Convert to mobile Facebook domain
            if (urlObj.hostname.includes('facebook.com')) {
                urlObj.hostname = 'm.facebook.com';
            }
            
            return urlObj.toString();
        } catch (error) {
            console.log('URL conversion error:', error.message);
            // Fallback to original URL if parsing fails
            return url;
        }
    }

    /**
     * Extract from mobile Facebook page source (primary 2025 method)
     */
    async tryMobilePageSource(url) {
        try {
            await humanDelay(1000, 2000);
            
            const headers = {
                'User-Agent': this.sessionData.userAgent,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://m.facebook.com/',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };

            // Add session cookies if available
            if (this.sessionData.cookies) {
                headers['Cookie'] = this.sessionData.cookies;
            }

            const response = await axios.get(url, {
                headers,
                timeout: 20000
            });

            const html = response.data;
            const media = [];
            const foundUrls = new Set();

            // Extract using modern 2025 patterns
            for (const pattern of this.videoPatterns) {
                const matches = [...html.matchAll(pattern)];
                for (const match of matches) {
                    if (match[1]) {
                        try {
                            let videoUrl = this.decodeVideoUrl(match[1]);
                            
                            if (this.isValidVideoUrl(videoUrl) && !foundUrls.has(videoUrl)) {
                                foundUrls.add(videoUrl);
                                media.push({
                                    type: 'video',
                                    url: videoUrl
                                });
                                
                                // Only get the first valid video for efficiency
                                if (media.length >= 1) break;
                            }
                        } catch (decodeError) {
                            console.log('URL decode error:', decodeError.message);
                        }
                    }
                }
                if (media.length >= 1) break;
            }

            if (media.length > 0) {
                return {
                    media: media,
                    title: this.extractTitleFromHtml(html) || 'Facebook Video',
                    author: 'Unknown'
                };
            }

            return null;
        } catch (error) {
            console.log('Mobile page source extraction failed:', error.message);
            return null;
        }
    }

    /**
     * Extract from desktop Facebook page source (fallback)
     */
    async tryDesktopPageSource(url) {
        try {
            await humanDelay(1000, 2000);
            
            const headers = {
                'User-Agent': getRandomUserAgent(),
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': 'https://www.facebook.com/',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };

            const response = await axios.get(url, {
                headers,
                timeout: 20000
            });

            const html = response.data;
            const media = [];
            const foundUrls = new Set();

            // Extract using desktop video patterns
            for (const pattern of this.videoPatterns) {
                const matches = [...html.matchAll(pattern)];
                for (const match of matches) {
                    if (match[1]) {
                        try {
                            let videoUrl = this.decodeVideoUrl(match[1]);
                            
                            if (this.isValidVideoUrl(videoUrl) && !foundUrls.has(videoUrl)) {
                                foundUrls.add(videoUrl);
                                media.push({
                                    type: 'video',
                                    url: videoUrl
                                });
                                
                                // Only get the first valid video for efficiency
                                if (media.length >= 1) break;
                            }
                        } catch (decodeError) {
                            console.log('URL decode error:', decodeError.message);
                        }
                    }
                }
                if (media.length >= 1) break;
            }

            if (media.length > 0) {
                return {
                    media: media,
                    title: this.extractTitleFromHtml(html) || 'Facebook Video',
                    author: 'Unknown'
                };
            }

            return null;
        } catch (error) {
            console.log('Desktop page source extraction failed:', error.message);
            return null;
        }
    }

    /**
     * Decode video URL from Facebook's encoded format
     */
    decodeVideoUrl(encodedUrl) {
        try {
            // Handle Facebook's URL encoding
            let decodedUrl = encodedUrl;
            
            // Replace Unicode escapes
            decodedUrl = decodedUrl
                .replace(/\\u0025/g, '%')
                .replace(/\\u0026/g, '&')
                .replace(/\\u003D/g, '=')
                .replace(/\\u002F/g, '/')
                .replace(/\\\//g, '/');
            
            // URL decode
            decodedUrl = decodeURIComponent(decodedUrl);
            
            return decodedUrl;
        } catch (error) {
            console.log('URL decode error:', error.message);
            return encodedUrl; // Return original if decode fails
        }
    }

    /**
     * Validate if URL is a valid video URL
     */
    isValidVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        
        try {
            // Basic URL validation
            new URL(url);
            
            // Check URL characteristics
            return url.includes('http') && 
                   url.length > 50 && 
                   !url.includes('placeholder') &&
                   !url.includes('blank') &&
                   (url.includes('.mp4') || 
                    url.includes('video') || 
                    url.includes('fbcdn') ||
                    url.includes('facebook.com'));
        } catch {
            return false;
        }
    }

    /**
     * Extract title from Facebook HTML
     */
    extractTitleFromHtml(html) {
        try {
            // Try multiple title extraction patterns
            const titlePatterns = [
                /<title[^>]*>([^<]+)<\/title>/i,
                /"title":"([^"]+)"/i,
                /"og:title"\s+content="([^"]+)"/i,
                /<meta\s+property="og:title"\s+content="([^"]+)"/i,
                /"twitter:title"\s+content="([^"]+)"/i
            ];

            for (const pattern of titlePatterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    let title = match[1].trim();
                    
                    // Clean up the title
                    title = title.replace(/&quot;/g, '"')
                                 .replace(/&amp;/g, '&')
                                 .replace(/&lt;/g, '<')
                                 .replace(/&gt;/g, '>')
                                 .replace(/&#39;/g, "'")
                                 .replace(/\s+/g, ' ')
                                 .trim();
                    
                    // Skip generic Facebook titles
                    if (title && 
                        !title.includes('Facebook') && 
                        !title.includes('Log in') &&
                        title.length > 5) {
                        return title;
                    }
                }
            }

            return null;
        } catch (error) {
            console.log('Title extraction error:', error.message);
            return null;
        }
    }

    /**
     * Generate unique filename for temporary media files
     */
    generateUniqueFilename(mediaType) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = mediaType === 'video' ? 'mp4' : 'jpg';
        return `facebook_${timestamp}_${random}.${extension}`;
    }

    /**
     * Download and send media
     */
    async downloadAndSendMedia(messageInfo, media, title, index, total) {
        const tempFile = path.join(__dirname, '..', 'tmp', this.generateUniqueFilename(media.type));
        
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

            // Prepare clean caption for single media
            let caption = `📘 **Facebook ${media.type === 'video' ? 'Video' : 'Image'}**`;
            
            if (title && title !== 'Facebook Media' && title !== 'Facebook Video') {
                caption += `\n📝 ${title}`;
            }
            
            if (media.quality && media.type === 'video') {
                caption += `\n🎥 Quality: ${media.quality}`;
            }

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
            /facebook\.com\/share\/v\/[\w-]+/,
            /facebook\.com\/share\/r\/[\w-]+/,
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
