
/**
 * MATDEV Instagram Downloader Plugin v3.0.0
 * Advanced 2025 Instagram scraper with instagrapi-inspired methods
 * Bypasses robot detection using modern session-based approach
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

class InstagramPlugin {
    constructor() {
        this.name = 'instagram';
        this.description = 'Advanced Instagram scraper with 2025 instagrapi-inspired methods';
        this.version = '3.0.0';
        
        // Instagram URL regex patterns
        this.instagramRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|tv|stories)\/([A-Za-z0-9_-]+)\/?/i;
        this.maxFileSize = 50 * 1024 * 1024; // 50MB limit
        
        // Modern Instagram API endpoints (2025)
        this.apiEndpoints = {
            web: 'https://www.instagram.com/api/v1/',
            graphql: 'https://www.instagram.com/graphql/query/',
            mobile: 'https://i.instagram.com/api/v1/'
        };
        
        // Session management for bypass detection
        this.sessionData = {
            csrftoken: null,
            sessionid: null,
            cookies: null,
            userAgent: null,
            deviceId: null,
            appId: '936619743392459', // Instagram Web App ID
            wwwClaim: null
        };
        
        // Rate limiting
        this.lastRequestTime = 0;
        this.requestDelay = 2000; // 2 seconds between requests
    }

    /**
     * Initialize plugin with modern session setup
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        await this.initializeSession();
        console.log('✅ Instagram plugin v3.0.0 loaded with instagrapi-inspired 2025 methods');
        return this;
    }

    /**
     * Initialize session data for bypassing detection (instagrapi-inspired)
     */
    async initializeSession() {
        // Generate device ID and user agent for session consistency
        this.sessionData.deviceId = this.generateDeviceId();
        this.sessionData.userAgent = this.generateMobileUserAgent();
        
        try {
            // Initialize session by visiting Instagram homepage
            const response = await axios.get('https://www.instagram.com/', {
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

            // Extract CSRF token and www-claim from response
            const csrfMatch = response.data.match(/"csrf_token":"([^"]+)"/);
            if (csrfMatch) {
                this.sessionData.csrftoken = csrfMatch[1];
            }
            
            // Extract rollout hash for www-claim
            const rolloutMatch = response.data.match(/"rollout_hash":"([^"]+)"/);
            if (rolloutMatch) {
                this.sessionData.wwwClaim = rolloutMatch[1];
            }

            // Store session cookies
            if (response.headers['set-cookie']) {
                this.sessionData.cookies = response.headers['set-cookie']
                    .map(cookie => cookie.split(';')[0])
                    .join('; ');
            }

            console.log('🔐 Instagram session initialized with CSRF token');
        } catch (error) {
            console.log('⚠️ Session initialization failed, using anonymous mode');
        }
    }

    /**
     * Generate consistent device ID (instagrapi method)
     */
    generateDeviceId() {
        const seed = crypto.randomBytes(16).toString('hex');
        return `android-${seed.substring(0, 16)}`;
    }

    /**
     * Generate mobile user agent for Instagram app emulation
     */
    generateMobileUserAgent() {
        const versions = [
            'Instagram 309.1.0.41.113 Android (33/13; 420dpi; 1080x2340; samsung; SM-G991B; o1s; exynos2100; en_US; 556383094)',
            'Instagram 308.0.0.32.105 Android (32/12; 560dpi; 1440x3200; samsung; SM-G998B; t2s; exynos2100; en_US; 555555555)',
            'Instagram 307.0.0.34.111 Android (31/12; 480dpi; 1080x2400; OnePlus; CPH2399; OP515BL1; mt6893; en_US; 544444444)'
        ];
        return versions[Math.floor(Math.random() * versions.length)];
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
                
                const mediaData = await this.extractInstagramMedia(url, shortcode);

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
     * Generate unique filename for temporary files
     */
    generateUniqueFilename(type, index) {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        const ext = type === 'video' ? 'mp4' : 'jpg';
        return `instagram_${type}_${timestamp}_${random}_${index}.${ext}`;
    }





    /**
     * Validate media URL for security (strict host validation)
     */
    isValidMediaUrl(url) {
        if (!url || typeof url !== 'string') return false;
        
        try {
            const urlObj = new URL(url);
            
            // Reject localhost/internal IPs for security
            if (urlObj.hostname === 'localhost' || 
                urlObj.hostname.startsWith('192.168.') || 
                urlObj.hostname.startsWith('172.16.') || 
                urlObj.hostname.startsWith('10.') || 
                urlObj.hostname.startsWith('127.') ||
                urlObj.hostname.startsWith('169.254.') ||
                urlObj.hostname.startsWith('::1') ||
                urlObj.hostname.startsWith('fe80:')) {
                return false;
            }
            
            // Strict allowlist for Instagram/Facebook CDN domains only
            const allowedDomainSuffixes = [
                '.cdninstagram.com',
                '.fbcdn.net', 
                '.instagram.com'
            ];
            
            return urlObj.protocol === 'https:' && 
                   allowedDomainSuffixes.some(suffix => urlObj.hostname.endsWith(suffix));
        } catch {
            return false;
        }
    }

    /**
     * Modern Instagram media extraction (instagrapi-inspired 2025 method)
     */
    async extractInstagramMedia(url, shortcode) {
        await this.enforceRateLimit();
        
        try {
            console.log(`🔄 Extracting Instagram media using 2025 instagrapi-inspired method`);
            
            // Try mobile API first (most reliable)
            let result = await this.tryMobileAPI(shortcode);
            if (result && result.media && result.media.length > 0) {
                console.log(`✅ Mobile API success: Found ${result.media.length} media item(s)`);
                return result;
            }
            
            // Fallback to web scraping with session
            result = await this.tryWebScraping(shortcode);
            if (result && result.media && result.media.length > 0) {
                console.log(`✅ Web scraping success: Found ${result.media.length} media item(s)`);
                return result;
            }
            
            // Final fallback: anonymous GraphQL (limited but sometimes works)
            result = await this.tryAnonymousGraphQL(shortcode);
            if (result && result.media && result.media.length > 0) {
                console.log(`✅ Anonymous GraphQL success: Found ${result.media.length} media item(s)`);
                return result;
            }
            
            return null;
        } catch (error) {
            console.error('Instagram media extraction failed:', error.message);
            return null;
        }
    }

    /**
     * Enforce rate limiting to avoid detection
     */
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.requestDelay) {
            const waitTime = this.requestDelay - timeSinceLastRequest;
            console.log(`⏳ Rate limiting: waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    /**
     * Try mobile API endpoint (most reliable 2025 method)
     */
    async tryMobileAPI(shortcode) {
        try {
            // Modern Instagram web API headers with required IG headers
            const headers = {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'X-Requested-With': 'XMLHttpRequest',
                'X-IG-App-ID': this.sessionData.appId,
                'X-IG-Device-ID': this.sessionData.deviceId,
                'X-Instagram-AJAX': '1',
                'Connection': 'keep-alive',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            };

            // Add session data if available
            if (this.sessionData.cookies) {
                headers['Cookie'] = this.sessionData.cookies;
            }
            if (this.sessionData.csrftoken) {
                headers['X-CSRFToken'] = this.sessionData.csrftoken;
            }
            if (this.sessionData.wwwClaim) {
                headers['X-IG-WWW-Claim'] = this.sessionData.wwwClaim;
            }

            // Use web API endpoint with proper shortcode info endpoint
            const response = await axios.get(`${this.apiEndpoints.web}media/shortcode/${shortcode}/info/`, {
                headers,
                timeout: 15000
            });

            if (response.data && response.data.items && response.data.items.length > 0) {
                const item = response.data.items[0];
                const media = [];

                // Extract media based on type
                if (item.video_versions && item.video_versions.length > 0) {
                    // Video post
                    media.push({
                        type: 'video',
                        url: item.video_versions[0].url
                    });
                } else if (item.image_versions2 && item.image_versions2.candidates) {
                    // Image post
                    media.push({
                        type: 'image',
                        url: item.image_versions2.candidates[0].url
                    });
                }

                // Handle carousel posts
                if (item.carousel_media && item.carousel_media.length > 0) {
                    media.length = 0; // Clear single media
                    for (const carouselItem of item.carousel_media) {
                        if (carouselItem.video_versions && carouselItem.video_versions.length > 0) {
                            media.push({
                                type: 'video',
                                url: carouselItem.video_versions[0].url
                            });
                        } else if (carouselItem.image_versions2 && carouselItem.image_versions2.candidates) {
                            media.push({
                                type: 'image',
                                url: carouselItem.image_versions2.candidates[0].url
                            });
                        }
                    }
                }

                const validMedia = media.filter(m => this.isValidMediaUrl(m.url));
                if (validMedia.length > 0) {
                    return {
                        media: validMedia,
                        caption: item.caption?.text || ''
                    };
                }
            }
            
            return null;
        } catch (error) {
            console.log(`Mobile API failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Try web scraping with session (modern 2025 method)
     */
    async tryWebScraping(shortcode) {
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Cache-Control': 'max-age=0'
            };

            if (this.sessionData.cookies) {
                headers['Cookie'] = this.sessionData.cookies;
            }

            const response = await axios.get(`https://www.instagram.com/p/${shortcode}/`, {
                headers,
                timeout: 15000
            });

            const html = response.data;
            const media = [];

            // Modern Instagram approach: Extract from script tags containing JSON data
            // Method 1: Look for application/ld+json structured data
            const structuredDataMatches = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs);
            if (structuredDataMatches) {
                for (const match of structuredDataMatches) {
                    try {
                        const jsonContent = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
                        const jsonData = JSON.parse(jsonContent);
                        
                        if (jsonData['@type'] === 'ImageObject' && jsonData.contentUrl) {
                            media.push({
                                type: 'image',
                                url: jsonData.contentUrl
                            });
                        } else if (jsonData['@type'] === 'VideoObject' && jsonData.contentUrl) {
                            media.push({
                                type: 'video',
                                url: jsonData.contentUrl
                            });
                        }
                    } catch (parseError) {
                        continue; // Skip malformed JSON
                    }
                }
            }

            // Method 2: Modern script tag extraction (Instagram's current method)
            if (media.length === 0) {
                const scriptMatches = html.match(/<script[^>]*>window\.__additionalDataLoaded\('\/p\/[^']+',\s*({.+?})\);<\/script>/s);
                if (scriptMatches && scriptMatches[1]) {
                    try {
                        const postData = JSON.parse(scriptMatches[1]);
                        const graphqlData = postData?.graphql?.shortcode_media;
                        
                        if (graphqlData) {
                            this.extractMediaFromGraphQL(graphqlData, media);
                        }
                    } catch (parseError) {
                        console.log('Modern script extraction failed:', parseError.message);
                    }
                }
            }

            // Method 3: Fallback to React component props extraction
            if (media.length === 0) {
                const propsMatches = html.match(/window\.__additionalData\[[^\]]+\]\s*=\s*({.+?});/gs);
                if (propsMatches) {
                    for (const match of propsMatches) {
                        try {
                            const propsData = JSON.parse(match.split('=')[1].replace(/;$/, ''));
                            if (propsData?.graphql?.shortcode_media) {
                                this.extractMediaFromGraphQL(propsData.graphql.shortcode_media, media);
                            }
                        } catch (parseError) {
                            continue;
                        }
                    }
                }
            }

            // Method 4: Extract from meta property tags (basic fallback)
            if (media.length === 0) {
                const videoUrlMatch = html.match(/<meta property="og:video" content="([^"]+)"/);
                const imageUrlMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
                
                if (videoUrlMatch && videoUrlMatch[1]) {
                    media.push({
                        type: 'video',
                        url: videoUrlMatch[1]
                    });
                } else if (imageUrlMatch && imageUrlMatch[1]) {
                    media.push({
                        type: 'image',
                        url: imageUrlMatch[1]
                    });
                }
            }

            const validMedia = media.filter(m => this.isValidMediaUrl(m.url));
            if (validMedia.length > 0) {
                return { media: validMedia };
            }
            
            return null;
        } catch (error) {
            console.log(`Modern web scraping failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Extract media from Instagram GraphQL data structure
     */
    extractMediaFromGraphQL(graphqlData, media) {
        if (!graphqlData) return;

        // Single media
        if (graphqlData.is_video && graphqlData.video_url) {
            media.push({
                type: 'video',
                url: graphqlData.video_url
            });
        } else if (graphqlData.display_url) {
            media.push({
                type: 'image',
                url: graphqlData.display_url
            });
        }

        // Carousel posts
        if (graphqlData.edge_sidecar_to_children?.edges) {
            media.length = 0; // Clear single media for carousel
            for (const edge of graphqlData.edge_sidecar_to_children.edges) {
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

    /**
     * Try anonymous GraphQL (limited fallback)
     */
    async tryAnonymousGraphQL(shortcode) {
        try {
            const headers = {
                'User-Agent': this.sessionData.userAgent,
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.5',
                'X-Requested-With': 'XMLHttpRequest'
            };

            // Modern GraphQL query hash (updated for 2025)
            const queryHash = '9f8827793ef34641b2fb195d4d41151c';
            const variables = JSON.stringify({
                shortcode: shortcode,
                include_reel: true,
                include_suggested_users: false
            });

            const response = await axios.get(`${this.apiEndpoints.graphql}`, {
                params: {
                    query_hash: queryHash,
                    variables: variables
                },
                headers,
                timeout: 10000
            });

            const data = response.data?.data?.shortcode_media;
            if (data) {
                const media = [];
                
                // Single media
                if (data.is_video && data.video_url) {
                    media.push({ type: 'video', url: data.video_url });
                } else if (data.display_url) {
                    media.push({ type: 'image', url: data.display_url });
                }

                // Carousel
                if (data.edge_sidecar_to_children?.edges) {
                    media.length = 0;
                    data.edge_sidecar_to_children.edges.forEach(edge => {
                        const node = edge.node;
                        if (node.is_video && node.video_url) {
                            media.push({ type: 'video', url: node.video_url });
                        } else if (node.display_url) {
                            media.push({ type: 'image', url: node.display_url });
                        }
                    });
                }

                const validMedia = media.filter(m => this.isValidMediaUrl(m.url));
                if (validMedia.length > 0) {
                    return { media: validMedia };
                }
            }
            
            return null;
        } catch (error) {
            console.log(`Anonymous GraphQL failed: ${error.message}`);
            return null;
        }
    }

    /**
     * Download and send media
     */
    async downloadAndSendMedia(messageInfo, media, index, total) {
        const tempFile = path.join(__dirname, '..', 'tmp', this.generateUniqueFilename(media.type, index));
        
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
