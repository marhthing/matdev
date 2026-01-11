/**
 * MATDEV Facebook Downloader Plugin
 * Download Facebook videos using fb-downloader-scrapper (2025)
 */

const { getFbVideoInfo } = require('fb-downloader-scrapper');
const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

// Add custom headers for Facebook requests
const FACEBOOK_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Connection': 'keep-alive',
};

class FacebookPlugin {
    constructor() {
        this.name = 'facebook';
        this.description = 'Facebook video downloader';
        this.version = '1.0.0';
        
        // Facebook URL regex (supports multiple formats)
        this.fbUrlRegex = /(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/(?:watch\/?\?v=|.*\/videos\/|.*\/posts\/|.*\/reel\/|share\/v\/|video\.php\?v=)([0-9]+)|(?:https?:\/\/)?fb\.watch\/([a-zA-Z0-9_-]+)/;
        
        // File size limits (WhatsApp limits)
        this.videoSizeLimit = 2 * 1024 * 1024 * 1024; // 2GB
        this.videoMediaLimit = 16 * 1024 * 1024; // 16MB (for inline video)
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(prefix = 'fb', extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = extension.startsWith('.') ? extension : (extension ? `.${extension}` : '');
        return `${prefix}_${timestamp}_${random}${ext}`;
    }

    /**
     * Validate Facebook URL
     */
    validateFacebookUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        const cleanUrl = url.trim();
        
        try {
            // Check if it's a valid Facebook URL
            if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch')) {
                // Normalize URL
                let normalizedUrl = cleanUrl;
                if (!cleanUrl.startsWith('http')) {
                    normalizedUrl = 'https://' + cleanUrl;
                }
                
                return {
                    url: normalizedUrl
                };
            }
        } catch (error) {
            console.error('URL validation error:', error);
        }
        
        return null;
    }

    /**
     * Recursively search for a Facebook URL in any string field of an object
     * (EXACT Pinterest style, works for any quoted/tagged message)
     */
    extractFacebookUrlFromObject(obj) {
        // Improved regex: require at least one path segment after /share/r/ or similar
        const fbUrlRegex = /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/(?:watch\/\?v=|.*\/videos\/|.*\/posts\/|.*\/reel\/|share\/r\/[a-zA-Z0-9._-]+|video\.php\?v=|reel|watch|video|story|\w+)(?:\/[a-zA-Z0-9._-]+)*(?:\?[^\s]*)?|https?:\/\/fb\.watch\/[a-zA-Z0-9_-]+/i;
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                const match = obj[key].match(fbUrlRegex);
                if (match) {
                    // Trim trailing punctuation or whitespace
                    return match[0].replace(/[.,;!?\s]+$/, '');
                }
            } else if (typeof obj[key] === 'object') {
                const found = this.extractFacebookUrlFromObject(obj[key]);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Download media file from URL to tmp folder
     */
    async downloadMediaFromUrl(mediaUrl, filename, tempDir) {
        await fs.ensureDir(tempDir);
        const tempFile = path.join(tempDir, filename);
        
        try {
            const response = await axios.get(mediaUrl, {
                responseType: 'stream',
                timeout: 120000, // 2 minutes for large Facebook videos
                headers: FACEBOOK_HEADERS // Use custom headers
            });

            // Write to temp file
            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFile);
                response.data.pipe(writeStream);
                
                response.data.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
            });

            // Get file stats
            const stats = await fs.stat(tempFile);
            
            return {
                path: tempFile,
                size: stats.size
            };

        } catch (error) {
            // Clean up on error
            await fs.unlink(tempFile).catch(() => {});
            console.error('Download error:', error.message);
            throw error;
        }
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

    /**
     * Format duration
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
        }
        return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Facebook plugin loaded with fb-downloader-scrapper (2025 method)');
        return this;
    }

    /**
     * Register Facebook commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('fb', this.downloadFacebook.bind(this), {
            description: 'Download Facebook video',
            usage: `${config.PREFIX}fb <url>`,
            category: 'download',
            plugin: 'facebook',
            source: 'facebook.js'
        });
    }

    /**
     * Download Facebook video
     */
    async downloadFacebook(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            // Robust quoted/tagged message extraction (EXACTLY like YouTube)
            if (!url) {
                // Only check raw WhatsApp quoted message object (no fallback)
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                if (quotedMessage) {
                    console.log('[FB DEBUG] QuotedMessage object:', JSON.stringify(quotedMessage));
                    url = this.extractFacebookUrlFromObject(quotedMessage) || '';
                    console.log('[FB DEBUG] Extracted URL from quotedMessage:', url);
                }
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a Facebook video URL\n\nUsage: ${config.PREFIX}fb <url>\n\nSupported: Videos, Reels, Watch`);
            }

            const validatedUrl = this.validateFacebookUrl(url);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Facebook video URL');
            }
            
            const tempDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(tempDir);

            try {
                // Get Facebook video info using fb-downloader-scrapper
                const data = await getFbVideoInfo(validatedUrl.url);
                
                if (!data || (!data.sd && !data.hd)) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Could not fetch video. The video may be private, unavailable, or not a video post.');
                }

                // Prefer HD quality, fallback to SD
                const videoUrl = data.hd || data.sd;
                const quality = data.hd ? 'HD' : 'SD';
                
                const filename = this.generateUniqueFilename('fb_video', 'mp4');
                
                // Download video to tmp folder
                const result = await this.downloadMediaFromUrl(videoUrl, filename, tempDir);
                
                // Check size limit
                if (result.size > this.videoSizeLimit) {
                    await fs.unlink(result.path).catch(() => {});
                    return await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Video too large (${this.formatFileSize(result.size)}). WhatsApp limit is 2GB.`);
                }

                // Read file as buffer
                const videoBuffer = await fs.readFile(result.path);

                // Send video
                if (result.size > this.videoMediaLimit) {
                    // Send as document if over 16MB
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        document: videoBuffer,
                        mimetype: 'video/mp4',
                        fileName: filename
                    });
                } else {
                    // Send as video if under 16MB
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        video: videoBuffer,
                        mimetype: 'video/mp4',
                        fileName: filename
                    });
                }

                // Clean up temp file
                await fs.unlink(result.path).catch(() => {});

            } catch (error) {
                console.error('Facebook download failed:', error);
                
                let errorMsg = '❌ Download failed. ';
                if (error.message?.includes('private')) {
                    errorMsg += 'This video may be private.';
                } else if (error.message?.includes('not found')) {
                    errorMsg += 'Video not found or deleted.';
                } else if (error.message?.includes('timeout')) {
                    errorMsg += 'Download timed out. The video may be too large.';
                } else {
                    errorMsg += 'Please try again later or check if the video is available.';
                }
                
                await this.bot.messageHandler.reply(messageInfo, errorMsg);
            }

        } catch (error) {
            console.error('Facebook command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the Facebook video');
        }
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