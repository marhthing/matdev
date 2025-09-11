/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and audio using simple y2mate-dl API
 */

const y2mate = require('y2mate-dl');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const ytsr = require('ytsr');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and audio downloader using y2mate API';
        this.version = '3.0.0';
        
        // YouTube URL regex
        this.ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:watch\?.*(?:|\&)v=|embed|shorts\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ YouTube plugin loaded with y2mate-dl API');
        return this;
    }

    /**
     * Register YouTube commands
     */
    registerCommands() {
        // Video download command
        this.bot.messageHandler.registerCommand('ytv', this.downloadVideo.bind(this), {
            description: 'Download YouTube video',
            usage: `${config.PREFIX}ytv <url>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        // Audio download command  
        this.bot.messageHandler.registerCommand('yta', this.downloadAudio.bind(this), {
            description: 'Download YouTube audio',
            usage: `${config.PREFIX}yta <url or search term>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        // Search command
        this.bot.messageHandler.registerCommand('yts', this.searchYouTube.bind(this), {
            description: 'Search YouTube videos',
            usage: `${config.PREFIX}yts <search term>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });
    }

    /**
     * Download YouTube video
     */
    async downloadVideo(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message
            if (!url && messageInfo.quoted?.text) {
                url = messageInfo.quoted.text;
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a YouTube URL\n\nUsage: ${config.PREFIX}ytv <url>`);
            }

            // Handle quality selection (if user provides y2mate;quality;id format)
            if (url.startsWith('y2mate;')) {
                const [_, quality, videoId] = url.split(';');
                const downloadUrl = await y2mate.dl(videoId, 'video', quality);
                
                if (!downloadUrl) {
                    return await this.bot.messageHandler.reply(messageInfo, '❌ Failed to get download link');
                }

                return await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: { url: downloadUrl },
                    caption: `✅ Video downloaded in ${quality} quality`
                });
            }

            // Validate YouTube URL
            if (!this.ytIdRegex.test(url)) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }

            // Extract video ID
            const vidMatch = this.ytIdRegex.exec(url);
            if (!vidMatch) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Could not extract video ID from URL');
            }

            const videoId = vidMatch[1];
            
            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing video...');

            try {
                // Get video info using y2mate
                const videoInfo = await y2mate.get(videoId, 'video');
                
                if (typeof videoInfo === 'string') {
                    // Direct download URL returned
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        video: { url: videoInfo },
                        caption: '✅ Video'
                    });
                    
                    // Delete processing message
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: processingMsg.key
                    });
                    return;
                }

                const { title, video, thumbnail, time } = videoInfo;
                
                if (!video || Object.keys(video).length === 0) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No video formats available',
                        edit: processingMsg.key
                    });
                    return;
                }

                // Create quality selection buttons
                let qualityText = `🎬 *${title}*\n⏱️ Duration: ${time}\n\n📱 *Available Qualities:*\n\n`;
                let buttonIndex = 1;

                for (const [quality, info] of Object.entries(video)) {
                    const size = info.fileSizeH || info.size || 'Unknown size';
                    qualityText += `${buttonIndex}. ${quality} (${size})\n`;
                    buttonIndex++;
                }

                qualityText += `\n💡 Reply with quality number (1-${Object.keys(video).length})`;

                // Send thumbnail with quality options
                if (thumbnail) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        image: { url: thumbnail },
                        caption: qualityText,
                        edit: processingMsg.key
                    });
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: qualityText,
                        edit: processingMsg.key
                    });
                }

                // Store video info for quality selection
                this.bot.cache.set(`ytv_${messageInfo.chat_jid}_${messageInfo.from_jid}`, {
                    videoId,
                    video,
                    title
                }, 300); // 5 minutes cache

            } catch (error) {
                console.error('Y2mate API error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Failed to get video info. Please try again later.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('YouTube video download error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the video');
        }
    }

    /**
     * Download YouTube audio
     */
    async downloadAudio(messageInfo) {
        try {
            let input = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message
            if (!input && messageInfo.quoted?.text) {
                input = messageInfo.quoted.text;
            }
            
            if (!input) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a YouTube URL or search term\n\nUsage: ${config.PREFIX}yta <url or search>`);
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing audio...');

            let videoId;

            // Check if it's a URL or search term
            const urlMatch = this.ytIdRegex.exec(input);
            if (urlMatch) {
                videoId = urlMatch[1];
            } else {
                // Search for the video
                try {
                    const searchResults = await ytsr(input, { limit: 1 });
                    if (!searchResults.items.length) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: '❌ No videos found for your search',
                            edit: processingMsg.key
                        });
                        return;
                    }

                    const firstResult = searchResults.items[0];
                    const videoMatch = this.ytIdRegex.exec(firstResult.url);
                    if (!videoMatch) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: '❌ Could not extract video ID from search result',
                            edit: processingMsg.key
                        });
                        return;
                    }
                    videoId = videoMatch[1];
                } catch (searchError) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Search failed. Please provide a direct YouTube URL.',
                        edit: processingMsg.key
                    });
                    return;
                }
            }

            try {
                // Get audio using y2mate
                const audioInfo = await y2mate.get(videoId, 'audio');
                
                if (typeof audioInfo === 'string') {
                    // Direct download URL returned
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        audio: { url: audioInfo },
                        mimetype: 'audio/mpeg'
                    });
                    
                    // Delete processing message
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: processingMsg.key
                    });
                    return;
                }

                const { title, thumbnail } = audioInfo;
                
                // Download the audio
                const audioUrl = await y2mate.dl(videoId, 'audio');
                
                if (!audioUrl) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Failed to download audio',
                        edit: processingMsg.key
                    });
                    return;
                }

                // Send audio file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: { url: audioUrl },
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `${title}.mp3`
                });

                // Delete processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    delete: processingMsg.key
                });

                console.log('✅ Audio downloaded:', title);

            } catch (error) {
                console.error('Y2mate audio error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Failed to download audio. Please try again later.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('YouTube audio download error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the audio');
        }
    }

    /**
     * Search YouTube videos
     */
    async searchYouTube(messageInfo) {
        try {
            const query = messageInfo.args.join(' ').trim();
            
            if (!query) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a search term\n\nUsage: ${config.PREFIX}yts <search term>`);
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching...');

            try {
                const searchResults = await ytsr(query, { limit: 10 });
                
                if (!searchResults.items.length) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No videos found for your search',
                        edit: processingMsg.key
                    });
                    return;
                }

                let resultText = `🔍 *Search Results for "${query}":*\n\n`;
                
                searchResults.items.slice(0, 5).forEach((item, index) => {
                    const duration = item.duration || 'Live';
                    const views = item.views ? `${item.views} views` : 'No view count';
                    
                    resultText += `*${index + 1}.* ${item.title}\n`;
                    resultText += `👤 ${item.author?.name || 'Unknown'}\n`;
                    resultText += `⏱️ ${duration} | 👁️ ${views}\n`;
                    resultText += `🔗 ${item.url}\n\n`;
                });

                resultText += `💡 Use ${config.PREFIX}ytv <url> to download video\n`;
                resultText += `💡 Use ${config.PREFIX}yta <url> to download audio`;

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: resultText,
                    edit: processingMsg.key
                });

            } catch (error) {
                console.error('YouTube search error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Search failed. Please try again later.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('YouTube search error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while searching');
        }
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new YouTubePlugin();
        await plugin.init(bot);
        return plugin;
    }
};