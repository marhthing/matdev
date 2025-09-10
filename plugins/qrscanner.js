
/**
 * MATDEV QR Scanner Plugin
 * Read and decode QR codes from images
 */

const QrReader = require('qrcode-reader');
const Jimp = require('jimp').default || require('jimp');
const { downloadMediaMessage } = require('baileys');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class QRScannerPlugin {
    constructor() {
        this.name = 'qrscanner';
        this.description = 'QR code scanner and decoder';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ QR Scanner plugin loaded');
    }

    /**
     * Register QR Scanner commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('qrscan', this.scanQR.bind(this), {
            description: 'Scan QR code from image',
            usage: `${config.PREFIX}qrscan (reply to image or send with image)`,
            category: 'utility',
            plugin: 'qrscanner',
            source: 'qrscanner.js'
        });
    }

    /**
     * Scan QR code from image
     */
    async scanQR(messageInfo) {
        let tempFile;
        try {
            let imageMessage = null;
            let imageBuffer = null;

            // Check if current message has an image
            if (messageInfo.message?.imageMessage) {
                imageMessage = messageInfo.message.imageMessage;
            }

            // Check if replying to an image message
            if (!imageMessage) {
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                    messageInfo.message?.quotedMessage;
                
                if (quotedMessage?.imageMessage) {
                    imageMessage = quotedMessage.imageMessage;
                    
                    // Create a fake message object for downloadMediaMessage
                    const fakeMessage = {
                        key: {
                            remoteJid: messageInfo.chat_jid,
                            fromMe: false,
                            id: 'fake-' + Date.now()
                        },
                        message: {
                            imageMessage: quotedMessage.imageMessage
                        }
                    };
                    
                    try {
                        imageBuffer = await downloadMediaMessage(fakeMessage, 'buffer', {});
                    } catch (downloadError) {
                        console.error('Error downloading quoted image:', downloadError);
                    }
                }
            }

            // If we have an imageMessage but no buffer yet, download it
            if (imageMessage && !imageBuffer) {
                try {
                    imageBuffer = await downloadMediaMessage({
                        key: messageInfo.key,
                        message: { imageMessage }
                    }, 'buffer', {});
                } catch (downloadError) {
                    console.error('Error downloading current image:', downloadError);
                }
            }

            if (!imageMessage || !imageBuffer) {
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please send an image with QR code or reply to an image!\n\n` +
                    `💡 *Usage examples:*\n` +
                    `• Send image with caption: ${config.PREFIX}qrscan\n` +
                    `• Reply to image: ${config.PREFIX}qrscan\n\n` +
                    `_Supports PNG, JPEG, and WebP images_`
                );
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '🔍 *Scanning QR code...*\n\n⏳ Processing image...'
            });

            // Create temporary file for processing
            tempFile = path.join(__dirname, '..', 'tmp', `qrscan_${Date.now()}.jpg`);
            await fs.ensureDir(path.dirname(tempFile));
            await fs.writeFile(tempFile, imageBuffer);

            try {
                // Read and process image with Jimp
                const image = await Jimp.read(tempFile);
                
                // Enhance image for better QR detection
                image
                    .contrast(0.3)      // Increase contrast
                    .brightness(0.1)    // Slight brightness boost
                    .quality(100);      // Maximum quality

                // Create QR reader
                const qr = new QrReader();
                
                // Scan QR code
                const result = await new Promise((resolve, reject) => {
                    qr.callback = (err, value) => {
                        if (err) {
                            // Try with different image processing
                            const enhancedImage = image.clone()
                                .greyscale()        // Convert to grayscale
                                .contrast(0.5)      // Higher contrast
                                .normalize();       // Normalize brightness
                            
                            // Try again with enhanced image
                            const qr2 = new QrReader();
                            qr2.callback = (err2, value2) => {
                                if (err2) {
                                    reject(new Error('No QR code found in image'));
                                } else {
                                    resolve(value2);
                                }
                            };
                            qr2.decode(enhancedImage.bitmap);
                        } else {
                            resolve(value);
                        }
                    };
                    qr.decode(image.bitmap);
                });

                // Format the result
                let responseText = `✅ *QR Code Decoded Successfully!*\n\n`;
                responseText += `📄 *Content:*\n${result.result}\n\n`;
                
                // Analyze content type
                const content = result.result;
                let contentType = '📝 Text';
                
                if (content.startsWith('http://') || content.startsWith('https://')) {
                    contentType = '🔗 URL/Website';
                } else if (content.startsWith('mailto:')) {
                    contentType = '📧 Email';
                } else if (content.startsWith('tel:')) {
                    contentType = '📞 Phone Number';
                } else if (content.startsWith('sms:')) {
                    contentType = '💬 SMS';
                } else if (content.startsWith('wifi:')) {
                    contentType = '📶 WiFi Configuration';
                } else if (content.includes('BEGIN:VCARD')) {
                    contentType = '👤 Contact Card (vCard)';
                } else if (content.includes('BEGIN:VEVENT')) {
                    contentType = '📅 Calendar Event';
                } else if (/^\d+$/.test(content)) {
                    contentType = '🔢 Number/Code';
                }
                
                responseText += `🏷️ *Type:* ${contentType}\n`;
                responseText += `📏 *Length:* ${content.length} characters\n\n`;
                
                // Add action suggestions based on content type
                if (content.startsWith('http')) {
                    responseText += `💡 *Quick Actions:*\n`;
                    responseText += `• Click the link to open in browser\n`;
                    responseText += `• Copy link for sharing\n`;
                } else if (content.startsWith('mailto:')) {
                    responseText += `💡 *Email detected:* ${content.replace('mailto:', '')}\n`;
                } else if (content.startsWith('tel:')) {
                    responseText += `💡 *Phone detected:* ${content.replace('tel:', '')}\n`;
                }
                
                responseText += `\n_🔧 Scanned by: ${config.BOT_NAME}_`;

                // Update the processing message with results
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: responseText,
                    edit: processingMsg.key
                });

            } catch (scanError) {
                console.error('QR scan error:', scanError);
                
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ *No QR code found in image*\n\n' +
                          '💡 *Tips for better scanning:*\n' +
                          '• Ensure QR code is clearly visible\n' +
                          '• Good lighting and contrast\n' +
                          '• QR code should not be too small\n' +
                          '• Avoid blurry or distorted images\n\n' +
                          '_Try with a clearer image of the QR code_',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Error in QR scanner:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Error processing image for QR scanning.\n\n' +
                '_Please ensure the image is valid and try again._'
            );
        } finally {
            // Clean up temp file
            if (tempFile) {
                await fs.unlink(tempFile).catch(() => {});
            }
        }
    }

    /**
     * Get file extension from mime type
     */
    getFileExtension(mimetype) {
        const mimeMap = {
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp',
            'image/gif': 'gif'
        };
        return mimeMap[mimetype] || 'jpg';
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        console.log('🧹 QR Scanner plugin cleanup completed');
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new QRScannerPlugin();
        await plugin.init(bot);
        return plugin;
    }
};
