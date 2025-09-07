/**
 * MATDEV TikTok Downloader Plugin
 * Download TikTok videos without watermark
 */

const TiktokDL = require('@tobyg74/tiktok-api-dl');
const config = require('../config');
const axios = require('axios');
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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0'
];

const REFERRERS = [
    'https://www.google.com/',
    'https://www.bing.com/',
    'https://duckduckgo.com/',
    'https://www.tiktok.com/',
    'https://t.co/',
    'https://www.facebook.com/',
    'https://www.twitter.com/'
];

const getRandomUserAgent = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
const getRandomReferrer = () => REFERRERS[Math.floor(Math.random() * REFERRERS.length)];

const humanDelay = (min = 1000, max = 3000) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
};

// Advanced anti-detection session generator
const generateTikTokSession = () => {
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const timestamp = Date.now();
    const userAgent = getRandomUserAgent();
    const referrer = getRandomReferrer();
    
    // Determine device type from user agent
    const isMobile = userAgent.includes('Mobile') || userAgent.includes('iPhone') || userAgent.includes('Android');
    const isIOS = userAgent.includes('iPhone') || userAgent.includes('iPad');
    
    return {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8,es;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Ch-Ua': isMobile ? '"Not_A Brand";v="8", "Chromium";v="120"' : '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
        'Sec-Ch-Ua-Platform': isIOS ? '"iOS"' : isMobile ? '"Android"' : '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Connection': 'keep-alive',
        'DNT': '1',
        'Referer': referrer,
        'X-Requested-With': isMobile ? 'com.zhiliaoapp.musically' : undefined,
        'X-Client-Version': '2.0.0',
        'X-Tt-Token': Math.random().toString(36).substring(2, 15)
    };
};

// Simulate realistic user behavior patterns
const simulateUserBehavior = async (type = 'normal') => {
    const patterns = {
        'quick': () => humanDelay(500, 1200),      // Quick check
        'normal': () => humanDelay(1500, 3000),   // Normal browsing
        'careful': () => humanDelay(2500, 4500),  // Careful reading
        'distracted': () => humanDelay(3000, 6000) // Multi-tasking user
    };
    
    const pattern = patterns[type] || patterns['normal'];
    await pattern();
    
    // Occasionally add extra pauses (simulating real user behavior)
    if (Math.random() < 0.3) {
        await humanDelay(1000, 2000);
    }
};

class TikTokPlugin {
    constructor() {
        this.name = 'tiktok';
        this.description = 'TikTok video downloader';
        this.version = '1.0.0';
        this.requestTracker = new Map(); // Track requests per user
        this.lastRequest = 0; // Global rate limiting
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ TikTok plugin loaded');
    }

