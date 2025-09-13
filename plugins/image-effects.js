
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const config = require('../config');

class ImageEffectsPlugin {
    constructor() {
        this.name = 'image-effects';
        this.description = 'Advanced image effects using modern processing techniques';
        this.version = '2.0.0';
        this.effects = {
            // Color grading effects
            vintage: {
                filter: 'eq=gamma=1.3:saturation=0.8:brightness=0.1:contrast=1.1,curves=vintage,noise=c0s=5:allf=t',
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
            warm: {
                filter: 'eq=gamma=1.1:saturation=1.2:brightness=0.05,colorbalance=rs=0.15:gs=0.05:bs=-0.1',
                description: 'Warm sunset color temperature',
                category: 'color'
            },
            cool: {
                filter: 'eq=gamma=1.05:saturation=1.1:brightness=0.02,colorbalance=rs=-0.1:gs=0.02:bs=0.15',
                description: 'Cool blue color temperature',
                category: 'color'
            },

            // Visual effects
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
                description: 'Mirror effect splitting image in half',
                category: 'fx'
            },
            kaleidoscope: {
                filter: 'crop=iw/3:ih/3:0:0,split=6[s0][s1][s2][s3][s4][s5];[s1]hflip[s1h];[s2]vflip[s2v];[s3]hflip,vflip[s3hv];[s4]transpose=1[s4t];[s5]transpose=2[s5t];[s0][s1h][s2v]hstack=3[top];[s3hv][s4t][s5t]hstack=3[bottom];[top][bottom]vstack',
                description: 'Psychedelic kaleidoscope pattern effect',
                category: 'fx'
            },
            prism: {
                filter: 'split=3[r][g][b];[r]lutrgb=r=val:g=0:b=0,pad=iw+20:ih:10:0:red[rshift];[g]lutrgb=r=0:g=val:b=0,pad=iw+20:ih:0:0:green[gshift];[b]lutrgb=r=0:g=0:b=val,pad=iw+20:ih:-10:0:blue[bshift];[rshift][gshift]blend=all_mode=screen[rg];[rg][bshift]blend=all_mode=screen',
                description: 'Chromatic prism color separation',
                category: 'fx'
            },

            // Enhancement effects
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
            dramatic: {
                filter: 'eq=gamma=1.3:saturation=1.4:brightness=0.1:contrast=1.5,unsharp=luma_msize_x=7:luma_msize_y=7:luma_amount=0.8',
                description: 'Dramatic enhancement for impactful visuals',
                category: 'enhance'
            },
            hdr: {
                filter: 'eq=gamma=1.2:saturation=1.3:contrast=1.4,unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.6',
                description: 'HDR-style high dynamic range effect',
                category: 'enhance'
            },
            vibrant: {
                filter: 'eq=saturation=1.5:contrast=1.2:brightness=0.05,unsharp=luma_msize_x=3:luma_msize_y=3:luma_amount=0.4',
                description: 'Enhanced vibrancy and color pop',
                category: 'enhance'
            },

            // Artistic effects
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
            cartoon: {
                filter: 'bilateral=sigmaS=80:sigmaR=0.8,eq=saturation=1.6:contrast=1.3,unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=0.5',
                description: 'Cartoon-style smoothing and color enhancement',
                category: 'artistic'
            },
            pop: {
                filter: 'eq=saturation=2.0:contrast=1.5:brightness=0.1,unsharp=luma_msize_x=5:luma_msize_y=5:luma_amount=1.0',
                description: 'Pop art style with bold colors and contrast',
                category: 'artistic'
            },

            // Blur and focus effects
            blur: {
                filter: 'gblur=sigma=5',
                description: 'Gaussian blur effect',
                category: 'blur'
            },
            motionblur: {
                filter: 'mblur=radius=10:angle=45',
                description: 'Motion blur with directional effect',
                category: 'blur'
            },
            tiltshift: {
                filter: 'split[main][blur];[blur]gblur=sigma=8[blurred];[main][blurred]blend=all_expr=\'if(between(Y,H*0.3,H*0.7),A,B)\'',
                description: 'Tilt-shift miniature effect',
                category: 'blur'
            },
            radialblur: {
                filter: 'split[main][blur];[blur]gblur=sigma=12[blurred];[main][blurred]blend=all_expr=\'if(hypot(X-W/2,Y-H/2)<min(W,H)/4,A,B)\'',
                description: 'Radial blur focusing on center',
                category: 'blur'
            },

            // Vintage and retro effects
            film: {
                filter: 'curves=vintage,noise=c0s=3:allf=t,eq=gamma=1.2:saturation=0.9:contrast=1.1',
                description: 'Classic film grain and color',
                category: 'vintage'
            },
            polaroid: {
                filter: 'eq=gamma=1.15:saturation=1.1:brightness=0.08:contrast=1.05,pad=iw+40:ih+60:20:20:white',
                description: 'Polaroid instant photo style with border',
                category: 'vintage'
            },
            faded: {
                filter: 'eq=gamma=1.3:saturation=0.7:brightness=0.15:contrast=0.9,curves=lighter',
                description: 'Faded vintage photo look',
                category: 'vintage'
            },

            // Special transformations
            fisheye: {
                filter: 'lenscorrection=cx=0.5:cy=0.5:k1=-0.227:k2=-0.022',
                description: 'Fisheye lens distortion effect',
                category: 'transform'
            },
            swirl: {
                filter: 'rotate=a=\'t*PI/180\':fillcolor=black:bilinear=0',
                description: 'Swirl rotation effect',
                category: 'transform'
            },
            flip: {
                filter: 'hflip',
                description: 'Horizontal flip/mirror',
                category: 'transform'
            },
            flop: {
                filter: 'vflip',
                description: 'Vertical flip',
                category: 'transform'
            }
        };
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        
        // Check if FFmpeg is available
        try {
            await new Promise((resolve, reject) => {
                exec('ffmpeg -version', (error, stdout, stderr) => {
                    if (error) {
                        console.log('⚠️ FFmpeg not found - image effects may not work');
                        reject(error);
                    } else {
                        console.log('✅ Image Effects plugin loaded (FFmpeg available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Image Effects plugin loaded (FFmpeg check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        // Register individual effect commands with "image editing" category
        // Prefix with 'i' to avoid collisions with other plugins
        Object.keys(this.effects).forEach(effect => {
            const commandName = `i${effect}`;
            this.bot.messageHandler.registerCommand(commandName, 
                (messageInfo) => this.applyEffect(messageInfo, effect), {
                description: this.effects[effect].description,
                usage: `${config.PREFIX}${commandName} (reply to image)`,
                category: 'image editing',
                plugin: 'image-effects',
                source: 'image-effects.js'
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
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image message.');
                return;
            }

            if (!quotedMessage.imageMessage && !quotedMessage.stickerMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an image or sticker message.');
                return;
            }

            // Download image
            const media = await this.downloadMediaRobust(messageInfo, quotedMessage, quotedMessage.imageMessage ? 'imageMessage' : 'stickerMessage');
            
            if (!media?.buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process image. Please try again.');
                return;
            }

            // Setup file paths in tmp/
            const timestamp = Date.now();
            const inputExt = quotedMessage.imageMessage ? 'jpg' : 'webp';
            inputPath = path.join(process.cwd(), 'tmp', `image_input_${timestamp}.${inputExt}`);
            outputPath = path.join(process.cwd(), 'tmp', `image_effect_${effectName}_${timestamp}.jpg`);

            // Write input file
            await fs.writeFile(inputPath, media.buffer);

            // Apply image effect using FFmpeg
            const effect = this.effects[effectName];
            let command = `ffmpeg -i "${inputPath}" -vf "${effect.filter}" -q:v 2 -pix_fmt yuv420p "${outputPath}"`;
            
            // Execute FFmpeg command
            await new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg image effect error:', stderr);
                        reject(new Error(`Image effect failed: ${stderr}`));
                    } else {
                        resolve();
                    }
                });
            });

            // Check if output file exists and has content
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output image is empty');
            }

            // Send processed image
            const imageMessage = {
                image: { url: outputPath },
                caption: `${effectName.toUpperCase()}`,
            };

            await this.bot.sock.sendMessage(messageInfo.sender, imageMessage);

        } catch (error) {
            console.error(`Image effect ${effectName} error:`, error);
            let errorMessage = `❌ Error applying ${effectName} effect.`;
            
            if (error.message.includes('FFmpeg')) {
                errorMessage += ' FFmpeg may not be installed or filter not supported.';
            } else if (error.message.includes('format')) {
                errorMessage += ' Image format not supported.';
            } else if (error.message.includes('empty')) {
                errorMessage += ' Processing resulted in empty image.';
            }
            
            await this.bot.messageHandler.reply(messageInfo, errorMessage);
        } finally {
            // Cleanup
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
            console.error('Image download failed:', error);
            return null;
        }
    }
}

const imageEffectsPlugin = new ImageEffectsPlugin();

module.exports = {
    init: imageEffectsPlugin.init.bind(imageEffectsPlugin),
    name: imageEffectsPlugin.name,
    description: imageEffectsPlugin.description,
    version: imageEffectsPlugin.version
};
