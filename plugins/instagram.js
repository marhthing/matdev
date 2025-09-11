
/**
 * MATDEV Instagram Downloader Plugin
 * Download Instagram posts, reels, stories, and IGTV videos
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class InstagramPlugin {
    constructor() {
        this.name = 'instagram';
        this.description = 'Instagram media downloader with 2025 anti-bot bypass';
        this.version = '2.0.0';
        
        // Instagram URL regex patterns
        this.instagramRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/([A-Za-z0-9_-]+)\/?/i;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB limit
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ Instagram plugin loaded with 2025 anti-bot enhancements');
        return this;
    }

    /**
     * Register Instagram commands
     */
    registerCommands() {
        // Instagram command only
        this.bot.messageHandler.registerCommand('ig', this.downloadInstagram.bind(this), {
            description: 'Download Instagram media',
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
            
            // Check if it's a reply to a message
            if (!url && messageInfo.quoted?.text) {
                url = messageInfo.quoted.text;
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide an Instagram URL\n\nUsage: ${config.PREFIX}ig <url>`);
            }

            // Validate Instagram URL
            const match = url.match(this.instagramRegex);
            if (!match) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid Instagram URL');
            }

            const shortcode = match[1];
            
            try {
                // Try multiple Instagram download methods with enhanced retry logic (2025)
                console.log(`🎯 Processing Instagram URL: ${url}`);
                
                const mediaData = await this.tryWithRetry(url, shortcode, 2);

                if (!mediaData || !mediaData.media || mediaData.media.length === 0) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No media found in this post or media extraction failed. The post may be private, unavailable, or Instagram has blocked our requests. Try again later or use a different post.');
                }

                console.log(`✅ Successfully found ${mediaData.media.length} media item(s) from Instagram`);

                // Process and send each media item
                for (let i = 0; i < mediaData.media.length; i++) {
                    const media = mediaData.media[i];
                    
                    try {
                        await this.downloadAndSendMedia(messageInfo, media, i + 1, mediaData.media.length);
                        
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
                console.error('Instagram download error:', error);
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to download Instagram media: ${error.message}`);
            }

        } catch (error) {
            console.error('Instagram command error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the Instagram URL');
        }
    }

    /**
     * Get random user agent for Instagram requests
     */
    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0'
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    /**
     * Try RapidAPI Instagram downloader with enhanced headers (2025)
     */
    async tryRapidAPI(url) {
        try {
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const response = await axios.get(`https://instagram-downloader-download-instagram-videos-stories.p.rapidapi.com/index`, {
                params: { url: url },
                timeout: 20000,
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || process.env.INSTAGRAM_RAPIDAPI_KEY || 'demo-key',
                    'X-RapidAPI-Host': 'instagram-downloader-download-instagram-videos-stories.p.rapidapi.com',
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'cross-site'
                }
            });

            if (!response.data || !response.data.media) {
                return null;
            }

            const media = [];
            
            if (Array.isArray(response.data.media)) {
                for (const item of response.data.media) {
                    if (item.url) {
                        media.push({
                            type: item.type || 'image',
                            url: item.url
                        });
                    }
                }
            }

            console.log(`🟢 RapidAPI success: Found ${media.length} media item(s)`);
            return {
                media: media,
                caption: response.data.caption || ''
            };

        } catch (error) {
            if (error.response?.status === 429) {
                console.log('⚠️ RapidAPI rate limited - will retry with different method');
            } else if (error.response?.status === 403) {
                console.log('⚠️ RapidAPI 403 forbidden - Instagram blocked request');
            } else {
                console.log('RapidAPI Instagram failed:', error.message);
            }
            return null;
        }
    }

    /**
     * Try alternative Instagram API with enhanced 2025 headers
     */
    async tryAlternativeAPI(shortcode) {
        try {
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const response = await axios.get(`https://www.instagram.com/p/${shortcode}/`, {
                timeout: 20000,
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Cookie': 'csrftoken=missing; sessionid='
                }
            });

            const html = response.data;
            const media = [];

            // Extract JSON data from HTML
            const jsonMatch = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
            if (jsonMatch) {
                try {
                    const jsonData = JSON.parse(jsonMatch[1]);
                    if (jsonData.video && jsonData.video.contentUrl) {
                        media.push({
                            type: 'video',
                            url: jsonData.video.contentUrl
                        });
                    } else if (jsonData.image && jsonData.image.url) {
                        media.push({
                            type: 'image',
                            url: jsonData.image.url
                        });
                    }
                } catch (parseError) {
                    console.log('JSON parsing failed:', parseError.message);
                }
            }

            // Fallback: try to extract from window._sharedData
            const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.*?});/);
            if (sharedDataMatch && media.length === 0) {
                try {
                    const sharedData = JSON.parse(sharedDataMatch[1]);
                    const postData = sharedData?.entry_data?.PostPage?.[0]?.graphql?.shortcode_media;
                    
                    if (postData) {
                        if (postData.is_video && postData.video_url) {
                            media.push({
                                type: 'video',
                                url: postData.video_url
                            });
                        } else if (postData.display_url) {
                            media.push({
                                type: 'image',
                                url: postData.display_url
                            });
                        }

                        // Handle carousel posts
                        if (postData.edge_sidecar_to_children?.edges) {
                            for (const edge of postData.edge_sidecar_to_children.edges) {
                                const node = edge.node;
                                if (node.is_video && node.video_url) {
                                    media.push({
                                        type: 'video',
                                        url: node.video_url
                                    });
                                } else if (node.display_url) {
                                    media.push({
                                        type: 'image',
                                        url: node.display_url
                                    });
                                }
                            }
                        }
                    }
                } catch (parseError) {
                    console.log('Shared data parsing failed:', parseError.message);
                }
            }

            if (media.length > 0) {
                console.log(`🟡 Alternative API success: Found ${media.length} media item(s)`);
                return { media: media };
            }
            return null;

        } catch (error) {
            if (error.response?.status === 404) {
                console.log('⚠️ Alternative API: Post not found or private');
            } else if (error.response?.status === 429) {
                console.log('⚠️ Alternative API: Rate limited');
            } else {
                console.log('Alternative Instagram API failed:', error.message);
            }
            return null;
        }
    }

    /**
     * Try modern Instagram scraper method (2025)
     */
    async tryInstagramScraper(url) {
        try {
            // Add delay to avoid detection
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Try third-party Instagram API services
            const services = [
                {
                    name: 'Instagram-API-python',
                    url: `https://instagram-api-2025.p.rapidapi.com/v1/post_info`,
                    params: { url: url },
                    headers: {
                        'X-RapidAPI-Key': process.env.RAPIDAPI_KEY || process.env.INSTAGRAM_RAPIDAPI_KEY || 'demo-key',
                        'X-RapidAPI-Host': 'instagram-api-2025.p.rapidapi.com'
                    }
                }
            ];

            for (const service of services) {
                try {
                    const response = await axios.get(service.url, {
                        params: service.params,
                        timeout: 15000,
                        headers: {
                            ...service.headers,
                            'User-Agent': this.getRandomUserAgent(),
                            'Accept': 'application/json',
                            'Accept-Language': 'en-US,en;q=0.9'
                        }
                    });

                    if (response.data && response.data.media_urls && response.data.media_urls.length > 0) {
                        const media = response.data.media_urls.map(item => ({
                            type: item.includes('.mp4') ? 'video' : 'image',
                            url: item
                        }));
                        
                        console.log(`🟠 ${service.name} success: Found ${media.length} media item(s)`);
                        return { media: media };
                    }
                } catch (serviceError) {
                    console.log(`⚠️ ${service.name} failed:`, serviceError.message);
                    continue;
                }
            }

            return null;
        } catch (error) {
            console.log('Instagram scraper failed:', error.message);
            return null;
        }
    }

    /**
     * Try with exponential backoff and multiple methods
     */
    async tryWithRetry(url, shortcode, maxRetries = 2) {
        const methods = [
            { name: 'RapidAPI', fn: () => this.tryRapidAPI(url) },
            { name: 'Alternative API', fn: () => this.tryAlternativeAPI(shortcode) },
            { name: 'Instagram Scraper', fn: () => this.tryInstagramScraper(url) }
        ];

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            for (const method of methods) {
                try {
                    console.log(`🔄 Trying ${method.name} (attempt ${attempt + 1}/${maxRetries})`);
                    const result = await method.fn();
                    
                    if (result && result.media && result.media.length > 0) {
                        return result;
                    }
                    
                    // Small delay between methods
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.log(`❌ ${method.name} error:`, error.message);
                }
            }
            
            // Exponential backoff between retry attempts
            if (attempt < maxRetries - 1) {
                const delay = Math.pow(2, attempt) * 2000; // 2s, 4s, 8s...
                console.log(`⏳ Waiting ${delay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return null;
    }

    /**
     * Download and send media
     */
    async downloadAndSendMedia(messageInfo, media, index, total) {
        const tempFile = path.join(__dirname, '..', 'tmp', `instagram_${media.type}_${Date.now()}_${index}.${media.type === 'video' ? 'mp4' : 'jpg'}`);
        
        try {
            // Ensure tmp directory exists
            await fs.ensureDir(path.dirname(tempFile));

            // Download media
            const response = await axios.get(media.url, {
                responseType: 'stream',
                timeout: 30000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.instagram.com/'
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

            // Send appropriate media type without caption
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
        const plugin = new InstagramPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