    /**
     * Register TikTok commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('tiktok', this.downloadTikTok.bind(this), {
            description: 'Download TikTok video without watermark',
            usage: `${config.PREFIX}tiktok <url>`,
            category: 'media',
            plugin: 'tiktok',
            source: 'tiktok.js'
        });
    }

    /**
     * Download TikTok video command
     */
    async downloadTikTok(messageInfo) {
        try {
            // Rate limiting - prevent spam requests
            const userId = messageInfo.sender_jid;
            const now = Date.now();
            
            // Global rate limit - minimum 2 seconds between any requests
            const timeSinceLastRequest = now - this.lastRequest;
            if (timeSinceLastRequest < 2000) {
                await humanDelay(2000 - timeSinceLastRequest, 3000);
            }
            
            // Per-user rate limit - max 3 requests per minute
            if (!this.requestTracker.has(userId)) {
                this.requestTracker.set(userId, []);
            }
            
            const userRequests = this.requestTracker.get(userId);
            const recentRequests = userRequests.filter(time => now - time < 60000);
            
            if (recentRequests.length >= 3) {
                await this.bot.messageHandler.reply(messageInfo, '⏳ Please wait a moment before making another TikTok request. (Rate limit: 3 per minute)');
                return;
            }
            
            recentRequests.push(now);
            this.requestTracker.set(userId, recentRequests);
            this.lastRequest = now;
            
            // Human-like delay before processing
            await humanDelay(800, 1500);

            const { args } = messageInfo;
            let url = null;

            // Check for quoted/tagged message first
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (quotedMessage) {
                // Extract URL from quoted message
                let quotedText = '';
                
                if (quotedMessage.conversation) {
                    quotedText = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    quotedText = quotedMessage.extendedTextMessage.text;
                } else if (quotedMessage.imageMessage?.caption) {
                    quotedText = quotedMessage.imageMessage.caption;
                } else if (quotedMessage.videoMessage?.caption) {
                    quotedText = quotedMessage.videoMessage.caption;
                }
                
                // Look for TikTok URL in the quoted text
                const urlRegex = /https?:\/\/[^\s]+/g;
                const urls = quotedText.match(urlRegex) || [];
                const tiktokUrl = urls.find(u => this.isValidTikTokUrl(u));
                
                if (tiktokUrl) {
                    url = tiktokUrl;
                }
            }
            
            // If no URL from quoted message, check args
            if (!url && args && args.length > 0) {
                url = args[0];
            }
            
            // If still no URL, show usage
            if (!url) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a TikTok URL or reply to a message containing one\n\nUsage: ${config.PREFIX}tiktok <url>\nOr reply to a message: ${config.PREFIX}tiktok\n\nExample: ${config.PREFIX}tiktok https://vm.tiktok.com/ZMxxxxxl/`);
                return;
            }
            
            // Validate TikTok URL
            if (!this.isValidTikTokUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid TikTok URL. Please provide a valid TikTok video link.');
                return;
            }

            // Try multiple approaches to get TikTok video
            let videoUrl = null;
            
            // Method 1: Try @tobyg74/tiktok-api-dl with different versions
            const versions = ["v2", "v1", "v3"];
            
            for (const version of versions) {
                try {
                    // Simulate user behavior before API call
                    await simulateUserBehavior('normal');
                    
                    const result = await TiktokDL.Downloader(url, { version });
                    // console.log(`API ${version} result:`, JSON.stringify(result, null, 2));
                    
                    if (result && result.status === "success" && result.result) {
                        const videoData = result.result;
                        
                        // Try to get video URL from different possible locations
                        if (videoData.video && videoData.video.playAddr && videoData.video.playAddr.length > 0) {
                            videoUrl = videoData.video.playAddr[0];
                        } else if (videoData.video) {
                            videoUrl = videoData.video.noWatermark || videoData.video.watermark || videoData.video[0];
                        } else if (videoData.video_data) {
                            videoUrl = videoData.video_data.nwm_video_url_HQ || 
                                      videoData.video_data.nwm_video_url || 
                                      videoData.video_data.wm_video_url;
                        } else if (videoData.play) {
                            videoUrl = videoData.play;
                        } else if (videoData.download_urls && videoData.download_urls.length > 0) {
                            videoUrl = videoData.download_urls[0];
                        }
                        
                        if (videoUrl) {
                            // console.log(`Found video URL with ${version}:`, videoUrl);
                            break; // Found a working URL, exit loop
                        }
                    }
                } catch (versionError) {
                    // console.log(`Version ${version} failed:`, versionError.message);
                    continue;
                }
            }

            // Method 2: Try alternative free APIs
            if (!videoUrl) {
                const fallbackAPIs = [
                    {
                        name: 'SnapTik API',
                        endpoint: `https://snapinsta.app/api/ajaxSearch`,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        data: `q=${encodeURIComponent(url)}&t=media&lang=en`
                    },
                    {
                        name: 'SSSTik API',
                        endpoint: `https://ssstik.io/abc?url=dl`,
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        data: `id=${encodeURIComponent(url)}&locale=en&tt=Q2FuZHlMaW5r`
                    }
                ];

                for (const api of fallbackAPIs) {
                    try {
                        // Simulate careful user behavior before API attempts
                        await simulateUserBehavior('careful');
                        
                        const sessionHeaders = generateTikTokSession();
                        
                        const response = await axios({
                            method: api.method,
                            url: api.endpoint,
                            headers: {
                                ...sessionHeaders,
                                ...api.headers
                            },
                            data: api.data,
                            timeout: 20000, // Increased timeout
                            maxRedirects: 5,
                            validateStatus: (status) => status < 500 // Accept 4xx but not 5xx
                        });

                        // Try to extract video URL from response
                        if (response.data) {
                            const responseText = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
                            
                            // Look for video URLs in the response
                            const videoUrlPatterns = [
                                /https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi,
                                /https?:\/\/tikcdn\.io\/[^\s"'<>]+/gi,
                                /https?:\/\/[^\s"'<>]*tiktok[^\s"'<>]*\.mp4/gi
                            ];

                            for (const pattern of videoUrlPatterns) {
                                const matches = responseText.match(pattern);
                                if (matches && matches.length > 0) {
                                    videoUrl = matches[0];
                                    // console.log(`Found video URL with ${api.name}:`, videoUrl);
                                    break;
                                }
                            }

                            if (videoUrl) break;
                        }
                    } catch (apiError) {
                        // console.log(`${api.name} failed:`, apiError.message);
                        continue;
                    }
                }
            }

            // Method 3: Direct URL extraction from TikTok page
            if (!videoUrl) {
                try {
                    // Simulate distracted user behavior before direct scraping
                    await simulateUserBehavior('distracted');
                    
                    const sessionHeaders = generateTikTokSession();
                    
                    const response = await axios.get(url, {
                        headers: sessionHeaders,
                        timeout: 15000,
                        maxRedirects: 10,
                        validateStatus: (status) => status < 500,
                        // Add additional anti-detection measures
                        proxy: false,
                        decompress: true,
                        insecureHTTPParser: false
                    });
                    
                    // Look for video URLs in the page HTML
                    const html = response.data;
                    const videoUrlPattern = /"playAddr":"([^"]+)"/;
                    const match = html.match(videoUrlPattern);
                    
                    if (match && match[1]) {
                        videoUrl = match[1].replace(/\\u002F/g, '/');
                        // console.log('Found video URL from page scraping:', videoUrl);
                    }
                } catch (scrapingError) {
                    // console.log('Page scraping failed:', scrapingError.message);
                }
            }

            if (!videoUrl) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download TikTok video.');
                return;
            }

