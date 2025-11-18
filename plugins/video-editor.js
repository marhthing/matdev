
/**
 * MATDEV Video Editor Plugin
 * Professional video editing with trim, compress, merge, and advanced features
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const config = require('../config');

class VideoEditorPlugin {
    constructor() {
        this.name = 'video-editor';
        this.description = 'Professional video editing suite with advanced features';
        this.version = '2.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        console.log('✅ Video Editor plugin loaded');
    }

    registerCommands() {
        // Basic editing commands
        this.bot.messageHandler.registerCommand('trim', this.trimCommand.bind(this), {
            description: 'Trim video to specified duration',
            usage: `${config.PREFIX}trim <start> <duration> (reply to video)\nExample: ${config.PREFIX}trim 5 10 (start at 5s, duration 10s)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });


        this.bot.messageHandler.registerCommand('speed', this.speedCommand.bind(this), {
            description: 'Change video playback speed',
            usage: `${config.PREFIX}speed <factor> (reply to video)\nExample: ${config.PREFIX}speed 2 (2x faster), ${config.PREFIX}speed 0.5 (2x slower)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('reverse', this.reverseCommand.bind(this), {
            description: 'Reverse video playback',
            usage: `${config.PREFIX}reverse (reply to video)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        // Advanced editing commands
        this.bot.messageHandler.registerCommand('crop', this.cropCommand.bind(this), {
            description: 'Crop video to specified dimensions',
            usage: `${config.PREFIX}crop <width> <height> [x] [y] (reply to video)\nExample: ${config.PREFIX}crop 720 480 100 50`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('rotate', this.rotateCommand.bind(this), {
            description: 'Rotate video by specified degrees',
            usage: `${config.PREFIX}rotate <degrees> (reply to video)\nExample: ${config.PREFIX}rotate 90`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('scale', this.scaleCommand.bind(this), {
            description: 'Scale video to new resolution',
            usage: `${config.PREFIX}scale <width> <height> (reply to video)\nExample: ${config.PREFIX}scale 1280 720`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('fps', this.fpsCommand.bind(this), {
            description: 'Change video frame rate',
            usage: `${config.PREFIX}fps <framerate> (reply to video)\nExample: ${config.PREFIX}fps 30`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('extract', this.extractCommand.bind(this), {
            description: 'Extract frame at specific time as image',
            usage: `${config.PREFIX}extract <time> (reply to video)\nExample: ${config.PREFIX}extract 10 (extract frame at 10 seconds)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('loop', this.loopCommand.bind(this), {
            description: 'Loop video for specified number of times',
            usage: `${config.PREFIX}loop <count> (reply to video)\nExample: ${config.PREFIX}loop 3`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('cut', this.cutCommand.bind(this), {
            description: 'Cut out a section from video',
            usage: `${config.PREFIX}cut <start> <end> (reply to video)\nExample: ${config.PREFIX}cut 10 20 (remove 10s-20s)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('mute', this.muteCommand.bind(this), {
            description: 'Remove audio from video',
            usage: `${config.PREFIX}mute (reply to video)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });
    }

    async trimCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 2) {
            return;
        }

        const startTime = parseFloat(args[0]);
        const duration = parseFloat(args[1]);

        if (isNaN(startTime) || isNaN(duration) || startTime < 0 || duration <= 0) {
            return;
        }

        await this.processVideo(messageInfo, 'trim', { startTime, duration });
    }


    async speedCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 1) {
            return;
        }

        const speed = parseFloat(args[0]);

        if (isNaN(speed) || speed <= 0 || speed > 4) {
            return;
        }

        await this.processVideo(messageInfo, 'speed', { speed });
    }

    async reverseCommand(messageInfo) {
        await this.processVideo(messageInfo, 'reverse', {});
    }

    async cropCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 2) {
            return;
        }

        const width = parseInt(args[0]);
        const height = parseInt(args[1]);
        const x = parseInt(args[2]) || 0;
        const y = parseInt(args[3]) || 0;

        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            return;
        }

        await this.processVideo(messageInfo, 'crop', { width, height, x, y });
    }

    async rotateCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 1) {
            return;
        }

        const degrees = parseFloat(args[0]);
        if (isNaN(degrees)) {
            return;
        }

        await this.processVideo(messageInfo, 'rotate', { degrees });
    }

    async scaleCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 2) {
            return;
        }

        const width = parseInt(args[0]);
        const height = parseInt(args[1]);

        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            return;
        }

        await this.processVideo(messageInfo, 'scale', { width, height });
    }

    async fpsCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 1) {
            return;
        }

        const fps = parseFloat(args[0]);
        if (isNaN(fps) || fps <= 0 || fps > 120) {
            return;
        }

        await this.processVideo(messageInfo, 'fps', { fps });
    }

    async extractCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 1) {
            return;
        }

        const time = parseFloat(args[0]);
        if (isNaN(time) || time < 0) {
            return;
        }

        await this.processVideo(messageInfo, 'extract', { time });
    }

    async loopCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 1) {
            return;
        }

        const count = parseInt(args[0]);
        if (isNaN(count) || count <= 1 || count > 10) {
            return;
        }

        await this.processVideo(messageInfo, 'loop', { count });
    }

    async cutCommand(messageInfo) {
        const args = messageInfo.text.split(' ').slice(1);

        if (args.length < 2) {
            return;
        }

        const start = parseFloat(args[0]);
        const end = parseFloat(args[1]);

        if (isNaN(start) || isNaN(end) || start < 0 || end <= start) {
            return;
        }

        await this.processVideo(messageInfo, 'cut', { start, end });
    }

    async muteCommand(messageInfo) {
        await this.processVideo(messageInfo, 'mute', {});
    }

    async processVideo(messageInfo, operation, params) {
        let inputPath = null;
        let outputPath = null;

        try {
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.videoMessage) {
                return;
            }

            // Process silently without status messages

            // Download video
            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, 'videoMessage');

            if (!buffer) {
                return;
            }

            // Setup file paths
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `input_${timestamp}.mp4`);
            
            // Different output extensions for different operations
            const outputExt = operation === 'extract' ? '.jpg' : '.mp4';
            outputPath = path.join(process.cwd(), 'tmp', `edited_${operation}_${timestamp}${outputExt}`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Build FFmpeg command based on operation
            let command = this.buildFFmpegCommand(operation, params, inputPath, outputPath);

            // Execute FFmpeg command
            await new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg error:', error);
                        console.error('FFmpeg stderr:', stderr);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // Check if output file exists and has content
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output file is empty');
            }

            // Send processed media
            if (operation === 'extract') {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    image: { url: outputPath },
                    mimetype: 'image/jpeg',
                    caption: `EXTRACTED FRAME`,
                });
            } else {
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: { url: outputPath },
                    mimetype: 'video/mp4',
                    caption: `${operation.toUpperCase()}`,
                });
            }

        } catch (error) {
            console.error(`Video ${operation} error:`, error);
        } finally {
            // Cleanup
            try {
                if (inputPath) await fs.unlink(inputPath);
                if (outputPath) await fs.unlink(outputPath);
            } catch (cleanupError) {
                console.log('Cleanup error (non-critical):', cleanupError.message);
            }
        }
    }

    buildFFmpegCommand(operation, params, inputPath, outputPath) {
        switch (operation) {
            case 'trim':
                return `ffmpeg -i "${inputPath}" -ss ${params.startTime} -t ${params.duration} -c copy "${outputPath}"`;


            case 'speed':
                if (params.speed >= 1) {
                    const audioSpeed = 1 / params.speed;
                    return `ffmpeg -i "${inputPath}" -filter:v "setpts=${audioSpeed}*PTS" -filter:a "atempo=${params.speed}" "${outputPath}"`;
                } else {
                    return `ffmpeg -i "${inputPath}" -filter:v "setpts=${1/params.speed}*PTS" -filter:a "atempo=${params.speed}" "${outputPath}"`;
                }

            case 'reverse':
                return `ffmpeg -i "${inputPath}" -vf reverse -af areverse "${outputPath}"`;

            case 'crop':
                return `ffmpeg -i "${inputPath}" -filter:v "crop=${params.width}:${params.height}:${params.x}:${params.y}" -c:a copy "${outputPath}"`;

            case 'rotate':
                const radians = params.degrees * Math.PI / 180;
                return `ffmpeg -i "${inputPath}" -vf "rotate=${radians}" -c:a copy "${outputPath}"`;

            case 'scale':
                return `ffmpeg -i "${inputPath}" -vf "scale=${params.width}:${params.height}" -c:a copy "${outputPath}"`;

            case 'fps':
                return `ffmpeg -i "${inputPath}" -r ${params.fps} -c:v libx264 -c:a copy "${outputPath}"`;

            case 'extract':
                return `ffmpeg -i "${inputPath}" -ss ${params.time} -vframes 1 -f image2 "${outputPath}"`;

            case 'loop':
                return `ffmpeg -stream_loop ${params.count - 1} -i "${inputPath}" -c copy "${outputPath}"`;

            case 'cut':
                return `ffmpeg -i "${inputPath}" -vf "select='not(between(t,${params.start},${params.end}))',setpts=N/FRAME_RATE/TB" -af "aselect='not(between(t,${params.start},${params.end}))',asetpts=N/SR/TB" "${outputPath}"`;

            case 'mute':
                return `ffmpeg -i "${inputPath}" -c:v copy -an "${outputPath}"`;

            default:
                throw new Error(`Unknown operation: ${operation}`);
        }
    }

    async downloadMediaRobust(messageInfo, quoted, mediaType) {
        try {
            const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;

            if (!ctx || !ctx.stanzaId) {
                throw new Error('No quoted message context found');
            }

            const quotedKey = {
                id: ctx.stanzaId,
                remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                fromMe: ctx.participant ? (ctx.participant === this.bot.sock.user?.id) : false,
                participant: ctx.participant || undefined
            };

            const messageToDownload = {
                key: quotedKey,
                message: quoted
            };

            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            return { buffer };

        } catch (error) {
            console.error('Download failed:', error);
            return null;
        }
    }
}

const videoEditorPlugin = new VideoEditorPlugin();

module.exports = {
    init: videoEditorPlugin.init.bind(videoEditorPlugin),
    name: videoEditorPlugin.name,
    description: videoEditorPlugin.description,
    version: videoEditorPlugin.version
};
