/**
 * MATDEV Pinterest Downloader Plugin
 * Download Pinterest images and videos using direct API scraping (2025)
 * FIXED: Complete rewrite with proper video detection
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class PinterestPlugin {
    constructor() {
        this.name = 'pinterest';
        this.description = 'Pinterest media downloader (images and videos)';
        this.version = '2.2.0';
        
        // Pinterest URL regex
        this.pinterestUrlRegex = /(?:https?:\/\/)?(?:www\.)?(?:pinterest\.com\/pin\/|pin\.it\/)([a-zA-Z0-9_-]+)/;
        
        // File size limits (WhatsApp limits)
        this.videoSizeLimit = 2 * 1024 * 1024 * 1024; // 2GB
        this.videoMediaLimit = 16 * 1024 * 1024; // 16MB (for inline video)
        this.imageSizeLimit = 5 * 1024 * 1024; // 5MB for images

        // Pinterest headers (critical for API access)
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://www.pinterest.com/',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Cache-Control': 'max-age=0'
        };
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(prefix = 'pin', extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = extension.startsWith('.') ? extension : (extension ? `.${extension}` : '');
        return `${prefix}_${timestamp}_${random}${ext}`;
    }

    /**
     * Validate Pinterest URL and expand short links
     */
    async validatePinterestUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        let cleanUrl = url.trim();
        
        try {
            // If it's a pin.it short URL, expand it first
            if (cleanUrl.includes('pin.it')) {
                if (!cleanUrl.startsWith('http')) {
                    cleanUrl = 'https://' + cleanUrl;
                }
                
                // Follow redirect to get full URL
                const response = await axios.get(cleanUrl, {
                    headers: this.headers,
                    maxRedirects: 5,
                    validateStatus: () => true
                });
                
                // Get final URL after redirects
                cleanUrl = response.request.res.responseUrl || cleanUrl;
            }
            
            const match = this.pinterestUrlRegex.exec(cleanUrl);
            if (match) {
                if (!cleanUrl.startsWith('http')) {
                    cleanUrl = 'https://' + cleanUrl;
                }
                
                return {
                    url: cleanUrl,
                    pinId: match[1]
                };
            }
        } catch (error) {
            console.error('URL validation error:', error.message);
        }
        
        return null;
    }

    /**
     * Extract all JSON data blocks from Pinterest HTML
     */
    extractAllJsonData(html) {
        const jsonBlocks = [];
        
        // Method 1: __PWS_DATA__ script tag
        const pwsMatch = html.match(/<script[^>]*id="__PWS_DATA__"[^>]*>(.*?)<\/script>/s);
        if (pwsMatch && pwsMatch[1]) {
            try {
                jsonBlocks.push(JSON.parse(pwsMatch[1]));
            } catch (e) {
                console.error('Failed to parse __PWS_DATA__:', e.message);
            }
        }
        
        // Method 2: All JSON script tags
        const scriptMatches = html.matchAll(/<script[^>]*type="application\/json"[^>]*>(.*?)<\/script>/gs);
        for (const match of scriptMatches) {
            try {
                jsonBlocks.push(JSON.parse(match[1]));
            } catch (e) {
                // Skip invalid JSON
            }
        }
        
        return jsonBlocks;
    }

    /**
     * Search recursively through object for video URLs
     */
    findVideoUrl(obj, depth = 0) {
        if (depth > 10) return null; // Prevent infinite recursion
        
        if (!obj || typeof obj !== 'object') return null;
        
        // Check if this object has video_list
        if (obj.video_list && typeof obj.video_list === 'object') {
            // Try different quality levels
            const qualities = ['V_720P', 'V_HLSV4', 'V_HLSV3_MOBILE', 'V_EXP7', 'V_EXP6', 'V_EXP5'];
            
            for (const quality of qualities) {
                if (obj.video_list[quality]?.url) {
                    return obj.video_list[quality].url;
                }
            }
            
            // Get any available video URL
            for (const key in obj.video_list) {
                if (obj.video_list[key]?.url) {
                    return obj.video_list[key].url;
                }
            }
        }
        
        // Check for direct video URL property
        if (obj.url && typeof obj.url === 'string' && obj.url.includes('.mp4')) {
            return obj.url;
        }
        
        // Recursively search in nested objects and arrays
        for (const key in obj) {
            if (key === 'videos' || key === 'video_list' || key === 'video') {
                const result = this.findVideoUrl(obj[key], depth + 1);
                if (result) return result;
            }
        }
        
        // Search all nested objects
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                const result = this.findVideoUrl(obj[key], depth + 1);
                if (result) return result;
            }
        }
        
        return null;
    }

    /**
     * Search recursively through object for image URLs
     */
    findImageUrl(obj, depth = 0) {
        if (depth > 10) return null;
        
        if (!obj || typeof obj !== 'object') return null;
        
        // Check for images object with orig
        if (obj.images?.orig?.url) {
            return obj.images.orig.url;
        }
        
        // Check for direct image URL
        if (obj.url && typeof obj.url === 'string' && 
            (obj.url.includes('pinimg.com') || obj.url.match(/\.(jpg|jpeg|png|webp)/i))) {
            return obj.url;
        }
        
        // Recursively search
        for (const key in obj) {
            if (key === 'images' || key === 'image') {
                const result = this.findImageUrl(obj[key], depth + 1);
                if (result) return result;
            }
        }
        
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                const result = this.findImageUrl(obj[key], depth + 1);
                if (result) return result;
            }
        }
        
        return null;
    }

    /**
     * Recursively search for a Pinterest URL in any string field of an object
     */
    extractPinterestUrlFromObject(obj) {
        const urlRegex = /https?:\/\/(?:www\.)?(?:pinterest\.com\/pin\/|pin\.it\/)[a-zA-Z0-9_-]+/i;
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                const match = obj[key].match(urlRegex);
                if (match) return match[0];
            } else if (typeof obj[key] === 'object') {
                const found = this.extractPinterestUrlFromObject(obj[key]);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Recursively search for a URL in any string field of an object (for YT, IG, FB, Twitter)
     */
    extractUrlFromObject(obj, urlRegex) {
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                const match = obj[key].match(urlRegex);
                if (match) return match[0];
            } else if (typeof obj[key] === 'object') {
                const found = this.extractUrlFromObject(obj[key], urlRegex);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Get Pinterest media info by scraping the page
     */
    async getPinterestMediaInfo(url) {
        try {
            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 30000
            });

            const html = response.data;
            
            // Extract all JSON data from page
            const jsonBlocks = this.extractAllJsonData(html);
            
            let videoUrl = null;
            let imageUrl = null;
            
            // Search all JSON blocks for video
            for (const jsonData of jsonBlocks) {
                videoUrl = this.findVideoUrl(jsonData);
                if (videoUrl) {
                    break;
                }
            }
            
            // If no video found, search for image
            if (!videoUrl) {
                for (const jsonData of jsonBlocks) {
                    imageUrl = this.findImageUrl(jsonData);
                    if (imageUrl) {
                        break;
                    }
                }
            }
            
            // Fallback: Regex search in raw HTML
            if (!videoUrl && !imageUrl) {
                
                // Video regex patterns
                const videoPatterns = [
                    /"url":"(https:\/\/[^"]*\.mp4[^"]*)"/,
                    /"V_720P":\{"url":"([^"]+)"/,
                    /"video_list":[^}]*"url":"([^"]+\.mp4[^"]*)"/
                ];
                
                for (const pattern of videoPatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        videoUrl = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
                        break;
                    }
                }
                
                // Image regex patterns (only if no video)
                if (!videoUrl) {
                    const imagePatterns = [
                        /"url":"(https:\/\/i\.pinimg\.com\/originals\/[^"]+)"/,
                        /"orig":\{"url":"([^"]+)"/
                    ];
                    
                    for (const pattern of imagePatterns) {
                        const match = html.match(pattern);
                        if (match && match[1]) {
                            imageUrl = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
                            break;
                        }
                    }
                }
            }

            const finalUrl = videoUrl || imageUrl;
            const isVideo = !!videoUrl;
            
            if (!finalUrl) {
                throw new Error('Could not extract media URL from Pinterest page');
            }

            return {
                url: finalUrl,
                isVideo: isVideo
            };

        } catch (error) {
            console.error('Pinterest scraping error:', error.message);
            throw error;
        }
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
                timeout: 90000,
                headers: this.headers
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
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Pinterest plugin loaded with enhanced video detection (2025)');
        return this;
    }

    /**
     * Register Pinterest commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('pin', this.downloadPinterest.bind(this), {
            description: 'Download Pinterest media (image/video)',
            usage: `${config.PREFIX}pin <url>`,
            category: 'download',
            plugin: 'pinterest',
            source: 'pinterest.js'
        });
    }

    /**
     * Download Pinterest media
     */
    async downloadPinterest(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            
            //quoted message extraction for robust reply/tag support
            if (!url) {
                // Try to extract quoted message from raw WhatsApp message object
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                if (quotedMessage) {
                    url = this.extractPinterestUrlFromObject(quotedMessage) || '';
                }
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a Pinterest URL\n\nUsage: ${config.PREFIX}pin <url>`);
            }

            const validatedUrl = await this.validatePinterestUrl(url);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Pinterest URL (pin.it or pinterest.com/pin/)');
            }
            
            const tempDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(tempDir);

            try {
                // Get Pinterest media info by scraping
                const mediaInfo = await this.getPinterestMediaInfo(validatedUrl.url);
                
                const extension = mediaInfo.isVideo ? 'mp4' : 'jpg';
                const filename = this.generateUniqueFilename('pin', extension);
                
                // Download media to tmp folder
                const result = await this.downloadMediaFromUrl(mediaInfo.url, filename, tempDir);
                
                // Check size limits
                if (mediaInfo.isVideo && result.size > this.videoSizeLimit) {
                    await fs.unlink(result.path).catch(() => {});
                    return await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Video too large (${this.formatFileSize(result.size)}). WhatsApp limit is 2GB.`);
                }
                
                if (!mediaInfo.isVideo && result.size > this.imageSizeLimit) {
                    await fs.unlink(result.path).catch(() => {});
                    return await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Image too large (${this.formatFileSize(result.size)}). Limit is 5MB.`);
                }

                // Read file as buffer
                const mediaBuffer = await fs.readFile(result.path);

                // Send media WITHOUT caption
                if (mediaInfo.isVideo) {
                    // Send as document if over 16MB, otherwise as video
                    if (result.size > this.videoMediaLimit) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            document: mediaBuffer,
                            mimetype: 'video/mp4',
                            fileName: filename
                        });
                    } else {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            video: mediaBuffer,
                            mimetype: 'video/mp4',
                            fileName: filename
                        });
                    }
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: mediaBuffer,
                        mimetype: 'image/jpeg',
                        fileName: filename
                    });
                }

                // Clean up temp file
                await fs.unlink(result.path).catch(() => {});

            } catch (error) {
                console.error('Pinterest download failed:', error);
                
                let errorMsg = '❌ Download failed. ';
                if (error.message?.includes('private')) {
                    errorMsg += 'This pin may be private.';
                } else if (error.message?.includes('not found')) {
                    errorMsg += 'Pin not found or deleted.';
                } else if (error.message?.includes('extract')) {
                    errorMsg += 'Could not extract media from Pinterest. The pin may have restricted access.';
                } else {
                    errorMsg += 'Please try again later or check if the pin is available.';
                }
                
                await this.bot.messageHandler.reply(messageInfo, errorMsg);
            }

        } catch (error) {
            console.error('Pinterest command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the Pinterest media');
        }
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