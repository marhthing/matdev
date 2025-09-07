/**
 * MATDEV TikTok Downloader Plugin
 * Download TikTok videos without watermark
 */

const TiktokDL = require('@tobyg74/tiktok-api-dl');
const config = require('../config');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class TikTokPlugin {
    constructor() {
        this.name = 'tiktok';
        this.description = 'TikTok video downloader';
        this.version = '1.0.0';
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
            const { args } = messageInfo;
            
            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a TikTok URL\n\nUsage: ${config.PREFIX}tiktok <url>\n\nExample: ${config.PREFIX}tiktok https://vm.tiktok.com/ZMxxxxxl/`);
                return;
            }

            const url = args[0];
            
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
                    // console.log(`Trying TikTok API version ${version}...`);
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
                        // console.log(`Trying ${api.name}...`);
                        const response = await axios({
                            method: api.method,
                            url: api.endpoint,
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                ...api.headers
                            },
                            data: api.data,
                            timeout: 15000
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
                    // console.log('Trying direct TikTok page scraping...');
                    const response = await axios.get(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        timeout: 10000
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

            // Download the video to temporary file
            const videoResponse = await axios.get(videoUrl, {
                responseType: 'stream',
                timeout: 60000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': 'https://www.tiktok.com/'
                }
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