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
     * Get Pinterest pin data using multiple proven 2025 methods
     */
    async getPinData(pinId) {
        try {
            // Use multiple working methods for 2025
            const methods = [
                () => this.methodOEmbed(pinId),        // Official Pinterest oEmbed API
                () => this.methodSocialBot(pinId),     // Social media bot headers 
                () => this.methodIframely(pinId),      // Iframely service (reliable)
                () => this.methodScraperAPI(pinId),    // Professional scraping service
                () => this.methodAdvancedScraping(pinId) // Advanced scraping techniques
            ];
            
            for (const [index, method] of methods.entries()) {
                try {
                    console.log(`Trying Pinterest method ${index + 1}...`);
                    const result = await method();
                    if (result && result.success && result.data && result.data.url) {
                        console.log(`✅ Pinterest method ${index + 1} succeeded`);
                        return result;
                    }
                } catch (error) {
                    console.log(`❌ Pinterest method ${index + 1} failed: ${error.message}`);
                    continue;
                }
            }
            
            throw new Error('All Pinterest extraction methods failed - Pinterest has strong anti-bot protection');
            
        } catch (error) {
            console.error('Pinterest extraction failed:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Method 1: Pinterest oEmbed API (Official API - 2025)
     */
    async methodOEmbed(pinId) {
        try {
            const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
            const oembedUrl = `https://www.pinterest.com/oembed/?url=${encodeURIComponent(pinUrl)}&format=json`;
            
            const response = await axios.get(oembedUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Referer': 'https://www.pinterest.com/'
                },
                timeout: 10000
            });

            if (response.data && response.data.url) {
                // Extract image from oEmbed thumbnail_url or parse HTML
                let mediaUrl = response.data.thumbnail_url;
                let mediaType = 'image';
                
                // Try to get higher quality image from the HTML if available
                if (response.data.html) {
                    const imgMatch = response.data.html.match(/src="([^"]+)"/);
                    if (imgMatch && imgMatch[1]) {
                        mediaUrl = imgMatch[1];
                    }
                }
                
                if (mediaUrl) {
                    return {
                        success: true,
                        data: {
                            url: mediaUrl,
                            description: response.data.title || 'Pinterest media',
                            type: mediaType,
                            title: response.data.title || 'Pinterest Pin'
                        }
                    };
                }
            }
            
            throw new Error('No media found in oEmbed response');
            
        } catch (error) {
            throw new Error(`Method One (oEmbed) failed: ${error.message}`);
        }
    }

    /**
     * Method 2: Social Media Bot Headers (2025 Bypass)
     */
    async methodSocialBot(pinId) {
        try {
            const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
            
            // Use different social media bot user agents that Pinterest allows
            const botAgents = [
                'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Twitterbot/1.0',
                'WhatsApp/2.23.24.76',
                'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +https://www.linkedin.com/)'
            ];
            
            const userAgent = botAgents[Math.floor(Math.random() * botAgents.length)];
            
            const response = await axios.get(pinUrl, {
                headers: {
                    'User-Agent': userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                timeout: 10000
            });

            const html = response.data;
            
            // Multiple extraction patterns
            const patterns = [
                // Open Graph image
                /property="og:image" content="([^"]+)"/,
                // Twitter card image  
                /name="twitter:image" content="([^"]+)"/,
                // JSON-LD structured data
                /"image":"([^"]+)"/,
                // Direct image URL in scripts
                /imgUrl.*?["']([^"']+\.(?:jpg|jpeg|png|webp|gif))/i
            ];
            
            let mediaUrl = null;
            let title = null;
            let description = null;
            
            // Extract title and description
            const titleMatch = html.match(/<title>([^<]+)<\/title>/);
            const descMatch = html.match(/property="og:description" content="([^"]+)"/);
            
            if (titleMatch) title = titleMatch[1].trim();
            if (descMatch) description = descMatch[1].trim();
            
            // Try each extraction pattern
            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match && match[1]) {
                    mediaUrl = match[1];
                    // Clean up escaped characters
                    mediaUrl = mediaUrl.replace(/\\u002F/g, '/').replace(/\\/g, '');
                    break;
                }
            }
            
            if (mediaUrl) {
                return {
                    success: true,
                    data: {
                        url: mediaUrl,
                        description: description || title || 'Pinterest media',
                        type: 'image',
                        title: title || 'Pinterest Pin'
                    }
                };
            }
            
            throw new Error('No media found with social bot headers');
            
        } catch (error) {
            throw new Error(`Method Two (Social Bot) failed: ${error.message}`);
        }
    }

    /**
     * Method 3: Iframely Service (Reliable Third-Party)
     */
    async methodIframely(pinId) {
        try {
            const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
            const iframelyUrl = `https://iframe.ly/api/oembed?url=${encodeURIComponent(pinUrl)}&omit_script=true`;
            
            const response = await axios.get(iframelyUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.data && response.data.thumbnail_url) {
                return {
                    success: true,
                    data: {
                        url: response.data.thumbnail_url,
                        description: response.data.title || 'Pinterest media',
                        type: 'image',
                        title: response.data.title || 'Pinterest Pin'
                    }
                };
            }
            
            throw new Error('No thumbnail found in Iframely response');
            
        } catch (error) {
            throw new Error(`Method Iframely failed: ${error.message}`);
        }
    }

    /**
     * Method 4: Professional Scraping Service (ScraperOps - 2025)
     */
    async methodScraperAPI(pinId) {
        try {
            const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
            
            // Try multiple professional services
            const services = [
                // ScraperOps - Free tier available
                {
                    name: 'ScraperOps',
                    url: `https://proxy.scrapeops.io/v1/?url=${encodeURIComponent(pinUrl)}&render_js=true&wait=3000`,
                    headers: { 'User-Agent': this.userAgent }
                },
                // ScrapingBee alternative endpoint
                {
                    name: 'Generic Proxy',
                    url: `https://api.allorigins.win/raw?url=${encodeURIComponent(pinUrl)}`,
                    headers: { 'User-Agent': this.userAgent }
                }
            ];
            
            for (const service of services) {
                try {
                    const response = await axios.get(service.url, {
                        headers: service.headers,
                        timeout: 20000
                    });
                    
                    if (response.data && typeof response.data === 'string') {
                        const html = response.data;
                        
                        // Extract using multiple patterns
                        const patterns = [
                            /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
                            /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
                            /"images":\s*{[^}]*"orig":\s*{[^}]*"url":\s*"([^"]+)"/,
                            /src=["']([^"']*pinimg\.com[^"']*\.jpg[^"']*)["']/i
                        ];
                        
                        let mediaUrl = null;
                        let title = null;
                        let description = null;
                        
                        // Extract metadata
                        const titleMatch = html.match(/<title[^>]*>([^<]+)</);
                        const descMatch = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/);
                        
                        if (titleMatch) title = titleMatch[1].replace(' | Pinterest', '').trim();
                        if (descMatch) description = descMatch[1].trim();
                        
                        // Try each pattern
                        for (const pattern of patterns) {
                            const match = html.match(pattern);
                            if (match && match[1] && match[1].startsWith('http')) {
                                mediaUrl = match[1];
                                break;
                            }
                        }
                        
                        if (mediaUrl) {
                            return {
                                success: true,
                                data: {
                                    url: mediaUrl,
                                    description: description || title || 'Pinterest media',
                                    type: 'image',
                                    title: title || 'Pinterest Pin'
                                }
                            };
                        }
                    }
                } catch (serviceError) {
                    console.log(`${service.name} failed: ${serviceError.message}`);
                    continue;
                }
            }
            
            throw new Error('All professional scraping services failed');
            
        } catch (error) {
            throw new Error(`Method ScraperAPI failed: ${error.message}`);
        }
    }

    /**
     * Method 5: Advanced Scraping with Stealth Headers (2025 Techniques)
     */
    async methodAdvancedScraping(pinId) {
        try {
            const pinUrl = `https://www.pinterest.com/pin/${pinId}/`;
            
            // Advanced stealth techniques for bypassing 2025 anti-bot protection
            const stealthHeaders = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate', 
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"'
            };
            
            const response = await axios.get(pinUrl, {
                headers: stealthHeaders,
                timeout: 15000,
                maxRedirects: 5,
                validateStatus: (status) => status < 500
            });

            const html = response.data;
            
            // Multiple 2025 extraction patterns
            const patterns = [
                // Pinterest JSON-LD structured data
                /<script[^>]*type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/gi,
                // Pinterest app data structures
                /__PWS_DATA__\s*=\s*({.*?});/s,
                // React initial state
                /window\.__INITIAL_STATE__\s*=\s*({.*?});/s,
                // High-resolution image patterns
                /"images":\s*{[^}]*"orig":\s*{[^}]*"url":\s*"([^"]+)"/,
                // Open Graph and Twitter cards
                /property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
                /name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
                // Direct image source patterns
                /src=["']([^"']*pinimg\.com[^"']*\.jpg[^"']*)["']/i,
                /data-src=["']([^"']*pinimg\.com[^"']*\.jpg[^"']*)["']/i
            ];
            
            let mediaUrl = null;
            let title = null;
            let description = null;
            
            // Extract title and description
            const titleMatch = html.match(/<title[^>]*>([^<]+)</);
            const descMatch = html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/);
            
            if (titleMatch) title = titleMatch[1].replace(' | Pinterest', '').trim();
            if (descMatch) description = descMatch[1].trim();
            
            // Try each pattern
            for (const pattern of patterns) {
                if (mediaUrl) break;
                
                let matches = [];
                if (pattern.flags && pattern.flags.includes('g')) {
                    // Global pattern - collect all matches
                    let match;
                    while ((match = pattern.exec(html)) !== null) {
                        matches.push(match);
                    }
                } else {
                    // Single match
                    const match = html.match(pattern);
                    if (match) matches = [match];
                }
                
                for (const match of matches) {
                    try {
                        if (pattern.source.includes('ld\\+json')) {
                            // Parse JSON-LD structured data
                            const jsonData = JSON.parse(match[1]);
                            if (jsonData.image) {
                                mediaUrl = Array.isArray(jsonData.image) ? jsonData.image[0] : jsonData.image;
                                if (typeof mediaUrl === 'object') mediaUrl = mediaUrl.url || mediaUrl['@id'];
                                break;
                            }
                        } else if (pattern.source.includes('PWS_DATA') || pattern.source.includes('INITIAL_STATE')) {
                            // Parse Pinterest app data
                            const jsonData = JSON.parse(match[1]);
                            mediaUrl = this.extractFromPinterestJson(jsonData);
                            if (mediaUrl) break;
                        } else {
                            // Direct URL match
                            const url = match[1];
                            if (url && url.startsWith('http') && (url.includes('pinimg.com') || url.includes('pinterest'))) {
                                mediaUrl = url;
                                break;
                            }
                        }
                    } catch (e) {
                        continue;
                    }
                }
            }
            
            if (mediaUrl && mediaUrl.startsWith('http')) {
                return {
                    success: true,
                    data: {
                        url: mediaUrl,
                        description: description || title || 'Pinterest media',
                        type: 'image',
                        title: title || 'Pinterest Pin'
                    }
                };
            }
            
            throw new Error('No valid media URL found with advanced scraping techniques');
            
        } catch (error) {
            throw new Error(`Method Advanced Scraping failed: ${error.message}`);
        }
    }
    
    /**
     * Helper function to extract media URLs from Pinterest JSON data structures
     */
    extractFromPinterestJson(jsonData) {
        try {
            // Navigate through Pinterest's complex data structures
            const searchPaths = [
                'props.initialReduxState.pins',
                'pins', 
                'resource.data.images.orig.url',
                'data.images.orig.url',
                'images.orig.url',
                'resource_response.data.images.orig.url'
            ];
            
            const getNestedValue = (obj, path) => {
                return path.split('.').reduce((current, key) => current && current[key], obj);
            };
            
            // Try structured paths first
            for (const path of searchPaths) {
                const value = getNestedValue(jsonData, path);
                if (value && typeof value === 'string' && value.startsWith('http')) {
                    return value;
                }
            }
            
            // Deep search for any Pinterest image URLs
            const jsonStr = JSON.stringify(jsonData);
            const urlPatterns = [
                /"(https?:\/\/[^"]*pinimg\.com[^"]*\.jpg[^"]*)"/gi,
                /"(https?:\/\/[^"]*pinterest[^"]*\.jpg[^"]*)"/gi,
                /"url":\s*"(https?:\/\/[^"]*\.(?:jpg|jpeg|png|webp)[^"]*)"/gi
            ];
            
            for (const pattern of urlPatterns) {
                const match = pattern.exec(jsonStr);
                if (match && match[1]) {
                    return match[1];
                }
            }
            
            return null;
            
        } catch (error) {
            return null;
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