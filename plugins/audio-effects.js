
/**
 * MATDEV Audio Effects Plugin
 * Apply various voice and audio effects to audio messages
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class AudioEffectsPlugin {
    constructor() {
        this.name = 'audio-effects';
        this.description = 'Apply various voice and audio effects to audio messages';
        this.version = '2.0.0';
        
        this.effects = {
            // Voice effects - greatly improved with modern techniques
            robot: {
                filter: 'aformat=sample_rates=8000:sample_fmts=s16,dynaudnorm=p=0.9:s=5,tremolo=f=5:d=0.5,volume=1.8',
                description: 'Advanced robotic voice with tremolo modulation',
                category: 'voice'
            },
            chipmunk: {
                filter: 'asetrate=r=44100*1.8,aresample=44100,dynaudnorm=p=0.95:s=3,highpass=f=200,volume=1.2',
                description: 'Enhanced high-pitched chipmunk voice',
                category: 'voice'
            },
            deep: {
                filter: 'asetrate=r=44100*0.6,aresample=44100,dynaudnorm=p=0.9:s=5,lowpass=f=2000,volume=1.4',
                description: 'Deep demonic voice with enhanced bass',
                category: 'voice'
            },
            echo: {
                filter: 'aecho=0.8:0.9:1000:0.5,aecho=0.8:0.7:1500:0.3,dynaudnorm=p=0.8:s=7',
                description: 'Multi-layer echo with dynamic processing',
                category: 'voice'
            },
            reverb: {
                filter: 'aecho=0.8:0.88:60:0.4,aecho=0.7:0.82:180:0.3,aecho=0.6:0.75:400:0.2,dynaudnorm=p=0.85:s=6',
                description: 'Professional cathedral reverb effect',
                category: 'voice'
            },
            whisper: {
                filter: 'volume=0.4,highpass=f=400,dynaudnorm=p=0.95:s=2,compand=attacks=0:points=-60/-60|-30/-20|-10/-10|0/-5:gain=3',
                description: 'Enhanced whisper with compression',
                category: 'voice'
            },
            demon: {
                filter: 'asetrate=r=44100*0.5,aresample=44100,dynaudnorm=p=0.9:s=5,lowpass=f=1500,overdrive=10:0.3,volume=1.6',
                description: 'Terrifying demonic voice with distortion',
                category: 'voice'
            },
            alien: {
                filter: 'asetrate=44100*0.85,aresample=44100,chorus=0.5:0.9:50:0.4:0.25:2,tremolo=f=3:d=0.3,phaser=in_gain=0.4:out_gain=0.74:delay=3:speed=0.5:decay=0.4',
                description: 'Advanced alien voice with phaser and modulation',
                category: 'voice'
            },
            
            // Speed effects - enhanced with dynamic processing
            slow: {
                filter: 'atempo=0.5,dynaudnorm=p=0.9:s=10,compand=attacks=0.1:points=-90/-90|-60/-40|-30/-20|-10/-10|0/-5:gain=2',
                description: 'Slow motion with enhanced clarity',
                category: 'speed'
            },
            fast: {
                filter: 'atempo=2.0,dynaudnorm=p=0.95:s=3,highpass=f=100,volume=1.1',
                description: 'Fast playback with clarity enhancement',
                category: 'speed'
            },
            nightcore: {
                filter: 'asetrate=44100*1.3,aresample=44100,dynaudnorm=p=0.9:s=5,anequalizer=f=2000:width_type=h:width=1000:g=3',
                description: 'Professional nightcore with vocal enhancement',
                category: 'speed'
            },
            
            // EQ effects - professional grade processing
            bass: {
                filter: 'dynaudnorm=p=0.9:s=5,anequalizer=f=60:width_type=h:width=40:g=8,anequalizer=f=120:width_type=h:width=60:g=6,volume=0.9',
                description: 'Professional bass boost with dynamic processing',
                category: 'eq'
            },
            treble: {
                filter: 'dynaudnorm=p=0.9:s=5,anequalizer=f=3000:width_type=h:width=1500:g=6,anequalizer=f=6000:width_type=h:width=2000:g=4,volume=0.9',
                description: 'Enhanced treble with presence boost',
                category: 'eq'
            },
            
            // FX effects - advanced processing chains
            distortion: {
                filter: 'overdrive=20:0.4,dynaudnorm=p=0.8:s=7,anequalizer=f=1000:width_type=h:width=800:g=3,volume=0.8',
                description: 'Heavy distortion with frequency shaping',
                category: 'fx'
            },
            underwater: {
                filter: 'lowpass=f=800,chorus=0.5:0.9:50:0.4:0.25:2,tremolo=f=2:d=0.4,volume=0.7',
                description: 'Realistic underwater effect with modulation',
                category: 'fx'
            },
            telephone: {
                filter: 'highpass=f=400,lowpass=f=2800,dynaudnorm=p=0.9:s=5,compand=attacks=0:points=-60/-60|-40/-30|-20/-15|-10/-10|0/-8:gain=4,volume=1.3',
                description: 'Authentic telephone/radio effect with compression',
                category: 'fx'
            },
            psychedelic: {
                filter: 'phaser=in_gain=0.4:out_gain=0.74:delay=3:speed=0.5:decay=0.4,chorus=0.5:0.9:50:0.4:0.25:2,tremolo=f=4:d=0.5',
                description: 'Trippy psychedelic effect with multiple modulations',
                category: 'fx'
            },
            vintage: {
                filter: 'highpass=f=100,lowpass=f=5000,dynaudnorm=p=0.85:s=8,compand=attacks=0.1:points=-90/-90|-50/-40|-30/-25|-15/-15|0/-10:gain=3,volume=1.1',
                description: 'Vintage analog sound with warmth',
                category: 'fx'
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
                        console.log('⚠️ FFmpeg not found - audio effects may not work');
                        reject(error);
                    } else {
                        console.log('✅ Audio Effects plugin loaded (FFmpeg available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Audio Effects plugin loaded (FFmpeg check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        // Register individual effect commands with "audio" category
        Object.keys(this.effects).forEach(effect => {
            this.bot.messageHandler.registerCommand(effect, 
                (messageInfo) => this.applyEffect(messageInfo, effect), {
                description: this.effects[effect].description,
                usage: `${config.PREFIX}${effect} (reply to audio)`,
                category: 'audio',
                plugin: 'audio-effects',
                source: 'voice-changer.js'
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
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or voice message.');
                return;
            }

            if (!quotedMessage.audioMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or voice message.');
                return;
            }

            // Download audio
            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, 'audioMessage');
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process audio. Please try again.');
                return;
            }

            // Setup file paths
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `input_${timestamp}.ogg`);
            outputPath = path.join(process.cwd(), 'tmp', `effect_${effectName}_${timestamp}.ogg`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Apply audio effect using FFmpeg with better error handling
            const effect = this.effects[effectName];
            let command = `ffmpeg -i "${inputPath}" -af "${effect.filter}" -c:a libopus -b:a 64k "${outputPath}"`;
            
            // Fallback to MP3 if opus fails
            try {
                await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error('FFmpeg opus error:', stderr);
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            } catch (opusError) {
                console.log('⚠️ Opus encoding failed, trying MP3 fallback...');
                const mp3OutputPath = outputPath.replace('.ogg', '.mp3');
                command = `ffmpeg -i "${inputPath}" -af "${effect.filter}" -c:a mp3 -b:a 64k "${mp3OutputPath}"`;
                
                await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error('FFmpeg MP3 error:', stderr);
                            reject(new Error(`Audio effect failed: ${stderr}`));
                        } else {
                            // Update output path to MP3 version
                            if (outputPath !== mp3OutputPath) {
                                try {
                                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                                } catch (e) {}
                                outputPath = mp3OutputPath;
                            }
                            resolve();
                        }
                    });
                });
            }

            // Send processed audio
            const isMP3 = outputPath.endsWith('.mp3');
            const isVoiceEffect = effect.category === 'voice';
            
            const audioMessage = {
                audio: { url: outputPath },
                mimetype: isMP3 ? 'audio/mpeg' : 'audio/ogg; codecs=opus',
                ptt: isVoiceEffect, // Voice effects as voice notes, others as audio files
                contextInfo: {
                    externalAdReply: {
                        title: `🎛️ ${effectName.toUpperCase()} Effect`,
                        body: `${effect.description} | MATDEV`,
                        showAdAttribution: false
                    }
                }
            };

            await this.bot.sock.sendMessage(messageInfo.sender, audioMessage);

        } catch (error) {
            console.error(`Audio effect ${effectName} error:`, error);
            let errorMessage = `❌ Error applying ${effectName} effect.`;
            
            if (error.message.includes('FFmpeg')) {
                errorMessage += ' FFmpeg may not be installed.';
            } else if (error.message.includes('format')) {
                errorMessage += ' Audio format not supported.';
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
            console.error('Download failed:', error);
            return null;
        }
    }
}

const audioEffectsPlugin = new AudioEffectsPlugin();

module.exports = {
    init: audioEffectsPlugin.init.bind(audioEffectsPlugin),
    name: audioEffectsPlugin.name,
    description: audioEffectsPlugin.description,
    version: audioEffectsPlugin.version
};
