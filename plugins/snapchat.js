/**
 * MATDEV Snapchat Downloader Plugin
 * Download Snapchat Stories and Spotlight videos (2025)
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class SnapchatPlugin {
    constructor() {
        this.name = 'snapchat';
        this.description = 'Snapchat story/spotlight downloader';
        this.version = '1.0.0';
        
        // Snapchat URL regex patterns
        this.snapchatUrlRegex = /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/(?:@|add\/|t\/)([a-zA-Z0-9._-]+)(?:\/spotlight\/([a-zA-Z0-9_-]+))?/;
        this.shortSnapRegex = /(?:https?:\/\/)?(?:t\.snapchat\.com|story\.snapchat\.com|snapchat\.com\/t\/)\/([a-zA-Z0-9_-]+)/;
        
        // File size limits
        this.videoSizeLimit = 100 * 1024 * 1024; // 100MB
        
        // Headers
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.snapchat.com/',
            'DNT': '1',
            'Connection': 'keep-alive'
        };
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(username, extension = 'mp4') {
        const sanitize = (str) => str.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
        const timestamp = Date.now();
        return `snap_${sanitize(username)}_${timestamp}.${extension}`;
    }

    /**
     * Validate Snapchat URL
     */
    async validateSnapchatUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        let cleanUrl = url.trim();
        
        try {
            // Handle short URLs (including snapchat.com/t/)
            if (this.shortSnapRegex.test(cleanUrl) || cleanUrl.includes('/t/')) {
                if (!cleanUrl.startsWith('http')) {
                    cleanUrl = 'https://' + cleanUrl;
                }
                
                // Follow redirect
                const response = await axios.get(cleanUrl, {
                    headers: this.headers,
                    maxRedirects: 5,
                    validateStatus: () => true
                });
                
                cleanUrl = response.request.res.responseUrl || cleanUrl;
            }
            
            // Parse standard Snapchat URLs
            const match = this.snapchatUrlRegex.exec(cleanUrl);
            if (match) {
                if (!cleanUrl.startsWith('http')) {
                    cleanUrl = 'https://www.snapchat.com/@' + match[1];
                }
                
                return {
                    url: cleanUrl,
                    username: match[1],
                    spotlightId: match[2] || null
                };
            }
            
            // If it's still a /t/ URL after redirect, accept it
            if (cleanUrl.includes('snapchat.com')) {
                return {
                    url: cleanUrl,
                    username: 'snap',
                    spotlightId: null
                };
            }
        } catch (error) {
            console.error('URL validation error:', error.message);
        }
        
        return null;
    }

    /**
     * Extract all JSON data blocks from Snapchat HTML
     */
    extractJsonData(html) {
        const jsonBlocks = [];
        
        // Method 1: __NEXT_DATA__ script tag (Next.js data)
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
        if (nextDataMatch && nextDataMatch[1]) {
            try {
                jsonBlocks.push(JSON.parse(nextDataMatch[1]));
            } catch (e) {
                console.error('Failed to parse __NEXT_DATA__:', e.message);
            }
        }
        
        return jsonBlocks;
    }

    /**
     * Search recursively for media URLs in object
     */
    findMediaUrl(obj, depth = 0) {
        if (depth > 15) return null;
        if (!obj || typeof obj !== 'object') return null;
        
        // Check for direct mediaUrl property
        if (obj.mediaUrl && typeof obj.mediaUrl === 'string') {
            return obj.mediaUrl;
        }
        
        // Check for video/media properties
        if (obj.url && typeof obj.url === 'string' && 
            (obj.url.includes('.mp4') || obj.url.includes('video'))) {
            return obj.url;
        }
        
        // Check spotlight-specific properties
        if (obj.snapList && Array.isArray(obj.snapList)) {
            for (const snap of obj.snapList) {
                if (snap.snapUrls?.mediaUrl) {
                    return snap.snapUrls.mediaUrl;
                }
            }
        }
        
        // Recursively search nested objects
        for (const key in obj) {
            if (key === 'mediaUrl' || key === 'snapUrls' || key === 'media' || 
                key === 'video' || key === 'snapList' || key === 'curatedHighlights' || 
                key === 'spotlightHighlights') {
                const result = this.findMediaUrl(obj[key], depth + 1);
                if (result) return result;
            }
        }
        
        for (const key in obj) {
            if (typeof obj[key] === 'object') {
                const result = this.findMediaUrl(obj[key], depth + 1);
                if (result) return result;
            }
        }
        
        return null;
    }

    /**
     * Get Snapchat media info by scraping
     */
    async getSnapchatMediaInfo(url) {
        try {
            const response = await axios.get(url, {
                headers: this.headers,
                timeout: 30000
            });

            const html = response.data;
            
            // Extract JSON data
            const jsonBlocks = this.extractJsonData(html);
            
            let mediaUrl = null;
            let username = null;
            
            // Search JSON blocks for media URL
            for (const jsonData of jsonBlocks) {
                mediaUrl = this.findMediaUrl(jsonData);
                
                // Try to extract username
                if (!username && jsonData?.props?.pageProps) {
                    const pageProps = jsonData.props.pageProps;
                    username = pageProps.username || 
                               pageProps.publicProfileInfo?.username || 
                               pageProps.userProfile?.username;
                }
                
                if (mediaUrl) break;
            }
            
            // Fallback: Regex search in HTML
            if (!mediaUrl) {
                const mediaPatterns = [
                    /"mediaUrl":"([^"]+\.mp4[^"]*)"/,
                    /"url":"(https:\/\/[^"]*cf-st\.sc-cdn\.net[^"]*\.mp4[^"]*)"/,
                    /"video":\{"url":"([^"]+)"/
                ];
                
                for (const pattern of mediaPatterns) {
                    const match = html.match(pattern);
                    if (match && match[1]) {
                        mediaUrl = match[1].replace(/\\u002F/g, '/').replace(/\\/g, '');
                        break;
                    }
                }
            }

            if (!mediaUrl) {
                throw new Error('Could not extract media URL from Snapchat');
            }

            return {
                url: mediaUrl,
                username: username || 'unknown'
            };

        } catch (error) {
            console.error('Snapchat scraping error:', error.message);
            throw error;
        }
    }

    /**
     * Download media from URL
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

            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFile);
                response.data.pipe(writeStream);
                
                response.data.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
            });

            const stats = await fs.stat(tempFile);
            
            return {
                path: tempFile,
                size: stats.size
            };

        } catch (error) {
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
        console.log('✅ Snapchat plugin loaded');
        return this;
    }

    /**
     * Register commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('snapchat', this.downloadSnapchat.bind(this), {
            description: 'Download Snapchat story/spotlight',
            usage: `${config.PREFIX}snapchat <url>`,
            category: 'download',
            plugin: 'snapchat',
            source: 'snapchat.js'
        });

        this.bot.messageHandler.registerCommand('snap', this.downloadSnapchat.bind(this), {
            description: 'Download Snapchat story/spotlight (shortcut)',
            usage: `${config.PREFIX}snap <url>`,
            category: 'download',
            plugin: 'snapchat',
            source: 'snapchat.js'
        });
    }

    /**
     * Download Snapchat media
     */
    async downloadSnapchat(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            // Check if URL is in quoted message (robust, both possible locations)
            if (!url) {
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                if (quotedMessage) {
                    // Recursively search for a Snapchat URL in any string field
                    const snapUrlRegex = /https?:\/\/(?:www\.)?snapchat\.com\/(?:@|add\/|t\/)[a-zA-Z0-9._-]+(?:\/spotlight\/[a-zA-Z0-9_-]+)?|https?:\/\/(?:t\.snapchat\.com|story\.snapchat\.com|snapchat\.com\/t\/)[a-zA-Z0-9_-]+/i;
                    url = this.extractSnapchatUrlFromObject(quotedMessage, snapUrlRegex) || '';
                }
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a Snapchat URL\n\nUsage: ${config.PREFIX}snapchat <url>`);
            }

            const validatedUrl = await this.validateSnapchatUrl(url);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Snapchat URL');
            }
            
            const tempDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(tempDir);

            try {
                // Get Snapchat media info
                const mediaInfo = await this.getSnapchatMediaInfo(validatedUrl.url);
                
                const filename = this.generateUniqueFilename(mediaInfo.username);
                
                // Download media
                const result = await this.downloadMediaFromUrl(mediaInfo.url, filename, tempDir);
                
                // Check size limit
                if (result.size > this.videoSizeLimit) {
                    await fs.unlink(result.path).catch(() => {});
                    return await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Video too large (${this.formatFileSize(result.size)}). Limit is 100MB.`);
                }

                // Read file as buffer
                const mediaBuffer = await fs.readFile(result.path);

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: mediaBuffer,
                    mimetype: 'video/mp4',
                    fileName: filename
                });

                // Clean up temp file
                await fs.unlink(result.path).catch(() => {});

                console.log('✅ Snapchat media sent');

            } catch (error) {
                console.error('Snapchat download failed:', error);
                
                let errorMsg = '❌ Download failed. ';
                if (error.message?.includes('extract')) {
                    errorMsg += 'Could not find media. Make sure the story/spotlight is public.';
                } else if (error.message?.includes('not found')) {
                    errorMsg += 'Content not found or deleted.';
                } else {
                    errorMsg += 'Please try again later.';
                }
                
                await this.bot.messageHandler.reply(messageInfo, errorMsg);
            }

        } catch (error) {
            console.error('Snapchat command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing Snapchat media');
        }
    }

    /**
     * Recursively search for a Snapchat URL in any string field of an object
     */
    extractSnapchatUrlFromObject(obj, snapUrlRegex) {
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                const match = obj[key].match(snapUrlRegex);
                if (match) {
                    // Trim trailing punctuation or whitespace
                    return match[0].replace(/[.,;!?"]+$/, '');
                }
            } else if (typeof obj[key] === 'object') {
                const found = this.extractSnapchatUrlFromObject(obj[key], snapUrlRegex);
                if (found) return found;
            }
        }
        return null;
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new SnapchatPlugin();
        await plugin.init(bot);
        return plugin;
    }
};