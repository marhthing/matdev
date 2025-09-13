
/**
 * MATDEV Voice Changer Plugin
 * Apply various voice effects to audio messages
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class VoiceChangerPlugin {
    constructor() {
        this.name = 'voice-changer';
        this.description = 'Apply voice effects to audio messages';
        this.version = '1.0.0';
        
        this.effects = {
            robot: 'aformat=sample_rates=8000:sample_fmts=s16,volume=1.5',
            chipmunk: 'asetrate=r=44100*1.5,aresample=44100',
            deep: 'asetrate=r=44100*0.7,aresample=44100',
            echo: 'aecho=0.8:0.9:1000:0.3',
            reverb: 'aecho=0.8:0.88:60:0.4',
            whisper: 'volume=0.3,highpass=f=300',
            demon: 'asetrate=r=44100*0.6,aresample=44100,volume=1.3'
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
                        console.log('⚠️ FFmpeg not found - voice effects may not work');
                        reject(error);
                    } else {
                        console.log('✅ Voice Changer plugin loaded (FFmpeg available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Voice Changer plugin loaded (FFmpeg check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        // Main voice command with effect parameter
        this.bot.messageHandler.registerCommand('voice', this.voiceMainCommand.bind(this), {
            description: 'Apply voice effects to audio',
            usage: `${config.PREFIX}voice <effect> (reply to audio) OR ${config.PREFIX}voice (to list effects)`,
            category: 'media',
            plugin: 'voice-changer',
            source: 'voice-changer.js'
        });
    }

    async voiceMainCommand(messageInfo) {
        const text = messageInfo.body.split(' ').slice(1).join(' ').toLowerCase();
        
        if (!text) {
            const effectsList = Object.keys(this.effects).map(effect => `• ${effect}`).join('\n');
            await this.bot.messageHandler.reply(messageInfo, 
                `🎵 *Available Voice Effects:*\n\n${effectsList}\n\n📝 *Usage:* ${config.PREFIX}voice <effect> (reply to audio)\n💡 *Example:* ${config.PREFIX}voice robot`);
            return;
        }

        if (!this.effects[text]) {
            const effectsList = Object.keys(this.effects).map(effect => `• ${effect}`).join('\n');
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Invalid effect: *${text}*\n\n🎵 *Available effects:*\n${effectsList}\n\n📝 Usage: ${config.PREFIX}voice <effect> (reply to audio)`);
            return;
        }

        await this.voiceChangeCommand(messageInfo, text);
    }

    async voiceChangeCommand(messageInfo, effectType) {
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
            outputPath = path.join(process.cwd(), 'tmp', `voice_${effectType}_${timestamp}.ogg`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Apply voice effect using FFmpeg with better error handling
            const effect = this.effects[effectType];
            let command = `ffmpeg -i "${inputPath}" -af "${effect}" -c:a libopus -b:a 64k "${outputPath}"`;
            
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
                command = `ffmpeg -i "${inputPath}" -af "${effect}" -c:a mp3 -b:a 64k "${mp3OutputPath}"`;
                
                await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error('FFmpeg MP3 error:', stderr);
                            reject(new Error(`Voice effect failed: ${stderr}`));
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

            // Send processed audio as voice note with proper mimetype
            const isMP3 = outputPath.endsWith('.mp3');
            const audioMessage = {
                audio: { url: outputPath },
                mimetype: isMP3 ? 'audio/mpeg' : 'audio/ogg; codecs=opus',
                ptt: true,
                contextInfo: {
                    externalAdReply: {
                        title: `🎵 Voice Effect: ${effectType.toUpperCase()}`,
                        body: 'MATDEV Voice Changer',
                        showAdAttribution: false
                    }
                }
            };

            await this.bot.sock.sendMessage(messageInfo.sender, audioMessage);

        } catch (error) {
            console.error('Voice changer error:', error);
            let errorMessage = `❌ Error applying ${effectType} effect.`;
            
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

const voiceChangerPlugin = new VoiceChangerPlugin();

module.exports = {
    init: voiceChangerPlugin.init.bind(voiceChangerPlugin),
    name: voiceChangerPlugin.name,
    description: voiceChangerPlugin.description,
    version: voiceChangerPlugin.version
};
