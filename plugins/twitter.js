
/**
 * MATDEV Twitter/X Downloader Plugin
 * Download Twitter/X videos, images, and GIFs
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class TwitterPlugin {
    constructor() {
        this.name = 'twitter';
        this.description = 'Twitter/X media downloader';
        this.version = '1.0.0';
        
        // Twitter URL regex patterns
        this.twitterRegex = /(?:https?:\/\/)?(?:www\.)?(twitter\.com|x\.com)\/\w+\/status\/(\d+)/i;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB limit
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Twitter plugin loaded');
        return this;
    }

    /**
     * Register Twitter commands
     */
    registerCommands() {
        // X.com command only
        this.bot.messageHandler.registerCommand('x', this.downloadTwitter.bind(this), {
            description: 'Download X.com media',
            usage: `${config.PREFIX}x <url>`,
            category: 'download',
            plugin: 'twitter',
            source: 'twitter.js'
        });
    }

    /**
     * Download Twitter media
     */
    async downloadTwitter(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message
            if (!url && messageInfo.quoted?.text) {
                url = messageInfo.quoted.text;
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a Twitter/X URL\n\nUsage: ${config.PREFIX}twitter <url>\n\nExample: ${config.PREFIX}twitter https://twitter.com/user/status/123456789`);
            }

            // Validate Twitter URL
            const match = url.match(this.twitterRegex);
            if (!match) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Twitter/X URL');
            }

            const tweetId = match[2];
            
            try {
                // Try multiple Twitter download APIs
                let mediaData = null;
                
                // Method 1: Try fxtwitter API
                mediaData = await this.tryFxTwitter(tweetId);
                
                // Method 2: Try vxtwitter if first fails
                if (!mediaData) {
                    mediaData = await this.tryVxTwitter(tweetId);
                }
                
                // Method 3: Try twitsave API
                if (!mediaData) {
                    mediaData = await this.tryTwitSave(url);
                }

                if (!mediaData || !mediaData.media || mediaData.media.length === 0) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No media found in this tweet or media extraction failed. The tweet may contain only text or be private.');
                }

                // Process and send each media item
                for (let i = 0; i < mediaData.media.length; i++) {
                    const media = mediaData.media[i];
                    
                    try {
                        await this.downloadAndSendMedia(messageInfo, media, mediaData.tweet_text, i + 1, mediaData.media.length);
                        
                        // Add delay between multiple files
                        if (i < mediaData.media.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    } catch (mediaError) {
                        console.error(`Error downloading media ${i + 1}:`, mediaError);
                        await this.bot.messageHandler.reply(messageInfo, 
                            `❌ Failed to download media ${i + 1}/${mediaData.media.length}: ${mediaError.message}`);
                    }
                }

            } catch (error) {
                console.error('Twitter download error:', error);
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to download Twitter media: ${error.message}`);
            }

        } catch (error) {
            console.error('Twitter command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the Twitter URL');
        }
    }

    /**
     * Try fxtwitter API
     */
    async tryFxTwitter(tweetId) {
        try {
            const response = await axios.get(`https://api.fxtwitter.com/status/${tweetId}`, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.data || !response.data.tweet) {
                return null;
            }

            const tweet = response.data.tweet;
            const media = [];

            // Process videos
            if (tweet.media && tweet.media.videos) {
                for (const video of tweet.media.videos) {
                    if (video.url) {
                        media.push({
                            type: 'video',
                            url: video.url,
                            thumbnail: video.thumbnail_url
                        });
                    }
                }
            }

            // Process images
            if (tweet.media && tweet.media.photos) {
                for (const photo of tweet.media.photos) {
                    if (photo.url) {
                        media.push({
                            type: 'image',
                            url: photo.url
                        });
                    }
                }
            }

            return {
                media: media,
                tweet_text: tweet.text || '',
                author: tweet.author?.screen_name || 'Unknown'
            };

        } catch (error) {
            console.log('FxTwitter API failed:', error.message);
            return null;
        }
    }

    /**
     * Try vxtwitter API
     */
    async tryVxTwitter(tweetId) {
        try {
            const response = await axios.get(`https://api.vxtwitter.com/status/${tweetId}`, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            if (!response.data || !response.data.media) {
                return null;
            }

            const data = response.data;
            const media = [];

            // Process media
            if (data.media && data.media.length > 0) {
                for (const item of data.media) {
                    if (item.type === 'video' && item.url) {
                        media.push({
                            type: 'video',
                            url: item.url
                        });
                    } else if (item.type === 'image' && item.url) {
                        media.push({
                            type: 'image',
                            url: item.url
                        });
                    }
                }
            }

            return {
                media: media,
                tweet_text: data.text || '',
                author: data.user_screen_name || 'Unknown'
            };

        } catch (error) {
            console.log('VxTwitter API failed:', error.message);
            return null;
        }
    }

    /**
     * Try TwitSave API
     */
    async tryTwitSave(url) {
        try {
            const response = await axios.post('https://twitsave.com/info', {
                url: url
            }, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            // This is a simplified implementation
            // TwitSave typically returns HTML that needs parsing
            // For production, you'd need proper HTML parsing
            
            return null; // Placeholder - implement HTML parsing if needed

        } catch (error) {
            console.log('TwitSave API failed:', error.message);
            return null;
        }
    }

    /**
     * Download and send media
     */
    async downloadAndSendMedia(messageInfo, media, tweetText, index, total) {
        const tempFile = path.join(__dirname, '..', 'tmp', `twitter_${media.type}_${Date.now()}_${index}.${media.type === 'video' ? 'mp4' : 'jpg'}`);
        
        try {
            // Ensure tmp directory exists
            await fs.ensureDir(path.dirname(tempFile));

            // Download media
            const response = await axios.get(media.url, {
                responseType: 'stream',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
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
            const caption = total > 1 ? `📱 Twitter Media ${index}/${total}` : '📱 Twitter Media';

            // Send appropriate media type
            if (media.type === 'video') {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: mediaBuffer,
                    mimetype: 'video/mp4'
                });
            } else {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: mediaBuffer
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
        const plugin = new TwitterPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
