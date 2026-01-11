/**
 * MATDEV Instagram Downloader Plugin
 * Download Instagram videos, photos, and reels using instagram-url-direct (2025)
 */

const { instagramGetUrl } = require('instagram-url-direct');
const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class InstagramPlugin {
    constructor() {
        this.name = 'instagram';
        this.description = 'Instagram media downloader (posts, reels, videos, photos)';
        this.version = '1.0.0';
        
        // Instagram URL regex
        this.igUrlRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/;
        
        // File size limits (WhatsApp limits)
        this.videoSizeLimit = 2 * 1024 * 1024 * 1024; // 2GB
        this.videoMediaLimit = 16 * 1024 * 1024; // 16MB (for inline video)
        this.imageSizeLimit = 5 * 1024 * 1024; // 5MB for images
    }

    /**
     * Generate unique filename
     */
    generateUniqueFilename(prefix = 'ig', extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = extension.startsWith('.') ? extension : (extension ? `.${extension}` : '');
        return `${prefix}_${timestamp}_${random}${ext}`;
    }

    /**
     * Validate Instagram URL
     */
    validateInstagramUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        const cleanUrl = url.trim();
        
        try {
            const match = this.igUrlRegex.exec(cleanUrl);
            if (match) {
                // Normalize URL
                let normalizedUrl = cleanUrl;
                if (!cleanUrl.startsWith('http')) {
                    normalizedUrl = 'https://' + cleanUrl;
                }
                
                return {
                    url: normalizedUrl,
                    shortcode: match[1]
                };
            }
        } catch (error) {
            console.error('URL validation error:', error);
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
                timeout: 90000, // 90 seconds
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                }
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
        console.log('✅ Instagram plugin loaded with instagram-url-direct (2025 method)');
        return this;
    }

    /**
     * Register Instagram commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('ig', this.downloadInstagram.bind(this), {
            description: 'Download Instagram media (post/reel/video)',
            usage: `${config.PREFIX}ig <url>`,
            category: 'download',
            plugin: 'instagram',
            source: 'instagram.js'
        });
    }

    /**
     * Download Instagram media
     */
    async downloadInstagram(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            if (!url) {
                // Try to extract quoted message from raw WhatsApp message object
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                if (quotedMessage) {
                    // Use Pinterest's extractUrlFromObject for Instagram URLs
                    const igUrlRegex = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|tv)\/[a-zA-Z0-9_-]+/i;
                    url = require('./pinterest').extractUrlFromObject(quotedMessage, igUrlRegex) || '';
                }
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide an Instagram URL\n\nUsage: ${config.PREFIX}ig <url>\n\nSupported: Posts, Reels, Videos`);
            }

            const validatedUrl = this.validateInstagramUrl(url);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Instagram URL (post/reel/video)');
            }
            
            const tempDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(tempDir);

            try {
                // Get Instagram media info and URLs
                const data = await instagramGetUrl(validatedUrl.url);
                
                if (!data || !data.url_list || data.url_list.length === 0) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Could not fetch media. The post may be private or unavailable.');
                }

                // Process each media item
                const mediaCount = data.results_number || data.url_list.length;
                
                if (mediaCount === 1) {
                    // Single media item
                    const mediaDetail = data.media_details?.[0];
                    const mediaUrl = data.url_list[0];
                    const isVideo = mediaDetail?.type === 'video';
                    
                    const extension = isVideo ? 'mp4' : 'jpg';
                    const filename = this.generateUniqueFilename('ig', extension);
                    
                    // Download media to tmp folder
                    const result = await this.downloadMediaFromUrl(mediaUrl, filename, tempDir);
                    
                    // Check size limits
                    if (isVideo && result.size > this.videoSizeLimit) {
                        await fs.unlink(result.path).catch(() => {});
                        return await this.bot.messageHandler.reply(messageInfo, 
                            `❌ Video too large (${this.formatFileSize(result.size)}). WhatsApp limit is 2GB.`);
                    }
                    
                    if (!isVideo && result.size > this.imageSizeLimit) {
                        await fs.unlink(result.path).catch(() => {});
                        return await this.bot.messageHandler.reply(messageInfo, 
                            `❌ Image too large (${this.formatFileSize(result.size)}). Limit is 5MB.`);
                    }

                    // Read file as buffer
                    const mediaBuffer = await fs.readFile(result.path);

                    // Send media
                    if (isVideo) {
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

                } else {
                    // Multiple media items (carousel post)
                    await this.bot.messageHandler.reply(messageInfo, 
                        `📸 Found ${mediaCount} media items. Downloading...`);
                    
                    let sentCount = 0;
                    const maxItems = Math.min(mediaCount, 10); // Limit to 10 items to avoid spam
                    
                    for (let i = 0; i < maxItems; i++) {
                        try {
                            const mediaDetail = data.media_details?.[i];
                            const mediaUrl = data.url_list[i];
                            const isVideo = mediaDetail?.type === 'video';
                            
                            const extension = isVideo ? 'mp4' : 'jpg';
                            const filename = this.generateUniqueFilename(`ig_${i + 1}`, extension);
                            
                            // Download media to tmp folder
                            const result = await this.downloadMediaFromUrl(mediaUrl, filename, tempDir);
                            
                            // Skip if too large
                            if ((isVideo && result.size > this.videoSizeLimit) || 
                                (!isVideo && result.size > this.imageSizeLimit)) {
                                console.log(`Skipping item ${i + 1}: too large`);
                                await fs.unlink(result.path).catch(() => {});
                                continue;
                            }

                            // Read file as buffer
                            const mediaBuffer = await fs.readFile(result.path);

                            // Send media
                            if (isVideo) {
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
                            
                            sentCount++;
                            
                            // Small delay between sends
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            
                        } catch (error) {
                            console.error(`Error downloading item ${i + 1}:`, error.message);
                            continue;
                        }
                    }
                    
                    if (sentCount === 0) {
                        await this.bot.messageHandler.reply(messageInfo, 
                            '❌ Could not download any media items');
                    }
                }

            } catch (error) {
                console.error('Instagram download failed:', error);
                
                let errorMsg = '❌ Download failed. ';
                if (error.message?.includes('private')) {
                    errorMsg += 'This post may be private.';
                } else if (error.message?.includes('not found')) {
                    errorMsg += 'Post not found or deleted.';
                } else {
                    errorMsg += 'Please try again later or check if the post is available.';
                }
                
                await this.bot.messageHandler.reply(messageInfo, errorMsg);
            }

        } catch (error) {
            console.error('Instagram command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the Instagram media');
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new InstagramPlugin();
        await plugin.init(bot);
        return plugin;
    }
};