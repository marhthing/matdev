/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and shorts using Y2mate
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and shorts downloader with multiple service fallbacks';
        this.version = '2.0.0';

        // Rate limiting and safety
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
        ];

        // Request queue for rate limiting
        this.requestQueue = [];
        this.processing = false;
        this.maxRequestsPerMinute = 8;
        this.requestTimes = [];

        // Multiple service endpoints for fallback support
        this.downloadServices = {
            y2mate: {
                name: 'Y2mate',
                analyzeEndpoints: [
                    'https://www.y2mate.com/mates/analyzeV2/ajax',
                    'https://www.y2mate.com/mates/en68/analyze/ajax'
                ],
                convertEndpoints: [
                    'https://www.y2mate.com/mates/convertV2/index',
                    'https://www.y2mate.com/mates/en68/convert'
                ]
            },
            ninexconvert: {
                name: '9Convert',
                endpoints: [
                    'https://9convert.com/api/ajaxSearch/index',
                    'https://9convert.com/api/ajaxConvert/index'
                ]
            },
            savefrom: {
                name: 'SaveFrom',
                endpoints: [
                    'https://worker.sf-tools.com/youtube',
                    'https://api.savefrom.net/info'
                ]
            },
            ytmp3: {
                name: 'YTMP3',
                endpoints: [
                    'https://ytmp3.nu/api/convert',
                    'https://www.ytmp3.cc/api/convert'
                ]
            },
            ytdl: {
                name: 'YTDL',
                endpoints: [
                    'https://ytdl.org/api/convert',
                    'https://www.ytdl.org/download'
                ]
            },
            ytshorts: {
                name: 'YTShorts',
                endpoints: [
                    'https://ytshorts.savetube.me/api/v1/temat',
                    'https://api.vevioz.com/api/button/mp4/720'
                ]
            },
            downloadyt: {
                name: 'DownloadYT',
                endpoints: [
                    'https://api.downloadyt.com/file/download',
                    'https://www.downloadyt.com/api/widgetv2'
                ]
            }
        };
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupSafetyMeasures();
        console.log('✅ YouTube plugin loaded with multi-service fallback support');
    }

    /**
     * Setup safety measures and configurations
     */
    setupSafetyMeasures() {
        // Start cleanup interval
        setInterval(() => this.cleanupOldRequests(), 60000); // Every minute
        setInterval(() => this.cleanupTempFiles(), 300000); // Every 5 minutes
    }

    /**
     * Get random user agent
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Add human-like delays between requests
     */
    async addHumanDelay() {
        const delay = Math.random() * 3000 + 2000; // 2-5 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Generate more realistic browser headers
     */
    getRealisticHeaders(referer = 'https://www.google.com/') {
        const userAgent = this.getRandomUserAgent();
        return {
            'User-Agent': userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'cross-site',
            'Referer': referer,
            'Cache-Control': 'max-age=0'
        };
    }

    /**
     * Check rate limits
     */
    isRateLimited() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
        return this.requestTimes.length >= this.maxRequestsPerMinute;
    }

    /**
     * Track request
     */
    trackRequest() {
        this.requestTimes.push(Date.now());
        this.requestCount++;
    }

    /**
     * Clean up old request times
     */
    cleanupOldRequests() {
        const oneMinuteAgo = Date.now() - 60000;
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
    }

    /**
     * Register YouTube commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('ytv', this.downloadYouTube.bind(this), {
            description: 'Download YouTube video or short',
            usage: `${config.PREFIX}ytv <url>`,
            category: 'media',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        this.bot.messageHandler.registerCommand('yts', this.searchYouTube.bind(this), {
            description: 'Search YouTube videos',
            usage: `${config.PREFIX}yts <search term>`,
            category: 'media',
            plugin: 'youtube',
            source: 'youtube.js'
        });
    }

    /**
     * Extract video info using multiple services with fallback
     */
    async getVideoInfoFromServices(url) {
        const userAgent = this.getRandomUserAgent();

        // Try each service in order
        for (const [serviceKey, service] of Object.entries(this.downloadServices)) {
            try {
                console.log(`Trying ${service.name} service...`);
                
                if (serviceKey === 'y2mate') {
                    return await this.tryY2mate(url, userAgent);
                } else if (serviceKey === 'ninexconvert') {
                    return await this.try9Convert(url, userAgent);
                } else if (serviceKey === 'savefrom') {
                    return await this.trySaveFrom(url, userAgent);
                } else if (serviceKey === 'ytmp3') {
                    return await this.tryYTMP3(url, userAgent);
                } else if (serviceKey === 'ytdl') {
                    return await this.tryYTDL(url, userAgent);
                } else if (serviceKey === 'ytshorts') {
                    return await this.tryYTShorts(url, userAgent);
                } else if (serviceKey === 'downloadyt') {
                    return await this.tryDownloadYT(url, userAgent);
                }
            } catch (error) {
                console.log(`${service.name} service failed:`, error.message);
                continue;
            }
        }

        throw new Error('All download services failed');
    }

    /**
     * Try Y2mate service
     */
    async tryY2mate(url, userAgent) {
        const service = this.downloadServices.y2mate;
        
        for (const endpoint of service.analyzeEndpoints) {
            try {
                // First, visit the main page to get cookies/session
                await axios.get('https://www.y2mate.com/en68', {
                    headers: this.getRealisticHeaders(),
                    timeout: 15000
                });

                await this.addHumanDelay();

                const payload = new URLSearchParams({
                    k_query: url,
                    k_page: 'home',
                    hl: 'en',
                    q_auto: 0
                });

                const analyzeResponse = await axios.post(endpoint, payload.toString(), {
                    headers: {
                        ...this.getRealisticHeaders('https://www.y2mate.com/en68'),
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json, text/javascript, */*; q=0.01'
                    },
                    timeout: 20000
                });

                console.log(`Y2mate analyze response:`, analyzeResponse.data);

                if (analyzeResponse.data && analyzeResponse.data.status === 'ok') {
                    analyzeResponse.data.service = 'y2mate';
                    
                    // Ensure we have video ID for conversion
                    if (!analyzeResponse.data.vid && analyzeResponse.data.id) {
                        analyzeResponse.data.vid = analyzeResponse.data.id;
                    }
                    
                    return analyzeResponse.data;
                }
            } catch (error) {
                console.log(`Y2mate analyze endpoint ${endpoint} failed:`, error.message);
                continue;
            }
        }
        throw new Error('Y2mate failed');
    }

    /**
     * Try 9Convert service
     */
    async try9Convert(url, userAgent) {
        try {
            // Visit main page first
            await axios.get('https://9convert.com/', {
                headers: this.getRealisticHeaders(),
                timeout: 15000
            });

            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            const payload = new URLSearchParams({
                q: url,
                vt: 'home'
            });

            const response = await axios.post('https://9convert.com/api/ajaxSearch/index', payload.toString(), {
                headers: {
                    ...this.getRealisticHeaders('https://9convert.com/'),
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                timeout: 15000
            });

            console.log('9Convert response:', response.data);

            if (response.data && response.data.status === 'ok') {
                response.data.service = '9convert';
                return response.data;
            }
        } catch (error) {
            console.log('9Convert error:', error.message);
            throw new Error('9Convert failed');
        }
    }

    /**
     * Try SaveFrom service
     */
    async trySaveFrom(url, userAgent) {
        try {
            const response = await axios.get(`https://worker.sf-tools.com/youtube?url=${encodeURIComponent(url)}`, {
                headers: {
                    'User-Agent': userAgent,
                    'Referer': 'https://savefrom.net/'
                },
                timeout: 15000
            });

            if (response.data && response.data.url) {
                const videoInfo = {
                    service: 'savefrom',
                    title: response.data.title || 'YouTube Video',
                    t: response.data.duration || 0,
                    links: {
                        mp4: {}
                    },
                    downloadUrl: response.data.url
                };

                // Parse quality from response
                if (response.data.quality) {
                    videoInfo.links.mp4[response.data.quality] = {
                        f: 'mp4',
                        q: response.data.quality
                    };
                }

                return videoInfo;
            }
        } catch (error) {
            throw new Error('SaveFrom failed');
        }
    }

    /**
     * Try YTMP3 service
     */
    async tryYTMP3(url, userAgent) {
        try {
            const response = await axios.post('https://ytmp3.nu/api/convert', {
                url: url,
                format: 'mp4'
            }, {
                headers: {
                    'User-Agent': userAgent,
                    'Content-Type': 'application/json',
                    'Origin': 'https://ytmp3.nu'
                },
                timeout: 15000
            });

            if (response.data && response.data.success) {
                const videoInfo = {
                    service: 'ytmp3',
                    title: response.data.title || 'YouTube Video',
                    t: response.data.duration || 0,
                    links: {
                        mp4: {
                            '360': { f: 'mp4', q: '360' }
                        }
                    },
                    downloadUrl: response.data.download_url
                };

                return videoInfo;
            }
        } catch (error) {
            throw new Error('YTMP3 failed');
        }
    }

    /**
     * Try YTDL service
     */
    async tryYTDL(url, userAgent) {
        try {
            const response = await axios.post('https://ytdl.org/api/convert', {
                url: url,
                quality: 'auto'
            }, {
                headers: {
                    'User-Agent': userAgent,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (response.data && response.data.status === 'success') {
                const videoInfo = {
                    service: 'ytdl',
                    title: response.data.title || 'YouTube Video',
                    t: response.data.duration || 0,
                    links: {
                        mp4: {
                            '480': { f: 'mp4', q: '480' }
                        }
                    },
                    downloadUrl: response.data.url
                };

                return videoInfo;
            }
        } catch (error) {
            throw new Error('YTDL failed');
        }
    }

    /**
     * Try YTShorts service
     */
    async tryYTShorts(url, userAgent) {
        try {
            const response = await axios.post('https://ytshorts.savetube.me/api/v1/temat', {
                url: url
            }, {
                headers: {
                    ...this.getRealisticHeaders('https://ytshorts.savetube.me/'),
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (response.data && response.data.data && response.data.data.video_url) {
                const videoInfo = {
                    service: 'ytshorts',
                    title: response.data.data.title || 'YouTube Video',
                    t: response.data.data.duration || 0,
                    links: {
                        mp4: {
                            '720': { f: 'mp4', q: '720' }
                        }
                    },
                    downloadUrl: response.data.data.video_url
                };

                return videoInfo;
            }
        } catch (error) {
            throw new Error('YTShorts failed');
        }
    }

    /**
     * Try DownloadYT service
     */
    async tryDownloadYT(url, userAgent) {
        try {
            const response = await axios.post('https://www.downloadyt.com/api/widgetv2', {
                url: url
            }, {
                headers: {
                    ...this.getRealisticHeaders('https://www.downloadyt.com/'),
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            if (response.data && response.data.success && response.data.download_url) {
                const videoInfo = {
                    service: 'downloadyt',
                    title: response.data.title || 'YouTube Video',
                    t: response.data.duration || 0,
                    links: {
                        mp4: {
                            '360': { f: 'mp4', q: '360' }
                        }
                    },
                    downloadUrl: response.data.download_url
                };

                return videoInfo;
            }
        } catch (error) {
            throw new Error('DownloadYT failed');
        }
    }

    /**
     * Get download link using the appropriate service
     */
    async getDownloadLinkFromService(videoInfo, videoFormat) {
        const userAgent = this.getRandomUserAgent();

        // If direct download URL is available, return it
        if (videoInfo.downloadUrl) {
            return videoInfo.downloadUrl;
        }

        // Handle Y2mate specifically
        if (videoInfo.service === 'y2mate') {
            const service = this.downloadServices.y2mate;
            let lastError = null;
            
            for (const endpoint of service.convertEndpoints) {
                try {
                    // Add delay between attempts
                    if (lastError) {
                        await this.addHumanDelay();
                    }

                    // Prepare the conversion payload
                    const payload = new URLSearchParams({
                        vid: videoInfo.vid,
                        k: videoFormat.k || (videoFormat.f + videoFormat.q)
                    });

                    const convertResponse = await axios.post(endpoint, payload.toString(), {
                        headers: {
                            'User-Agent': userAgent,
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Origin': 'https://www.y2mate.com',
                            'Referer': 'https://www.y2mate.com/en68',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Accept': 'application/json, text/javascript, */*; q=0.01',
                            'Accept-Language': 'en-US,en;q=0.9'
                        },
                        timeout: 25000
                    });

                    console.log(`Y2mate convert response:`, convertResponse.data);

                    if (convertResponse.data && convertResponse.data.status === 'ok' && convertResponse.data.dlink) {
                        return convertResponse.data.dlink;
                    } else if (convertResponse.data && convertResponse.data.c_status === 'FAILED') {
                        lastError = new Error(`Y2mate conversion failed: ${convertResponse.data.mess || 'Unknown error'}`);
                        console.log(`Y2mate conversion failed:`, convertResponse.data.mess);
                    }
                } catch (error) {
                    lastError = error;
                    console.log(`Y2mate convert endpoint ${endpoint} failed:`, error.message);
                    continue;
                }
            }
            
            if (lastError) {
                throw lastError;
            }
        }

        // Handle 9Convert
        if (videoInfo.service === '9convert') {
            try {
                const payload = new URLSearchParams({
                    vid: videoInfo.vid,
                    k: videoFormat.k || (videoFormat.f + videoFormat.q)
                });

                const convertResponse = await axios.post('https://9convert.com/api/ajaxConvert/index', payload.toString(), {
                    headers: {
                        'User-Agent': userAgent,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://9convert.com',
                        'Referer': 'https://9convert.com/',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 25000
                });

                if (convertResponse.data && convertResponse.data.status === 'ok' && convertResponse.data.dlink) {
                    return convertResponse.data.dlink;
                }
            } catch (error) {
                console.log('9Convert conversion failed:', error.message);
                throw error;
            }
        }

        // If no conversion needed, try to extract direct link from video info
        if (videoInfo.links && videoInfo.links.mp4) {
            const qualities = Object.keys(videoInfo.links.mp4);
            for (const quality of qualities) {
                const format = videoInfo.links.mp4[quality];
                if (format.url) {
                    return format.url;
                }
            }
        }

        throw new Error(`Failed to get download link from ${videoInfo.service || 'unknown'} service`);
    }

    /**
     * Download YouTube video using Y2mate
     */
    async downloadYouTube(messageInfo) {
        let tempFile;
        try {
            // Check rate limiting
            if (this.isRateLimited()) {
                await this.bot.messageHandler.reply(messageInfo, '⏰ Too many requests. Please wait a moment before trying again.');
                return;
            }

            const { args } = messageInfo;
            let url = null;

            // Check for quoted/tagged message first
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage) {
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

                const urlRegex = /https?:\/\/[^\s]+/g;
                const urls = quotedText.match(urlRegex) || [];
                const youtubeUrl = urls.find(u => this.isValidYouTubeUrl(u));

                if (youtubeUrl) {
                    url = youtubeUrl;
                }
            }

            if (!url && args && args.length > 0) {
                url = args[0];
            }

            if (!url) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a YouTube URL or reply to a message containing one\n\nUsage: ${config.PREFIX}ytv <url>\nOr reply to a message: ${config.PREFIX}ytv\n\nExample: ${config.PREFIX}ytv https://youtu.be/dQw4w9WgXcQ`);
                return;
            }

            if (!this.isValidYouTubeUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid YouTube URL. Please provide a valid YouTube video link.');
                return;
            }

            this.trackRequest();
            await this.addHumanDelay();

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing YouTube video...\n⏳ Trying multiple services...');

            try {
                // Get video info from multiple services with fallback
                const videoInfo = await this.getVideoInfoFromServices(url);

                if (!videoInfo.links || !videoInfo.links.mp4) {
                    throw new Error('No MP4 formats available');
                }

                const title = videoInfo.title || 'YouTube Video';
                const duration = parseInt(videoInfo.t || 0);

                // Check video length (limit to 10 minutes)
                if (duration > 600) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Video is too long (${this.formatDuration(duration)}). Please use videos shorter than 10 minutes.`);
                    return;
                }

                // Find best quality (prefer 720p, fallback to lower)
                const qualities = Object.keys(videoInfo.links.mp4);
                const preferredQuality = qualities.includes('720') ? '720' : 
                                       qualities.includes('480') ? '480' : 
                                       qualities.includes('360') ? '360' : 
                                       qualities[0];

                const videoFormat = videoInfo.links.mp4[preferredQuality];

                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🔄 Downloading video...\n📹 *${title}*\n📊 *Quality:* ${preferredQuality}p\n⏱️ *Duration:* ${this.formatDuration(duration)}\n🔧 *Service:* ${videoInfo.service || 'Unknown'}\n⏳ Getting download link...`,
                    quoted: processingMsg
                });

                // Get download link with fallback retry
                let downloadLink = null;
                try {
                    downloadLink = await this.getDownloadLinkFromService(videoInfo, videoFormat);
                } catch (linkError) {
                    console.log(`Failed to get download link from ${videoInfo.service}:`, linkError.message);
                    
                    // If the primary service fails, try other services
                    console.log('Retrying with other services...');
                    const otherServices = Object.keys(this.downloadServices).filter(key => key !== videoInfo.service);
                    
                    for (const serviceKey of otherServices) {
                        try {
                            console.log(`Trying ${this.downloadServices[serviceKey].name} as fallback...`);
                            
                            let methodName;
                            switch (serviceKey) {
                                case 'ninexconvert':
                                    methodName = 'try9Convert';
                                    break;
                                case 'savefrom':
                                    methodName = 'trySaveFrom';
                                    break;
                                case 'ytmp3':
                                    methodName = 'tryYTMP3';
                                    break;
                                case 'ytdl':
                                    methodName = 'tryYTDL';
                                    break;
                                case 'y2mate':
                                    methodName = 'tryY2mate';
                                    break;
                                case 'ytshorts':
                                    methodName = 'tryYTShorts';
                                    break;
                                case 'downloadyt':
                                    methodName = 'tryDownloadYT';
                                    break;
                                default:
                                    console.log(`Unknown service: ${serviceKey}`);
                                    continue;
                            }
                            
                            const fallbackVideoInfo = await this[methodName](url, this.getRandomUserAgent());
                            
                            if (fallbackVideoInfo) {
                                downloadLink = await this.getDownloadLinkFromService(fallbackVideoInfo, videoFormat);
                                if (downloadLink) {
                                    console.log(`Successfully got download link from ${this.downloadServices[serviceKey].name}`);
                                    break;
                                }
                            }
                        } catch (fallbackError) {
                            console.log(`Fallback service ${this.downloadServices[serviceKey].name} failed:`, fallbackError.message);
                            continue;
                        }
                    }
                }

                if (!downloadLink) {
                    throw new Error('Failed to get download link from all services');
                }

                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🔄 Downloading video file...\n📹 *${title}*\n⏳ Please wait while we download the video...`,
                    quoted: processingMsg
                });

                // Download the video file
                const response = await axios.get(downloadLink, {
                    responseType: 'arraybuffer',
                    timeout: 300000, // 5 minutes timeout
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Referer': 'https://www.y2mate.com/'
                    },
                    maxContentLength: 100 * 1024 * 1024 // 100MB limit
                });

                if (!response.data) {
                    throw new Error('Failed to download video file');
                }

                const videoBuffer = Buffer.from(response.data);

                // Check file size
                if (videoBuffer.length > 100 * 1024 * 1024) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Video file is too large (>100MB). Please use a shorter video.');
                    return;
                }

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    fileName: `${title.replace(/[^\w\s]/gi, '')}.mp4`,
                    caption: `📹 *${title}*\n⏱️ *Duration:* ${this.formatDuration(duration)}\n📊 *Quality:* ${preferredQuality}p\n🔧 *Service:* ${videoInfo.service || 'Unknown'}\n🤖 *Downloaded by:* ${config.BOT_NAME}`
                });

                // Delete processing message
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, { delete: processingMsg.key });
                } catch (e) {
                    // Ignore delete errors
                }

            } catch (downloadError) {
                console.error('Download service error:', downloadError);

                let errorMessage = '❌ Failed to download YouTube video from all available services.';

                if (downloadError.message?.includes('timeout')) {
                    errorMessage = '❌ Download timeout. The video may be too large or connection is slow.';
                } else if (downloadError.message?.includes('unavailable')) {
                    errorMessage = '❌ This video is not available for download (may be private or restricted).';
                } else if (downloadError.message?.includes('format')) {
                    errorMessage = '❌ No compatible video format found for this video.';
                }

                await this.bot.messageHandler.reply(messageInfo, errorMessage);
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the YouTube video. Please try again later.');
        } finally {
            if (tempFile) {
                await fs.unlink(tempFile).catch(() => {});
            }
        }
    }

    /**
     * Search YouTube videos using simple search
     */
    async searchYouTube(messageInfo) {
        try {
            if (this.isRateLimited()) {
                await this.bot.messageHandler.reply(messageInfo, '⏰ Too many requests. Please wait a moment before trying again.');
                return;
            }

            const { args } = messageInfo;

            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide search terms\n\nUsage: ${config.PREFIX}yts <search term>\n\nExample: ${config.PREFIX}yts funny cats`);
                return;
            }

            const searchQuery = args.join(' ');
            this.trackRequest();

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching YouTube...');

            try {
                // Use YouTube search URL (no API needed for basic search)
                const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

                const response = await axios.get(searchUrl, {
                    headers: {
                        'User-Agent': this.getRandomUserAgent()
                    },
                    timeout: 15000
                });

                // Extract video IDs and titles using regex (basic parsing)
                const videoMatches = response.data.match(/"videoId":"([^"]+)","title":{"runs":\[{"text":"([^"]+)"/g);

                if (!videoMatches || videoMatches.length === 0) {
                    throw new Error('No search results found');
                }

                let resultText = `🔍 *YouTube Search Results*\n\nQuery: *${searchQuery}*\n\n`;

                const results = videoMatches.slice(0, 5).map((match, index) => {
                    const videoIdMatch = match.match(/"videoId":"([^"]+)"/);
                    const titleMatch = match.match(/"text":"([^"]+)"/);

                    if (videoIdMatch && titleMatch) {
                        const videoId = videoIdMatch[1];
                        const title = titleMatch[1].replace(/\\u0026/g, '&');
                        const url = `https://youtu.be/${videoId}`;

                        resultText += `${index + 1}. *${title}*\n`;
                        resultText += `🔗 ${url}\n\n`;
                    }
                });

                resultText += `💡 *Tip:* Use \`${config.PREFIX}ytv <url>\` to download any of these videos.`;

                await this.bot.messageHandler.reply(messageInfo, resultText);

            } catch (searchError) {
                console.error('YouTube search error:', searchError);
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to search YouTube. Please try again later.');
            }

        } catch (error) {
            console.error('Error in YouTube search command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while searching YouTube. Please try again later.');
        }
    }

    /**
     * Validate YouTube URL
     */
    isValidYouTubeUrl(url) {
        const youtubePatterns = [
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=[\w-]+/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/,
            /(?:https?:\/\/)?youtu\.be\/[\w-]+/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[\w-]+/,
            /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?v=[\w-]+/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/[\w-]+/
        ];

        return youtubePatterns.some(pattern => pattern.test(url));
    }

    /**
     * Format duration from seconds to MM:SS
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Format large numbers
     */
    formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    /**
     * Get plugin statistics
     */
    getStats() {
        return {
            totalRequests: this.requestCount,
            recentRequests: this.requestTimes.length,
            rateLimited: this.isRateLimited()
        };
    }

    /**
     * Clean up temp files
     */
    async cleanupTempFiles() {
        const tmpDir = path.join(__dirname, '..', 'tmp');
        try {
            const files = await fs.readdir(tmpDir);
            const videoFiles = files.filter(file => file.startsWith('video_'));

            for (const file of videoFiles) {
                const filePath = path.join(tmpDir, file);
                const stats = await fs.stat(filePath);

                // Delete files older than 1 hour
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    await fs.unlink(filePath).catch(() => {});
                }
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = new YouTubePlugin();