            // Create temporary file path
            const tempFile = path.join(__dirname, '..', 'tmp', `tiktok_${Date.now()}.mp4`);
            
            // Ensure tmp directory exists
            await fs.ensureDir(path.dirname(tempFile));

            // Simulate final user behavior before video download
            await simulateUserBehavior('normal');
            
            const downloadHeaders = generateTikTokSession();
            
            // Download the video to temporary file
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'stream',
                timeout: 90000, // Increased timeout for larger files
                headers: {
                    ...downloadHeaders,
                    'Referer': 'https://www.tiktok.com/',
                    'Accept': '*/*',
                    'Range': 'bytes=0-', // Support partial downloads
                    'Sec-Fetch-Dest': 'video',
                    'Sec-Fetch-Mode': 'no-cors',
                    'Sec-Fetch-Site': 'cross-site'
                },
                maxContentLength: 100 * 1024 * 1024, // 100MB limit
                maxBodyLength: 100 * 1024 * 1024
            });

            if (!videoResponse.data) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download TikTok video.');
                return;
            }

            // Write video to temp file
            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFile);
                videoResponse.data.pipe(writeStream);
                
                videoResponse.data.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
            });

            // Read video file as buffer
            const videoBuffer = await fs.readFile(tempFile);

            // Send video
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                video: videoBuffer,
                mimetype: 'video/mp4'
            });

            // Clean up temp file
            await fs.unlink(tempFile).catch(() => {});

        } catch (error) {
            console.error('Error in TikTok command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the TikTok video. Please try again.');
        }
    }

    /**
     * Validate TikTok URL
     */
    isValidTikTokUrl(url) {
        const tiktokPatterns = [
            /tiktok\.com\/@[\w.-]+\/video\/\d+/,
            /vm\.tiktok\.com\/[\w-]+/,
            /vt\.tiktok\.com\/[\w-]+/,
            /tiktok\.com\/t\/[\w-]+/,
            /tiktok\.com\/v\/\d+/
        ];
        
        return tiktokPatterns.some(pattern => pattern.test(url));
    }

    /**
     * Format large numbers
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
}

module.exports = new TikTokPlugin();