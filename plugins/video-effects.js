const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

class VideoEffectsPlugin {
    constructor() {
        this.name = 'video-effects';
        this.description = 'Advanced video effects using 2025 FFmpeg techniques';
        this.version = '2.0.0';
        this.effects = {
            // Color grading effects - 2025 techniques
            vintage: {
                filter: 'eq=gamma=1.3:saturation=0.8:brightness=0.1:contrast=1.1,colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,noise=c0s=5:allf=t',
                description: 'Vintage film look with warm tones and grain',
                category: 'color'
            },
            sepia: {
                filter: 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131,eq=gamma=1.2:contrast=1.1',
                description: 'Classic sepia tone effect for timeless look',
                category: 'color'
            },
            cinematic: {
                filter: 'eq=gamma=1.1:saturation=1.3:brightness=0.05:contrast=1.2,colorbalance=rs=0.1:bs=-0.1',
                description: 'Professional cinematic color grading',
                category: 'color'
            },
            noir: {
                filter: 'eq=gamma=1.4:saturation=0:brightness=0.1:contrast=1.4,curves=preset=darker',
                description: 'Dramatic black and white film noir style',
                category: 'color'
            },
            cyberpunk: {
                filter: 'eq=gamma=0.9:saturation=1.8:brightness=0.1:contrast=1.3,colorbalance=rs=0.2:gs=-0.1:bs=0.3',
                description: 'Futuristic cyberpunk color palette',
                category: 'color'
            },

            // Motion effects - latest 2025 methods
            motionblur: {
                filter: "tmix=frames=8:weights='1 1 1 1 1 1 1 1',fps=fps=30",
                description: 'Smooth motion blur using temporal mixing',
                category: 'motion'
            },
            stabilize: {
                filter: 'deshake=x=64:y=64:w=608:h=448:rx=16:ry=16',
                description: 'Basic video stabilization using deshake filter',
                category: 'motion'
            },
            slowmotion: {
                filter: 'minterpolate=fps=60:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,setpts=PTS*2',
                description: 'AI-powered smooth slow motion with interpolation',
                category: 'motion'
            },
            timelapse: {
                filter: 'setpts=PTS*0.1,fps=fps=30',
                description: 'Fast timelapse effect with frame optimization',
                category: 'motion'
            },

            // Visual effects - 2025 trending styles
            glitch: {
                filter: 'rgbashift=rh=-6:gh=6:bv=4,noise=c0s=15:allf=t+u,eq=gamma=0.9:saturation=1.4',
                description: 'Digital glitch effect with RGB channel shift',
                category: 'fx'
            },
            vhs: {
                filter: 'rgbashift=rh=-3:gh=3,noise=c0s=8:allf=t,eq=gamma=1.1:saturation=0.9:contrast=0.9',
                description: 'Authentic VHS tape aesthetic with tracking errors',
                category: 'fx'
            },
            neon: {
                filter: 'eq=gamma=0.8:saturation=2.0:brightness=0.2:contrast=1.4,gblur=sigma=3,eq=saturation=2.5',
                description: 'Vibrant neon glow effect for modern aesthetics',
                category: 'fx'
            },
            mirror: {
                filter: 'crop=iw/2:ih:0:0,split[left][tmp];[tmp]hflip[right];[left][right]hstack',
                description: 'Mirror effect splitting video in half',
                category: 'fx'
            },
            kaleidoscope: {
                filter: 'crop=iw/3:ih/3:0:0,split=6[s0][s1][s2][s3][s4][s5];[s1]hflip[s1h];[s2]vflip[s2v];[s3]hflip,vflip[s3hv];[s4]transpose=1[s4t];[s5]transpose=2[s5t];[s0][s1h][s2v]hstack=3[top];[s3hv][s4t][s5t]hstack=3[bottom];[top][bottom]vstack',
                description: 'Psychedelic kaleidoscope pattern effect',
                category: 'fx'
            },

            // Enhancement effects - AI and modern techniques
            sharpen: {
                filter: 'unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=1.2:chroma_msize_x=3:chroma_msize_y=3:chroma_amount=0.8',
                description: 'Professional sharpening with luma and chroma control',
                category: 'enhance'
            },
            denoise: {
                filter: 'nlmeans=s=10:r=5:p=3,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3',
                description: 'AI-powered noise reduction with detail preservation',
                category: 'enhance'
            },
            upscale: {
                filter: 'scale=iw*2:ih*2:flags=lanczos,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.5',
                description: 'High-quality 2x upscaling with Lanczos algorithm',
                category: 'enhance'
            },
            dramatic: {
                filter: 'eq=gamma=1.3:saturation=1.4:brightness=0.1:contrast=1.5,unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=0.8',
                description: 'Dramatic enhancement for impactful visuals',
                category: 'enhance'
            },

            // Artistic effects - 2025 creative trends
            oilpainting: {
                filter: 'median=radius=3,unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=0.4,eq=saturation=1.3',
                description: 'Oil painting artistic effect with texture',
                category: 'artistic'
            },
            watercolor: {
                filter: 'boxblur=2:2,eq=saturation=1.4:gamma=1.1,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.3',
                description: 'Soft watercolor painting style',
                category: 'artistic'
            },
            sketch: {
                filter: 'eq=saturation=0,edgedetect=mode=canny:low=0.1:high=0.4,negate',
                description: 'Pencil sketch effect with edge detection',
                category: 'artistic'
            },

            // Blur and focus effects - 2025 latest methods
            blur: {
                filter: 'gblur=sigma=8:steps=3',
                description: 'High-quality Gaussian blur with improved performance',
                category: 'blur'
            },
            radialblur: {
                filter: 'dblur=angle=0:radius=15,dblur=angle=90:radius=15,dblur=angle=45:radius=10,dblur=angle=135:radius=10',
                description: 'Advanced radial blur using multiple directional passes',
                category: 'blur'
            },
            directionalblur: {
                filter: 'dblur=angle=0:radius=20',
                description: 'Directional motion blur - 2025 technique',
                category: 'blur'
            },
            verticalblur: {
                filter: 'dblur=angle=90:radius=15',
                description: 'Vertical directional blur effect',
                category: 'blur'
            },
            diagonalblur: {
                filter: 'dblur=angle=45:radius=18',
                description: 'Diagonal motion blur effect',
                category: 'blur'
            },
            tiltshift: {
                filter: 'smartblur=luma_radius=1.5:luma_strength=1.0:luma_threshold=0,gblur=sigma=12:enable=\'between(Y,H*0.3,H*0.7)\'',
                description: 'Professional tilt-shift miniature effect',
                category: 'blur'
            },
            focusblur: {
                filter: 'smartblur=luma_radius=2.0:luma_strength=0.8:luma_threshold=32:chroma_radius=1.5:chroma_strength=0.6',
                description: 'Smart focus blur with edge preservation',
                category: 'blur'
            },
            motionblur_advanced: {
                filter: 'tmix=frames=12:weights=\'1 1 1 1 1 1 1 1 1 1 1 1\':scale=1,fps=fps=30',
                description: 'Advanced motion blur using temporal mixing - 2025 method',
                category: 'blur'
            }
        };
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        
        // Check if FFmpeg is available
        try {
            const { exec } = require('child_process');
            await new Promise((resolve, reject) => {
                exec('ffmpeg -version', (error, stdout, stderr) => {
                    if (error) {
                        console.log('⚠️ FFmpeg not found - video effects may not work');
                        reject(error);
                    } else {
                        console.log('✅ Video Effects plugin loaded (FFmpeg available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Video Effects plugin loaded (FFmpeg check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        // Register individual effect commands with "video editing" category
        // Prefix with 'v' to avoid collisions with other plugins
        Object.keys(this.effects).forEach(effect => {
            const commandName = `v${effect}`;
            this.bot.messageHandler.registerCommand(commandName, 
                (messageInfo) => this.applyEffect(messageInfo, effect), {
                description: this.effects[effect].description,
                usage: `${config.PREFIX}${commandName} (reply to video)`,
                category: 'video effects',
                plugin: 'video-effects',
                source: 'video-effects.js'
            });
        });
    }

    async applyEffect(messageInfo, effectName) {
        let inputPath = null;
        let outputPath = null;

        try {
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video message.');
                return;
            }

            if (!quotedMessage.videoMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video message.');
                return;
            }

            // Download video
            const media = await this.downloadMediaRobust(messageInfo, quotedMessage, 'videoMessage');
            
            if (!media?.buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process video. Please try again.');
                return;
            }

            // Setup file paths in tmp/
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `video_input_${timestamp}.mp4`);
            outputPath = path.join(process.cwd(), 'tmp', `video_effect_${effectName}_${timestamp}.mp4`);

            // Write input file
            await fs.writeFile(inputPath, media.buffer);

            // Apply video effect using FFmpeg with 2025 techniques
            const effect = this.effects[effectName];
            let command = `ffmpeg -i "${inputPath}" -map 0:v:0 -map 0:a? -vf "${effect.filter}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k "${outputPath}"`;
            
            // Execute FFmpeg command with enhanced buffer for video processing
            await new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 100 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg video effect error:', stderr);
                        reject(new Error(`Video effect failed: ${stderr}`));
                    } else {
                        resolve();
                    }
                });
            });

            // Check if output file exists and has content
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output video is empty');
            }

            // Send processed video
            const effect_info = this.effects[effectName];
            
            const videoMessage = {
                video: { url: outputPath },
                mimetype: 'video/mp4',
                caption: `${effectName.toUpperCase()}`,
            };

            await this.bot.sock.sendMessage(messageInfo.sender, videoMessage);

        } catch (error) {
            console.error(`Video effect ${effectName} error:`, error);
            let errorMessage = `❌ Error applying ${effectName} effect.`;
            
            if (error.message.includes('FFmpeg')) {
                errorMessage += ' FFmpeg may not be installed or filter not supported.';
            } else if (error.message.includes('format')) {
                errorMessage += ' Video format not supported.';
            } else if (error.message.includes('empty')) {
                errorMessage += ' Processing resulted in empty video.';
            }
            
            await this.bot.messageHandler.reply(messageInfo, errorMessage);
        } finally {
            // Enhanced cleanup with multiple attempts
            const filesToClean = [inputPath, outputPath];
            
            for (const filePath of filesToClean) {
                if (filePath) {
                    try {
                        if (await fs.pathExists(filePath)) {
                            await fs.unlink(filePath);
                        }
                    } catch (cleanupError) {
                        console.log(`Cleanup warning: ${cleanupError.message}`);
                        // Force cleanup attempt
                        setTimeout(async () => {
                            try {
                                if (await fs.pathExists(filePath)) {
                                    await fs.unlink(filePath);
                                }
                            } catch (e) {
                                // Silent failure for delayed cleanup
                            }
                        }, 5000);
                    }
                }
            }
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
            console.error('Video download failed:', error);
            return null;
        }
    }
}

const videoEffectsPlugin = new VideoEffectsPlugin();

module.exports = {
    init: videoEffectsPlugin.init.bind(videoEffectsPlugin),
    name: videoEffectsPlugin.name,
    description: videoEffectsPlugin.description,
    version: videoEffectsPlugin.version
};